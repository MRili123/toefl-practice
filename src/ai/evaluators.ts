import type { DiscussionTask, EmailTask, InterviewTask, ListenRepeatTask, SpeakingMeta } from "@/engine/bank/types";
import { AI_CONFIG } from "./config";
import type { Correction, Criterion, InterviewFeedback, RepeatFeedback, WritingFeedback } from "./feedbackTypes";
import { ollamaJson } from "./ollama";
import { discussionPrompt, emailPrompt, INTERVIEW_SYSTEM, interviewPrompt, WRITING_SYSTEM } from "./prompts";
import { CRITERION_LABELS, interviewLlmSchema, writingLlmSchema } from "./schemas";
import { alignWords, deliveryMetrics, normalizeWords, repeatScore } from "./speechAnalysis";
import { isRareWord } from "@/engine/exercises/wordLevel";
import { findSpellingErrors, isKnownWord, typoDistance } from "./spelling";
import { type Edit, splitIntoEdits } from "./edits";
import type { SttResult } from "./stt";

export interface EvalOutcome<F> {
  score: number;
  feedback: F;
  model: string | null;
}

const half = (x: number) => Math.max(0, Math.min(5, Math.round(x * 2) / 2));
export const countWords = (t: string) => (t.trim().match(/\S+/g) ?? []).length;

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

type Span = { start: number; end: number };
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Types a single word-level edit; the model often labels a whole sentence with one type. */
function editCorrection(e: Edit, parent: Correction, siblings: number): Correction {
  const base = {
    original: e.original, suggestion: e.suggestion, start: e.start, end: e.end, source: "model" as const,
    ...(parent.category ? { category: parent.category } : {}),
  };
  if (e.kind === "capitalization") return { ...base, type: "capitalization", explanation: `Capitalization: write “${e.suggestion}”.` };
  if (e.kind === "punctuation") return { ...base, type: "punctuation", explanation: `Punctuation: “${e.original}” → “${e.suggestion}”.` };
  const single = !/\s/.test(e.original) && /^[\p{L}’'-]+$/u.test(e.original);
  if (single && !isKnownWord(e.original) && !isKnownWord(e.original.toLowerCase())) {
    return { ...base, type: "spelling", explanation: `“${e.original}” is misspelled.` };
  }
  const explanation =
    siblings > 1 ? `Change “${e.original}” to “${e.suggestion}”. Note on this sentence: ${parent.explanation}` : parent.explanation;
  return { ...base, type: parent.type === "spelling" ? "vocabulary" : parent.type, explanation };
}

/**
 * Turns model corrections into individual, positioned edits: each quoted span is located in the text
 * (first occurrence whose edits are not already claimed) and diffed against its suggestion word by
 * word. Edits that merely repeat a spell-checker finding are dropped.
 */
export function placeCorrections(corrections: Correction[], source: string, spelling: Correction[] = []): Correction[] {
  const placed: Correction[] = [];
  const taken: Span[] = [];
  const duplicatesSpelling = (c: Correction) =>
    spelling.some(
      (s) =>
        overlaps(s as Span, c as Span) &&
        (c.type === "spelling" || c.type === "capitalization" || c.suggestion.toLowerCase() === s.suggestion.toLowerCase()),
    );

  for (const c of corrections) {
    const words = c.original.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || squash(c.original) === squash(c.suggestion)) continue;
    const re = new RegExp(words.map(escapeRe).join("\\s+"), "gi");
    for (const m of source.matchAll(re)) {
      const raw = splitIntoEdits(m[0], m.index!, c.suggestion);
      const edits = raw.map((e) => editCorrection(e, c, raw.length));
      if (edits.length === 0 || edits.some((e) => taken.some((t) => overlaps(t, e as Span)))) continue;
      for (const e of edits) {
        if (duplicatesSpelling(e)) continue;
        taken.push(e as Span);
        placed.push(e);
      }
      break;
    }
  }
  return placed;
}

export function spellingCorrections(text: string, known: string[]): Correction[] {
  return findSpellingErrors(text, known).map((s) => ({
    original: s.word,
    suggestion: s.suggestion ?? s.word,
    explanation: s.suggestion
      ? s.suggestion.toLowerCase() === s.word.toLowerCase()
        ? `“${s.suggestion}” is always capitalized.`
        : `“${s.word}” is misspelled. Correct spelling: “${s.suggestion}”.`
      : `“${s.word}” is not a recognized English word.`,
    type: "spelling",
    start: s.start,
    end: s.end,
    source: "spellcheck" as const,
  }));
}

export const byPosition = (a: Correction, b: Correction) => (a.start ?? 0) - (b.start ?? 0);

/** A context-aware correction is used only if it is a respelling of what the learner typed, not a rewrite. */
function plausibleRespelling(original: string, candidate: string): boolean {
  const words = candidate.trim().split(/\s+/);
  if (!candidate.trim() || words.length > 2 || candidate.trim().toLowerCase() === original.toLowerCase()) return false;
  if (!words.every((w) => isKnownWord(w) || isKnownWord(w.toLowerCase()))) return false;
  const a = original.toLowerCase();
  const b = words.join("").toLowerCase();
  return typoDistance(a, b) <= respellLimit(a, b);
}

/** How many letter slips still count as a respelling (inflected forms such as "cultures" for "culter" included). */
const respellLimit = (a: string, b: string) => Math.max(2, Math.ceil(Math.max(a.length, b.length) / 3));

const tokensOf = (text: string) => [...text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => ({ w: m[0], start: m.index ?? 0 }));

/**
 * Where the token starting at `start` went in a corrected version of the text (word alignment): the same word
 * (possibly capitalized), or the stretch of words between the nearest unchanged words before and after it.
 */
function alignment(text: string, corrected: string, start: number): { same: string | null; stretch: string[] | null } | null {
  const a = tokensOf(text);
  const b = tokensOf(corrected);
  const k = a.findIndex((t) => t.start === start);
  if (k < 0 || a.length * b.length > 400_000) return null;
  const A = a.map((t) => t.w.toLowerCase());
  const B = b.map((t) => t.w.toLowerCase());
  const L = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < A.length && j < B.length; ) {
    if (A[i] === B[j]) pairs.push([i++, j++]);
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const same = pairs.find(([i]) => i === k);
  if (same) return { same: b[same[1]].w, stretch: null }; // the same word (maybe capitalized) in the corrected text
  const before = [...pairs].reverse().find(([i]) => i < k) ?? [-1, -1];
  const after = pairs.find(([i]) => i > k) ?? [A.length, B.length];
  const stretch = b.slice(before[1] + 1, after[1]).map((t) => t.w);
  return { same: null, stretch: stretch.length && stretch.length <= 12 ? stretch : null };
}

type Fix = { kind: "word"; text: string } | { kind: "name" };

/** In the corrected stretch, the word (or two words) that respells what the learner typed — or a name. */
function respellingIn(original: string, stretch: string[]): Fix | null {
  const a = original.toLowerCase();
  let best: { text: string; d: number } | null = null;
  for (let i = 0; i < stretch.length; i++) {
    for (const cand of [stretch[i], i + 1 < stretch.length ? `${stretch[i]} ${stretch[i + 1]}` : null]) {
      if (!cand) continue;
      const joined = cand.replace(/\s+/g, "").toLowerCase();
      const d = typoDistance(a, joined);
      if (d > respellLimit(a, joined)) continue;
      // A capitalized word the dictionary does not know is a name ("Tofail"): not a spelling mistake to practise.
      if (!cand.includes(" ") && /^[A-Z]/.test(cand) && !isKnownWord(cand) && !isKnownWord(cand.toLowerCase())) return { kind: "name" };
      if (plausibleRespelling(original, cand) && (!best || d < best.d)) best = { text: cand, d };
    }
  }
  return best ? { kind: "word", text: best.text } : null;
}

/**
 * The spell checker only sees one word, so its first suggestion can be a rare word ("culter" → "curter").
 * When the AI evaluation corrected the same word in context — in its list of corrections or in its corrected
 * version of the text — and that is a plausible respelling, it replaces the spell checker's guess. A word the
 * corrected text shows as a name ("ibn tofil" → "Ibn Tofail") is not a spelling mistake and is dropped.
 */
export function refineSpelling(spelling: Correction[], model: Correction[], text: string, correctedText?: string): Correction[] {
  return spelling.flatMap((sc) => {
    if (sc.suggestion.toLowerCase() === sc.original.toLowerCase()) return [sc]; // capitalization only
    const word = sc.original.toLowerCase();
    let candidate: string | null = null;
    for (const mc of model) {
      const from = mc.original.trim().split(/\s+/);
      const to = mc.suggestion.trim().split(/\s+/);
      const i = from.findIndex((t) => t.replace(/[^A-Za-z'’-]/g, "").toLowerCase() === word);
      if (i < 0) continue;
      candidate = from.length === 1 ? mc.suggestion.trim() : from.length === to.length ? to[i].replace(/[^A-Za-z'’-]/g, "") : null;
      if (candidate && plausibleRespelling(sc.original, candidate)) break;
      candidate = null;
    }
    if (!candidate && correctedText && sc.start !== undefined) {
      const aligned = alignment(text, correctedText, sc.start);
      const isName = (w: string) => /^[A-Z]/.test(w) && !/^[A-Z]/.test(sc.original) && !isKnownWord(w) && !isKnownWord(w.toLowerCase());
      if (aligned?.same && isName(aligned.same)) return []; // the corrected text keeps it, capitalized: a name (“ibn” → “Ibn”)
      const fix = aligned?.stretch ? respellingIn(sc.original, aligned.stretch) : null;
      if (fix?.kind === "name") return []; // a name written in lowercase (“ibn tofil” = Ibn Tofail), not a misspelling
      if (fix) candidate = fix.text;
    }
    if (!candidate || candidate.toLowerCase() === sc.suggestion.toLowerCase()) return [sc];
    // Keep the spell checker's word when it is a common word and closer to what was typed ("dishese": "dishes",
    // not the rephrased "dish"); replace it when it is rare ("curter") or the context word is as close.
    const a = sc.original.toLowerCase();
    const checkerCloser = typoDistance(a, sc.suggestion.toLowerCase()) < typoDistance(a, candidate.replace(/\s+/g, "").toLowerCase());
    if (checkerCloser && !isRareWord(sc.suggestion)) return [sc];
    return [{ ...sc, suggestion: candidate, explanation: `“${sc.original}” is misspelled. Correct spelling: “${candidate}”.` }];
  });
}

/** Words from the task itself (names, places) that the spell checker must not flag. */
function taskWords(task: EmailTask | DiscussionTask): string[] {
  const text =
    task.kind === "write_email"
      ? [task.situation, task.taskInstructions, task.recipient, task.subject, ...task.requiredPoints].join(" ")
      : [task.topicIntro, task.professor.name, task.professor.text, ...task.students.flatMap((s) => [s.name, s.text])].join(" ");
  return text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
}

function criteriaList(obj: Record<string, { score: number; comment: string }>): Criterion[] {
  return Object.entries(obj).map(([key, v]) => ({ key, label: CRITERION_LABELS[key] ?? key, score: half(v.score), comment: v.comment }));
}

export async function evaluateWriting(task: EmailTask | DiscussionTask, text: string): Promise<EvalOutcome<WritingFeedback>> {
  const wordCount = countWords(text);
  const user = task.kind === "write_email" ? emailPrompt(task, text, wordCount) : discussionPrompt(task, text, wordCount);
  const r = await ollamaJson(writingLlmSchema, WRITING_SYSTEM, user);
  const spelling = refineSpelling(spellingCorrections(text, taskWords(task)), r.corrections, text);
  const corrections = [...spelling, ...placeCorrections(r.corrections, text, spelling)].sort(byPosition);
  return {
    score: half(r.score),
    model: AI_CONFIG.ollamaModel,
    feedback: {
      kind: "writing",
      summary: r.summary,
      wordCount,
      criteria: criteriaList(r.criteria),
      strengths: r.strengths,
      issues: r.issues,
      corrections,
      howToImprove: r.howToImprove,
    },
  };
}

export async function evaluateInterview(task: InterviewTask, meta: SpeakingMeta, stt: SttResult): Promise<EvalOutcome<InterviewFeedback>> {
  const delivery = deliveryMetrics(stt.words);
  if (countWords(stt.text) === 0) {
    return {
      score: 0,
      model: null,
      feedback: {
        kind: "interview",
        summary: "No speech was detected in this recording.",
        criteria: [],
        strengths: [],
        issues: ["The recording contains no recognizable speech."],
        corrections: [],
        improvement: ["Check that the microphone is selected and unmuted, and start speaking as soon as recording begins."],
        delivery,
      },
    };
  }
  const r = await ollamaJson(interviewLlmSchema, INTERVIEW_SYSTEM, interviewPrompt(task, meta, stt.text, delivery));
  return {
    score: half(r.score),
    model: AI_CONFIG.ollamaModel,
    feedback: {
      kind: "interview",
      summary: r.summary,
      criteria: criteriaList(r.criteria),
      strengths: r.strengths,
      issues: r.issues,
      corrections: placeCorrections(r.corrections, stt.text).sort(byPosition),
      improvement: r.improvement,
      delivery,
    },
  };
}

/** Listen and Repeat is scored deterministically: word accuracy against the target sentence. */
export function evaluateRepeat(task: ListenRepeatTask, stt: SttResult): EvalOutcome<RepeatFeedback> {
  const target = normalizeWords(task.sentence);
  const alignment = alignWords(target, normalizeWords(stt.text));
  const { score, accuracy, errors } = repeatScore(alignment, target.length);
  const delivery = deliveryMetrics(stt.words);

  const notes: string[] = [];
  const missing = alignment.filter((o) => o.op === "del").map((o) => (o.op === "del" ? o.target : ""));
  const subs = alignment.flatMap((o) => (o.op === "sub" ? [`“${o.spoken}” instead of “${o.target}”`] : []));
  const extra = alignment.flatMap((o) => (o.op === "ins" ? [o.spoken] : []));
  if (countWords(stt.text) === 0) notes.push("No speech was detected in this recording.");
  else if (errors === 0) notes.push("Every word of the sentence was reproduced in order.");
  if (missing.length) notes.push(`Missing words: ${missing.join(", ")}.`);
  if (subs.length) notes.push(`Changed words: ${subs.join("; ")}.`);
  if (extra.length) notes.push(`Extra words: ${extra.join(", ")}.`);
  if (delivery.lowConfidenceWords.length) {
    notes.push(
      `Recognized with low confidence (may indicate unclear articulation): ${delivery.lowConfidenceWords.join(", ")}.`,
    );
  }
  if (delivery.longPauses > 0) notes.push(`${delivery.longPauses} noticeable pause(s) inside the sentence; aim for one smooth phrase.`);

  return {
    score,
    model: null,
    feedback: { kind: "repeat", target: task.sentence, alignment, accuracy, errors, notes, delivery },
  };
}
