import { isPlausibleFix } from "@/engine/exercises/corrections";
import type {
  Cefr, ExerciseCorrection, GrammarCategory, GrammarQuestion, RepeatExerciseFeedback, SpeakingExerciseFeedback,
  WritingExerciseFeedback, WritingPrompt,
} from "@/engine/exercises/types";
import { byPosition, countWords, placeCorrections, refineSpelling, spellingCorrections } from "../evaluators";
import { isKnownWord, levenshtein } from "../spelling";
import type { Correction } from "../feedbackTypes";
import { ollamaJson } from "../ollama";
import { alignWords, deliveryMetrics, normalizeWords } from "../speechAnalysis";
import type { SttResult } from "../stt";
import {
  ANSWER_KEY_SYSTEM, answerKeyPrompt, EXPLAIN_SYSTEM, explainPrompt, GRAMMAR_GENERATOR_SYSTEM, type MistakeFocus, GRAMMATICAL_SYSTEM, grammarGeneratorPrompt, grammaticalPrompt, MISTAKE_VERDICT_SYSTEM, mistakeVerdictPrompt, SPEAKING_EXERCISE_SYSTEM,
  speakingExercisePrompt, WRITING_EXERCISE_SYSTEM, writingExercisePrompt,
} from "./prompts";
import { answerKeySchema, explanationSchema, grammaticalSchema, grammarQuestionSchema, mistakeVerdictSchema, speakingExerciseSchema, writingExerciseSchema } from "./schemas";

const half = (x: number) => Math.max(1, Math.min(6, Math.round(x * 2) / 2));
const clean = (xs: string[], max = 4) => xs.map((x) => x.trim()).filter(Boolean).slice(0, max);

function toExerciseCorrection(c: Correction): ExerciseCorrection {
  const type: ExerciseCorrection["type"] =
    c.type === "spelling" || c.type === "punctuation" || c.type === "capitalization" || c.type === "vocabulary"
      ? c.type
      : c.type === "clarity" || c.type === "word order" ? "sentence-structure" : "grammar";
  return {
    original: c.original,
    correction: c.suggestion,
    reason: c.explanation,
    type,
    category: c.category && c.category !== "other" ? c.category : null,
    start: c.start ?? null,
    end: c.end ?? null,
  };
}

/** Words of the prompt (names, places) that the spell checker must not flag. */
function promptWords(p: WritingPrompt): string[] {
  const text =
    p.type === "email" ? [p.situation, p.to, ...p.tasks].join(" ")
      : p.type === "discussion" ? [p.professor.name, p.professor.text, ...p.students.flatMap((s) => [s.name, s.text])].join(" ")
        : p.prompt;
  return text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
}

export async function evaluateWritingExercise(
  prompt: WritingPrompt,
  level: Cefr,
  text: string,
  subject?: string,
): Promise<{ feedback: WritingExerciseFeedback; weaknesses: GrammarCategory[] }> {
  const wordCount = countWords(text);
  const r = await ollamaJson(writingExerciseSchema, WRITING_EXERCISE_SYSTEM, writingExercisePrompt(prompt, level, text, wordCount, subject));

  const modelCorrections: Correction[] = [
    ...r.spelling_errors.map((e) => ({ original: e.original, suggestion: e.correction, explanation: e.reason, type: "spelling" })),
    ...r.grammar_errors.map((e) => ({ original: e.original, suggestion: e.correction, explanation: e.reason, type: "grammar", category: e.category })),
    ...r.vocabulary_feedback.issues.map((e) => ({ original: e.original, suggestion: e.correction, explanation: e.reason, type: "vocabulary" })),
  ];
  const spelling = refineSpelling(spellingCorrections(text, promptWords(prompt)), modelCorrections, text, r.corrected_version);
  // Only errors that can be located in the learner's own text are kept (the model may not invent errors).
  const corrections = [...spelling, ...placeCorrections(modelCorrections, text, spelling)].sort(byPosition).map(toExerciseCorrection).filter(isPlausibleFix);

  return {
    weaknesses: r.grammar_weaknesses.filter((c): c is GrammarCategory => c !== "other"),
    feedback: {
      kind: "writing",
      score: wordCount === 0 ? 1 : half(r.estimated_score),
      summary: r.summary.trim(),
      wordCount,
      grammarCount: corrections.filter((c) => c.type === "grammar" || c.type === "sentence-structure").length,
      spellingCount: corrections.filter((c) => c.type === "spelling").length,
      vocabulary: { rating: r.vocabulary_feedback.rating, comment: r.vocabulary_feedback.comment },
      organization: r.organization_feedback,
      task: r.task_fulfillment,
      strengths: clean(r.strengths),
      improve: clean(r.weaknesses),
      tips: clean(r.tips),
      corrections,
      improvedVersion: r.corrected_version.trim(),
      recommendedWords: clean(r.recommended_words, 6),
    },
  };
}

function indicators(stt: SttResult, responseSeconds: number): string[] {
  const d = deliveryMetrics(stt.words);
  return [
    `Speaking time ${d.speechSeconds}s of ${responseSeconds}s, ${d.wordCount} words, ${d.wordsPerMinute} words/minute (fluent speech is roughly 110–160)`,
    `Pauses longer than 0.8s: ${d.longPauses} (longest ${d.longestPauseSeconds}s)`,
    `Mean recognition confidence ${d.meanConfidence}; low-confidence words: ${d.lowConfidenceWords.join(", ") || "none"}`,
  ];
}

export async function evaluateSpeakingExercise(
  question: string,
  level: Cefr,
  stt: SttResult,
): Promise<{ feedback: SpeakingExerciseFeedback; weaknesses: GrammarCategory[] }> {
  const transcript = stt.text.trim();
  if (countWords(transcript) === 0) {
    return {
      weaknesses: [],
      feedback: {
        kind: "speaking", score: 1, summary: "No speech was detected in this recording.", strengths: [], errors: [],
        suggestions: ["Check that the right microphone is selected and unmuted, and start speaking as soon as recording begins."],
        delivery: [], transcript: "",
      },
    };
  }
  const r = await ollamaJson(speakingExerciseSchema, SPEAKING_EXERCISE_SYSTEM, speakingExercisePrompt(question, level, transcript, indicators(stt, 45)));
  const placed = placeCorrections(
    r.errors.map((e) => ({ original: e.original, suggestion: e.correction, explanation: e.reason, type: "grammar", category: e.category })),
    transcript,
  ).sort(byPosition);
  return {
    weaknesses: r.grammar_weaknesses.filter((c): c is GrammarCategory => c !== "other"),
    feedback: {
      kind: "speaking",
      score: half(r.estimated_score),
      summary: r.summary.trim(),
      strengths: clean(r.strengths),
      errors: placed.map(toExerciseCorrection).filter(isPlausibleFix),
      suggestions: clean(r.suggestions),
      delivery: clean(r.delivery_observations, 3),
      transcript,
    },
  };
}

/** Listen & Repeat is compared deterministically, word by word. */
export function evaluateRepeatExercise(target: string, stt: SttResult): RepeatExerciseFeedback {
  const want = normalizeWords(target);
  const ops = alignWords(want, normalizeWords(stt.text));
  const d = deliveryMetrics(stt.words);
  const matched = ops.flatMap((o) => (o.op === "match" ? [o.target] : []));
  const notes: string[] = [];
  if (!stt.text.trim()) notes.push("No speech was detected in this recording.");
  if (d.lowConfidenceWords.length) notes.push(`Recognized with low confidence (may indicate unclear articulation): ${d.lowConfidenceWords.join(", ")}.`);
  if (d.longPauses > 0) notes.push(`${d.longPauses} noticeable pause(s) inside the sentence — aim for one smooth phrase.`);
  if (d.wordCount > 0 && d.wordsPerMinute < 90) notes.push("The pace was slow; try to repeat it at a natural speed.");
  return {
    kind: "repeat",
    target,
    transcript: stt.text.trim(),
    accuracy: want.length ? Math.round((matched.length / want.length) * 100) / 100 : 0,
    matched,
    missing: ops.flatMap((o) => (o.op === "del" ? [o.target] : [])),
    added: ops.flatMap((o) => (o.op === "ins" ? [o.spoken] : [])),
    changed: ops.flatMap((o) => (o.op === "sub" ? [{ said: o.spoken, expected: o.target }] : [])),
    notes,
  };
}

/* ---------- grammar generation ---------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function similar(a: string, b: string): boolean {
  const x = new Set(norm(a).split(" "));
  const y = new Set(norm(b).split(" "));
  const inter = [...x].filter((w) => y.has(w)).length;
  return inter / Math.max(1, Math.min(x.size, y.size)) >= 0.8;
}

/** Real English forms of the same words (remarkable → remark, remarks, remarked…), for replacing invented options. */
export function wordForms(words: string[]): string[] {
  const out = new Set<string>();
  for (const raw of words) {
    if (!/^[a-z'-]+$/i.test(raw.trim())) continue;
    const w = raw.trim().toLowerCase();
    const stems = new Set([w, w.replace(/ly$/, ""), w.replace(/(able|ably|ible|ibly)$/, ""), w.replace(/(ness|ment|ion|ing|ed|er|s)$/, ""), w.replace(/e$/, "")]);
    for (const s of stems) {
      if (s.length < 3) continue;
      for (const suffix of ["", "s", "es", "ed", "d", "ing", "er", "ly", "ness", "ment", "ion", "able", "ably", "ability", "ful", "fully", "al", "ally", "ive", "ively"]) {
        out.add(s + suffix);
      }
    }
  }
  const given = new Set(words.map((w) => w.trim().toLowerCase()));
  return [...out].filter((f) => !given.has(f) && isKnownWord(f)).sort((a, b) => a.length - b.length);
}

/**
 * Word-form questions: four single words of one family (success / succeed / successful / successfully) sharing
 * a stem, and not degrees of comparison (fast / faster / fastest), which is a different skill.
 */
export function isWordFamily(options: string[]): boolean {
  const words = options.map((o) => o.trim().toLowerCase());
  if (words.some((w) => !/^[a-z-]+$/.test(w))) return false;
  let stem = 0;
  while (stem < Math.min(...words.map((w) => w.length)) && words.every((w) => w[stem] === words[0][stem])) stem++;
  if (stem < 4) return false;
  const base = words.reduce((a, b) => (a.length <= b.length ? a : b));
  const comparatives = words.filter((w) => w !== base && (w === `${base}er` || w === `${base}est` || /(ier|iest)$/.test(w) && w.startsWith(base.slice(0, -1))));
  return comparatives.length === 0;
}

/** Structural checks a generated question must pass before it can be shown. */
export function validateGenerated(q: { stem: string; options: string[]; answer_index: number }, avoid: string[]): string | null {
  const blanks = q.stem.match(/_{3,}/g) ?? [];
  if (blanks.length !== 1) return "stem must contain exactly one blank";
  if (q.options.length !== 4 || q.options.some((o) => !o.trim())) return "four non-empty options required";
  if (new Set(q.options.map(norm)).size !== 4) return "options must be distinct";
  if (q.answer_index < 0 || q.answer_index > 3) return "invalid answer index";
  if (avoid.some((a) => similar(a, q.stem))) return "too similar to an earlier question";
  if (q.stem.length > 220) return "stem too long";
  return null;
}

/**
 * Generates one new question for a weak grammar skill. A draft must pass the structural checks, and then every
 * option is judged on its own as a complete sentence: exactly one must be grammatical, and it must be the
 * intended answer. This rejects ambiguous items, which a 7B model produces often. A 7B model also often marks
 * the wrong option as its answer: when the judge finds exactly one other correct option, a separate answer-key
 * check decides, and the item is kept only if it agrees with the judge (two independent checks out of three).
 */
export async function generateGrammarQuestion(
  category: GrammarCategory,
  level: Cefr,
  topic: string,
  examples: string[],
  avoid: string[],
  id: string,
  { attempts = 4, focus }: { attempts?: number; focus?: MistakeFocus } = {},
): Promise<GrammarQuestion | null> {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const draft = await ollamaJson(
      grammarQuestionSchema,
      GRAMMAR_GENERATOR_SYSTEM,
      grammarGeneratorPrompt(category, level, topic, examples.slice(-3), avoid.slice(-25), focus),
      { temperature: 0.7 },
    );
    const draftStem = draft.stem.replace(/_{3,}/g, "_____").trim();
    if (validateGenerated({ ...draft, stem: draftStem }, avoid)) continue;
    // From one mistake: the options are the learner's wrong form, the right form and two more forms of the word.
    const focusAnswer = focus ? draft.options.findIndex((o) => same(o, focus.right)) : -1;
    if (focus && (focusAnswer < 0 || !draft.options.some((o) => same(o, focus.wrong)))) continue;
    // Distractors must be real English: an invented form ("remarkablyness") is replaced by a real one ("remark").
    if (focus) {
      // The learner's own wrong form stays even when it is not a word ("u", "goed"): it is the mistake practised.
      const real = (o: string) => same(o, focus.wrong) || o.trim().split(/\s+/).every((w) => isKnownWord(w.replace(/[^A-Za-z'-]/g, "")));
      const spare = wordForms([focus.right, focus.wrong]).filter((f) => !draft.options.some((o) => same(o, f)));
      draft.options = draft.options.map((o) => (real(o) ? o : (spare.shift() ?? o)));
      if (!draft.options.every(real) || new Set(draft.options.map((o) => o.trim().toLowerCase())).size !== 4) continue;
    }
    if (!focus && category === "word-forms" && !isWordFamily(draft.options)) continue;
    const verdicts: boolean[] = [];
    for (const option of draft.options) {
      const r = await ollamaJson(grammaticalSchema, GRAMMATICAL_SYSTEM, grammaticalPrompt(draftStem.replace("_____", option.trim())), { temperature: 0 });
      verdicts.push(r.grammatical);
      if (verdicts.filter(Boolean).length > 1) break;
    }
    if (verdicts.length !== 4 || verdicts.filter(Boolean).length !== 1) continue;
    let answer = draft.answer_index;
    let explanation = draft.explanation.trim();
    const judged = verdicts.indexOf(true);
    if (focus) {
      // The right form must be the only correct option. The explanation is written knowing the answer and the
      // learner's mistake (a draft's own explanation is often wrong about the part of speech).
      if (judged !== focusAnswer) continue;
      answer = focusAnswer;
      const fixed = draftStem.replace("_____", `[${draft.options[answer].trim()}]`);
      explanation = (await ollamaJson(explanationSchema, EXPLAIN_SYSTEM, explainPrompt(fixed, focus.right, focus.wrong), { temperature: 0 })).explanation.trim();
    } else if (judged !== answer) {
      const key = await ollamaJson(answerKeySchema, ANSWER_KEY_SYSTEM, answerKeyPrompt(draftStem, draft.options.map((o) => o.trim())), { temperature: 0 });
      if (key.answer_index !== judged) continue;
      answer = judged;
      explanation = key.explanation.trim();
    }
    return {
      id,
      level,
      stem: draftStem,
      options: draft.options.map((o) => o.trim()),
      answer,
      explanation,
      category,
      difficulty: Math.min(5, ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(level) + 1),
      tags: ["generated", "from-mistakes"],
      source: "generated",
    };
  }
  return null;
}

export interface MistakeVerdict {
  type: "spelling" | "grammar";
  level: Cefr;
  category: GrammarCategory | null;
}

/**
 * Spelling or grammar? Plus the level of the word (spelling) or of the rule (grammar), and the rule's category.
 * The dictionary settles what a 7B model judges unreliably: a non-word close to the correct word is a
 * misspelling; a real word is not a letter-level misspelling (the model then decides: another form of the same
 * word → grammar, a different word to learn → spelling).
 */
export async function verifyMistake(original: string, correction: string, context: string | null, note: string | null): Promise<MistakeVerdict> {
  const single = /^[A-Za-z][A-Za-z'-]*$/;
  const o = original.trim();
  const c = correction.trim();
  let fact: string | null = null;
  let forced: MistakeVerdict["type"] | null = null;
  if (single.test(o) && single.test(c)) {
    const [a, b] = [o.toLowerCase(), c.toLowerCase()];
    let common = 0;
    while (common < Math.min(a.length, b.length) && a[common] === b[common]) common++;
    if (!isKnownWord(o)) {
      if (levenshtein(a, b) <= Math.max(2, Math.ceil(c.length / 3))) forced = "spelling";
      fact = `"${o}" is not an English word.`;
    } else if (common >= 4 && common / Math.min(a.length, b.length) >= 0.7) {
      // Two real words sharing most of their letters: another form of the same word (remarkably/remarkable).
      forced = "grammar";
      fact = `"${o}" and "${c}" are two forms of the same word: this is a grammar (word form) mistake.`;
    } else {
      fact = `"${o}" is a real English word, so this is NOT a letter-level misspelling. Answer "grammar" if it is another form of the same word (adverb/adjective/noun, tense, plural, e.g. remarkably for remarkable); answer "spelling" only if it is a different word the learner must learn (e.g. countries for countless).`;
    }
  }
  const r = await ollamaJson(mistakeVerdictSchema, MISTAKE_VERDICT_SYSTEM, mistakeVerdictPrompt(o, c, context, note, fact), { temperature: 0 });
  const type = forced ?? r.type;
  const category = type !== "grammar" ? null : forced === "grammar" ? "word-forms" : r.category !== "none" ? r.category : null;
  return { type, level: r.level, category };
}
