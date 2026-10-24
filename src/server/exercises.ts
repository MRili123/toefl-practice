import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { EngineError } from "@/engine/errors";
import { profiles } from "@/engine/profile/store";
import { type AnyItem, bankWords, findItem, itemPrompt, requireItem } from "./exerciseItems";
import { requestMistakeSync } from "./admin/mistakes";
import { exerciseQueue } from "./exerciseQueue";
import { type LevelTextType, levelOfText, rewriteAtLevel } from "@/ai/exercises/levels";
import { correctedText, fromExerciseCorrections } from "@/lib/corrections";
import { exerciseBank } from "@/engine/exercises/bank";
import { gradeGrammar, gradeReading, gradeSpelling, isNearMiss } from "@/engine/exercises/grading";
import { isActiveMistake, masteryPercent, statusCounts } from "@/engine/exercises/mastery";
import { bumpWeakness, recordResult, rememberSpellingWord } from "@/engine/exercises/memory";
import { adaptivePlan, type LeveledItem, needsReview, pickLeastSeen, shuffle } from "@/engine/exercises/selection";
import {
  assertCurrent, createExerciseSession, currentItem, type ExerciseSummary, finish, isEndless, levelPlan, normalizeExerciseConfig,
  recordAttempt, summarize,
} from "@/engine/exercises/session";
import { EXERCISE_RECORDINGS_DIR, exerciseSessions, type LearnerMemory, learnerMemory } from "@/engine/exercises/store";
import { normalizedText, sameWord } from "@/engine/exercises/words";
import {
  type AttemptFeedback, type Cefr, CEFR_BAND, EXERCISE_AREAS, type ExerciseArea, areaOf, type ExerciseAttempt,
  type ExerciseConfig, type ExerciseKind, type ExerciseSession, GRAMMAR_CATEGORY_LABEL, type GrammarCategory,
  type GrammarQuestion, MAX_HEARTS, type MasteryRecord, type ReadingPassage, type RepeatSentence, type SpeakingQuestion, type SpellingItem,
  type TrackedKind, type WritingLevels, type WritingPrompt, CEFR_LEVELS,
} from "@/engine/exercises/types";

/* ---------- items ---------- */

/**
 * Spelling, Grammar and Listen & Repeat: exactly 5 items at A1, A2 and B1, 10 at B2 and C1, then C2 until the last
 * heart is lost. Items missed before (and grammar questions generated from your mistakes) count inside their level,
 * first within it.
 */
const LADDER_PER_LEVEL: Partial<Record<Cefr, number>> = { A1: 5, A2: 5, B1: 5, B2: 10, C1: 10, C2: Infinity };
const usesLadder = (k: TrackedKind) => k === "speaking-repeat" || k === "spelling" || k === "grammar";

const trackedKind = (k: ExerciseKind): TrackedKind | null =>
  k === "reading" || k === "spelling" || k === "grammar" || k === "speaking-repeat" ? k : null;

function recordsFor(m: LearnerMemory, kind: TrackedKind): Map<string, MasteryRecord> {
  return new Map(Object.values(m.records).filter((r) => r.kind === kind).map((r) => [r.itemId, r]));
}

/** Every item of the kind, at all levels (plus items learned from your own mistakes). */
function trackedPool(config: ExerciseConfig, m: LearnerMemory): LeveledItem[] {
  const bank = exerciseBank();
  if (config.kind === "spelling") {
    const types = config.spellingType === "mixed" || !config.spellingType ? ["word", "sentence"] : [config.spellingType];
    const items: SpellingItem[] = [];
    for (const s of [...bank.spelling, ...m.generated.spelling]) {
      if (!types.includes(s.type)) continue;
      const dup = items.some((k) => k.type === s.type && (s.type === "word" ? sameWord(k.text, s.text) : normalizedText(k.text) === normalizedText(s.text)));
      if (!dup) items.push(s);
    }
    return items.map((s) => ({ id: s.id, level: s.level }));
  }
  if (config.kind === "grammar") {
    const stems = new Set<string>();
    const all = [...bank.grammar, ...m.generated.grammar].filter((g) => {
      const key = normalizedText(g.stem);
      if (stems.has(key)) return false;
      stems.add(key);
      return true;
    });
    return all.filter((g) => !config.focus || g.category === config.focus).map((g) => ({ id: g.id, level: g.level }));
  }
  return bank.repeat.map((s) => ({ id: s.id, level: s.level }));
}

/** Items still worth showing as "fresh from your mistakes": generated questions never answered. */
function generatedFirst(config: ExerciseConfig, m: LearnerMemory): string[] {
  if (config.kind !== "grammar") return [];
  const records = recordsFor(m, "grammar");
  return m.generated.grammar.filter((g) => (!config.focus || g.category === config.focus) && !records.get(g.id)?.attempts).map((g) => g.id);
}

/**
 * Reading: passages of the chosen level. Passages you missed and have not mastered come back first (by id),
 * then the passages you have seen least, in random order.
 */
function planReading(config: ExerciseConfig, m: LearnerMemory): { itemId: string; level: Cefr }[] {
  const pool = exerciseBank().reading.filter((p) => p.level === config.level).map((p) => p.id);
  const records = recordsFor(m, "reading");
  const review = pool.filter((id) => needsReview(records.get(id))).sort().slice(0, config.count);
  const rest = pickLeastSeen(pool, new Map(Object.entries(m.seen)), config.count - review.length, Math.random, new Set(review));
  return [...review, ...rest].map((itemId) => ({ itemId, level: config.level }));
}

function planItems(config: ExerciseConfig, m: LearnerMemory): { itemId: string; level: Cefr }[] {
  const rng = Math.random;
  if (config.kind === "reading") return planReading(config, m);
  const kind = trackedKind(config.kind);
  if (kind) {
    const perLevel = usesLadder(kind) ? LADDER_PER_LEVEL : 10;
    const reviewInLevel = usesLadder(kind);
    const mixReview = config.kind === "spelling" && config.mistakeOrder !== "first";
    return adaptivePlan(trackedPool(config, m), recordsFor(m, kind), rng, { first: generatedFirst(config, m), perLevel, reviewInLevel, mixReview })
      .map((i) => ({ itemId: i.id, level: i.level }));
  }
  const seen = new Map(Object.entries(m.seen));
  const bank = exerciseBank();
  if (config.kind === "speaking-interaction") {
    const plan = levelPlan(config);
    const out: { itemId: string; level: Cefr }[] = [];
    for (const level of [...new Set(plan)]) {
      const k = plan.filter((l) => l === level).length;
      const pool = bank.interaction.filter((q) => q.topic === config.topic && q.level === level).map((q) => q.id);
      for (const itemId of pickLeastSeen(pool, seen, k, rng)) out.push({ itemId, level });
    }
    return out;
  }
  const pool = bank.writing.filter((w) => w.level === config.level && w.type === config.writingType).map((w) => w.id);
  return pickLeastSeen(pool, seen, 1, rng).map((itemId) => ({ itemId, level: config.level }));
}

/* ---------- client view ---------- */

export type ClientItem =
  | {
      kind: "reading";
      itemId: string;
      level: Cefr;
      title: string;
      segments: string[];
      blanks: { id: string; prefix: string; letters: number }[];
      /** Seen before and not mastered yet. */
      review: boolean;
    }
  | { kind: "spelling"; itemId: string; level: Cefr; type: "word" | "sentence" }
  | { kind: "grammar"; itemId: string; level: Cefr; stem: string; options: string[]; category: GrammarCategory; generated: boolean }
  | { kind: "speaking-interaction"; itemId: string; level: Cefr; text: string }
  | { kind: "speaking-repeat"; itemId: string; level: Cefr }
  | { kind: "writing"; itemId: string; level: Cefr; prompt: WritingPrompt };

/** An answered item with its content revealed (used for feedback and review). */
export interface RevealedAttempt extends ExerciseAttempt {
  number: number;
  prompt: string;
  detail: AnyItem | null;
}

export interface ExerciseView {
  id: string;
  kind: ExerciseKind;
  config: ExerciseConfig;
  status: ExerciseSession["status"];
  hearts: number | null;
  maxHearts: number;
  /** No fixed length: runs until the hearts are gone (Spelling, Grammar, Listen & Repeat). */
  endless: boolean;
  index: number;
  total: number;
  current: ClientItem | null;
  attempts: RevealedAttempt[];
  summary: ExerciseSummary;
  weakItems: { text: string; status: string }[];
  /** Spelling: 1 point per correct answer, and the best score of all your spelling sessions. */
  score: { points: number; best: number; previousBest: number | null; newBest: boolean } | null;
  createdAt: number;
  completedAt: number | null;
}

/** Points of a spelling session: one per correct answer. */
const spellingPoints = (s: ExerciseSession) => s.attempts.filter((a) => a.correct === true).length;

/** Best score among your other spelling sessions (null before the first one). */
async function previousSpellingBest(exceptId: string): Promise<number | null> {
  const others = (await exerciseSessions.list()).filter((x) => x.kind === "spelling" && x.id !== exceptId && x.attempts.length > 0);
  return others.length ? Math.max(...others.map(spellingPoints)) : null;
}

async function withScore(v: ExerciseView, s: ExerciseSession): Promise<ExerciseView> {
  if (s.kind !== "spelling") return v;
  const points = spellingPoints(s);
  const previousBest = await previousSpellingBest(s.id);
  const best = Math.max(points, previousBest ?? 0);
  return { ...v, score: { points, best, previousBest, newBest: s.status !== "active" && points > 0 && points > (previousBest ?? 0) } };
}

/** The unanswered item never reveals a spelling word or a sentence to repeat. */
function clientItem(itemId: string, level: Cefr, kind: ExerciseKind, m: LearnerMemory): ClientItem {
  const item = requireItem<AnyItem>(itemId, m);
  switch (kind) {
    case "reading": {
      const p = item as ReadingPassage;
      return {
        kind, itemId, level, title: p.title, segments: p.segments,
        blanks: p.blanks.map((b) => ({ id: b.id, prefix: b.prefix, letters: b.answer.length })),
        review: needsReview(m.records[`reading:${itemId}`]),
      };
    }
    case "spelling":
      return { kind, itemId, level, type: (item as SpellingItem).type };
    case "grammar": {
      const g = item as GrammarQuestion;
      return { kind, itemId, level, stem: g.stem, options: g.options, category: g.category, generated: g.source === "generated" };
    }
    case "speaking-interaction":
      return { kind, itemId, level, text: (item as SpeakingQuestion).text };
    case "speaking-repeat":
      return { kind, itemId, level };
    case "writing":
      return { kind, itemId, level, prompt: item as WritingPrompt };
  }
}

function buildView(s: ExerciseSession, m: LearnerMemory): ExerciseView {
  const cur = currentItem(s);
  const attempts = s.attempts.map((a, i) => {
    const detail = findItem(a.itemId, m);
    return { ...a, number: i + 1, prompt: itemPrompt(detail), detail };
  });
  const missed = new Set(s.attempts.filter((a) => a.correct === false).map((a) => a.itemId));
  const kind = trackedKind(s.kind);
  const weakItems = kind
    ? [...missed].map((id) => {
        const r = m.records[`${kind}:${id}`];
        const d = findItem(id, m);
        const text = !d ? id
          : kind === "grammar" ? GRAMMAR_CATEGORY_LABEL[(d as GrammarQuestion).category] + ": " + itemPrompt(d)
          : kind === "reading" ? `${(d as ReadingPassage).title} · ${r?.correctAnswer ?? ""}`
          : itemPrompt(d);
        return { text, status: r?.status ?? "weak" };
      })
    : [];
  return {
    id: s.id,
    kind: s.kind,
    config: s.config,
    status: s.status,
    hearts: s.hearts,
    maxHearts: MAX_HEARTS,
    endless: isEndless(s.kind),
    index: s.index,
    total: s.kind === "writing" ? s.items.length : s.items.length,
    current: cur ? clientItem(cur.itemId, cur.level, s.kind, m) : null,
    attempts,
    summary: summarize(s),
    weakItems,
    score: null,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
  };
}

export async function exerciseView(id: string): Promise<ExerciseView> {
  const [s, m] = await Promise.all([exerciseSessions.get(id), learnerMemory.get()]);
  if (!s) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  return withScore(buildView(s, m), s);
}

/* ---------- lifecycle ---------- */

/** Starts a session; `retryOf` repeats exactly the items of an earlier session (Try Again). */
export async function startExercise(input: Partial<ExerciseConfig> & { retryOf?: string }): Promise<ExerciseView> {
  const previous = input.retryOf ? await exerciseSessions.get(input.retryOf) : null;
  if (input.retryOf && !previous) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  const config = previous ? { ...previous.config } : normalizeExerciseConfig(input);
  const now = Date.now();
  const { memory, result: items } = await learnerMemory.update((m) => {
    const items = previous ? (previous.config.progressive ? [...previous.items] : shuffle([...previous.items], Math.random)) : planItems(config, m);
    if (config.kind === "speaking-interaction" || config.kind === "writing" || config.kind === "reading") {
      for (const it of items) m.seen[it.itemId] = (m.seen[it.itemId] ?? 0) + 1;
    }
    return items;
  });
  if (items.length === 0) {
    throw new EngineError("no_content", `There is no ${config.kind.replace("-", " ")} content for level ${config.level} yet.`, 404);
  }
  // Adaptive runs start where the plan starts (your first mistake to review, or A1).
  const startLevel = isEndless(config.kind) ? items[0].level : config.level;
  const s = createExerciseSession(randomUUID(), { ...config, level: startLevel, count: config.kind === "writing" ? 1 : items.length }, items, now);
  await exerciseSessions.create(s);
  return withScore(buildView(s, memory), s);
}

/** Leaving mid-run keeps what was answered (as an unfinished attempt); an untouched session is discarded. */
export async function exitExercise(id: string): Promise<{ deleted: boolean }> {
  const s = await exerciseSessions.get(id);
  if (!s) return { deleted: true };
  if (s.attempts.length === 0) {
    await exerciseSessions.remove(id);
    return { deleted: true };
  }
  await exerciseSessions.update(id, (x) => {
    if (x.status === "active") finish(x, x.kind === "writing" ? "completed" : "abandoned", Date.now());
  });
  return { deleted: false };
}

export async function deleteExercise(id: string) {
  const s = await exerciseSessions.get(id);
  if (!s) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  await exerciseSessions.remove(id);
  await profiles.update((p) => {
    p.savedQuestions = p.savedQuestions.filter((q) => q.sessionId !== id);
  });
}

/* ---------- question register ---------- */

const clip = (t: string, n = 140) => {
  const x = t.replace(/\s+/g, " ").trim();
  return x.length > n ? x.slice(0, n).replace(/\s\S*$/, "") + "…" : x;
};

/** A spoiler-free description of an exercise item for the Question Register (never the word to spell or repeat). */
export async function describeExerciseItem(sessionId: string, key: string) {
  const s = await exerciseSessions.get(sessionId);
  if (!s) return null;
  const pos = s.items.findIndex((i) => i.itemId === key);
  if (pos < 0) throw new EngineError("item_not_found", "This item is not part of the session.", 404);
  const item = requireItem<AnyItem>(key, await learnerMemory.get());
  const level = s.items[pos].level;
  const section = s.kind === "reading" ? "reading" : s.kind === "spelling" ? "spelling" : s.kind === "grammar" ? "grammar" : s.kind === "writing" ? "writing" : "speaking";
  const preview =
    s.kind === "reading" ? `Complete the Words · ${(item as ReadingPassage).title}`
    : s.kind === "spelling" ? `Dictation ${(item as SpellingItem).type === "sentence" ? "sentence" : "word"} · listen and spell`
      : s.kind === "speaking-repeat" ? "Listen & Repeat sentence"
        : s.kind === "grammar" ? clip((item as GrammarQuestion).stem)
          : clip(itemPrompt(item));
  const unit = s.kind === "writing" ? "Prompt" : s.kind === "reading" ? "Passage" : "Item";
  return { section, taskKind: s.kind, numberLabel: `${unit} ${pos + 1} · ${level}`, preview } as const;
}

/** Register status of a saved exercise item: its latest attempt in that session. */
export function exerciseItemStatus(s: ExerciseSession, key: string): "correct" | "incorrect" | "evaluated" | "pending" | "unanswered" {
  const a = [...s.attempts].reverse().find((x) => x.itemId === key);
  if (!a) return s.status === "active" ? "pending" : "unanswered";
  if (a.ai && a.ai.stage !== "done") return "pending";
  if (a.correct === null) return "evaluated";
  return a.correct ? "correct" : "incorrect";
}

/** Writing: adds the next prompt of the same type and level. */
export async function nextWritingPrompt(id: string): Promise<ExerciseView> {
  const m0 = await learnerMemory.get();
  const s0 = await exerciseSessions.get(id);
  if (!s0) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  if (s0.kind !== "writing" || s0.status !== "active") throw new EngineError("invalid_action", "Not an active writing session.", 409);
  if (currentItem(s0)) return withScore(buildView(s0, m0), s0);
  const used = new Set(s0.items.map((i) => i.itemId));
  const pool = exerciseBank().writing.filter((w) => w.level === s0.config.level && w.type === s0.config.writingType).map((w) => w.id);
  const { memory, result: next } = await learnerMemory.update((m) => {
    const [pick] = pickLeastSeen(pool, new Map(Object.entries(m.seen)), 1, Math.random, used);
    if (pick) m.seen[pick] = (m.seen[pick] ?? 0) + 1;
    return pick ?? null;
  });
  if (!next) throw new EngineError("no_content", "You have practised every prompt of this type and level in this session.", 404);
  const { session } = await exerciseSessions.update(id, (s) => {
    if (!currentItem(s)) {
      s.items.push({ itemId: next, level: s.config.level });
      s.config.count = s.items.length;
    }
  });
  return withScore(buildView(session, memory), session);
}

/* ---------- answers ---------- */

/** Reading: the typed letters of every blank in the passage ({ answers: { blankId: letters }, timedOut }). */
async function answerReading(id: string, itemId: string, value: string, m0: LearnerMemory, now: number): Promise<ExerciseView> {
  const p = requireItem<ReadingPassage>(itemId, m0);
  let input: { answers?: unknown; timedOut?: unknown };
  try {
    input = JSON.parse(value);
  } catch {
    throw new EngineError("invalid_answer", "Invalid answer.");
  }
  const raw = input.answers && typeof input.answers === "object" ? (input.answers as Record<string, unknown>) : {};
  const answers = Object.fromEntries(p.blanks.map((b) => [b.id, typeof raw[b.id] === "string" ? (raw[b.id] as string) : ""]));
  const graded = gradeReading(p, answers, input.timedOut === true);
  const { session } = await exerciseSessions.update(id, (s) => {
    assertCurrent(s, itemId);
    recordAttempt(s, { itemId, level: p.level, answer: JSON.stringify(answers), correct: graded.correct, heartLost: false, feedback: graded.feedback, ai: null, at: now }, now);
  });
  const missed = graded.feedback.blanks.filter((b) => !b.correct);
  if (missed.some((b) => b.given)) requestMistakeSync(); // missed words join Spelling practice
  const { memory } = await learnerMemory.update((m) => {
    recordResult(m, { kind: "reading", itemId, level: p.level, text: p.title, correctAnswer: missed.map((b) => b.fullWord).join(", ") || "all correct", source: "bank" }, graded.correct, now, {
      userAnswer: missed.map((b) => b.prefix + (b.given || "…")).join(", ") || null,
      errorType: missed.length ? `${missed.length} of ${p.blanks.length} words` : null,
    });
  });
  return withScore(buildView(session, memory), session);
}

/** Reading (passage), Spelling (typed text) and Grammar (option index) are graded instantly on the server. */
export async function answerExercise(id: string, itemId: string, value: string): Promise<ExerciseView> {
  const now = Date.now();
  const m0 = await learnerMemory.get();
  const s0 = await exerciseSessions.get(id);
  if (!s0) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  if (s0.kind === "reading") return answerReading(id, itemId, value, m0, now);
  if (s0.kind !== "spelling" && s0.kind !== "grammar") throw new EngineError("invalid_action", "This exercise takes a recording or a written response.", 400);
  const item = requireItem<SpellingItem | GrammarQuestion>(itemId, m0);

  let graded: { correct: boolean; feedback: AttemptFeedback; errorType: string | null };
  if (s0.kind === "spelling") {
    graded = gradeSpelling(item as SpellingItem, String(value ?? "").slice(0, 600));
  } else {
    const chosen = Number(value);
    if (!Number.isInteger(chosen) || chosen < 0 || chosen >= (item as GrammarQuestion).options.length) {
      throw new EngineError("invalid_answer", "Choose one of the answers.");
    }
    graded = gradeGrammar(item as GrammarQuestion, chosen);
  }

  const { session } = await exerciseSessions.update(id, (s) => {
    assertCurrent(s, itemId);
    const level = s.items[s.index].level;
    recordAttempt(s, { itemId, level, answer: String(value), correct: graded.correct, heartLost: false, feedback: graded.feedback, ai: null, at: now }, now);
  });

  const toGenerate: { category: GrammarCategory; level: Cefr }[] = [];
  const { memory } = await learnerMemory.update((m) => {
    if (s0.kind === "spelling") {
      const sp = item as SpellingItem;
      const userAnswer = String(value).trim();
      recordResult(m, { kind: "spelling", itemId, level: sp.level, text: sp.text, correctAnswer: sp.text, source: sp.source }, graded.correct, now, {
        userAnswer,
        errorType: graded.errorType,
      });
      // Misspelled words inside a dictated sentence also become words to practise.
      if (sp.type === "sentence" && graded.feedback.kind === "spelling") {
        for (const w of graded.feedback.wrongWords) {
          if (isNearMiss(w.given, w.expected)) rememberSpellingWord(m, w.expected, sp.level, "generated", w.given, now, bankWords());
        }
      }
    } else {
      const g = item as GrammarQuestion;
      recordResult(m, { kind: "grammar", itemId, level: g.level, text: g.stem, correctAnswer: g.options[g.answer], category: g.category, source: g.source }, graded.correct, now, {
        userAnswer: g.options[Number(value)],
        errorType: g.category,
      });
      if (!graded.correct) {
        const { generate } = bumpWeakness(m, "grammar", g.category, { original: g.stem.replace("_____", g.options[Number(value)]), correction: g.stem.replace("_____", g.options[g.answer]) }, now);
        if (generate) toGenerate.push({ category: g.category, level: g.level });
      }
    }
  });
  for (const job of toGenerate) exerciseQueue.generate(job.category, job.level);
  return withScore(buildView(session, memory), session);
}

export async function submitWriting(id: string, itemId: string, text: string, subject?: string): Promise<ExerciseView> {
  const now = Date.now();
  const { session } = await exerciseSessions.update(id, (s) => {
    if (s.kind !== "writing") throw new EngineError("invalid_action", "Not a writing session.", 400);
    assertCurrent(s, itemId);
    recordAttempt(s, {
      itemId, level: s.config.level, answer: text.slice(0, 20000), subject: subject?.slice(0, 200), correct: null, heartLost: false,
      feedback: null, ai: { stage: "queued", error: null }, at: now,
    }, now);
  });
  exerciseQueue.evaluate(id, itemId);
  return withScore(buildView(session, await learnerMemory.get()), session);
}

export async function submitRecording(id: string, itemId: string, audio: Buffer, ext: string, durationMs: number): Promise<ExerciseView> {
  const now = Date.now();
  const s0 = await exerciseSessions.get(id);
  if (!s0) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  if (!s0.kind.startsWith("speaking")) throw new EngineError("invalid_action", "Not a speaking session.", 400);
  assertCurrent(s0, itemId);
  const dir = path.join(EXERCISE_RECORDINGS_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const file = `${itemId}-${now}.${ext}`;
  await fs.writeFile(path.join(dir, file), audio);
  const { session } = await exerciseSessions.update(id, (s) => {
    assertCurrent(s, itemId);
    recordAttempt(s, {
      itemId, level: s.items[s.index].level, answer: file, durationMs, correct: null, heartLost: false, feedback: null,
      ai: { stage: "queued", error: null }, at: now,
    }, now);
  });
  exerciseQueue.evaluate(id, itemId);
  return withScore(buildView(session, await learnerMemory.get()), session);
}

/** The learner checked the transcript of a spoken answer (correcting it if needed): score it with that text. */
export async function confirmExerciseTranscript(id: string, itemId: string, text: string): Promise<ExerciseView> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  const { session } = await exerciseSessions.update(id, (s) => {
    const a = [...s.attempts].reverse().find((x) => x.itemId === itemId);
    if (!a?.stt || a.ai?.stage !== "review") throw new EngineError("not_in_review", "This answer is not waiting for a transcript check.", 409);
    a.transcript = clean;
    a.transcriptEdited = clean !== a.stt.text.replace(/\s+/g, " ").trim();
    a.ai = { stage: "queued", error: null };
  });
  exerciseQueue.evaluate(id, itemId);
  return withScore(buildView(session, await learnerMemory.get()), session);
}

export async function retryEvaluation(id: string, itemId: string): Promise<ExerciseView> {
  const { session } = await exerciseSessions.update(id, (s) => {
    const a = [...s.attempts].reverse().find((x) => x.itemId === itemId);
    if (!a?.ai || a.ai.stage !== "error") throw new EngineError("invalid_action", "Nothing to retry.", 409);
    a.ai = { stage: "queued", error: null };
  });
  exerciseQueue.evaluate(id, itemId);
  return withScore(buildView(session, await learnerMemory.get()), session);
}

/* ---------- writing: the improved version at each CEFR level ---------- */

const levelJobs = new Map<string, Promise<WritingLevels>>();

/**
 * Writing: the CEFR level of the AI's improved version, and (with `level`) that text rewritten at another level.
 * Each result is generated once and kept with the attempt; the same request in flight is shared.
 */
export function writingLevels(id: string, itemId: string, level?: Cefr): Promise<WritingLevels> {
  if (level && !CEFR_LEVELS.includes(level)) throw new EngineError("invalid_level", "Unknown level.", 400);
  const key = `${id}:${itemId}:${level ?? "rate"}`;
  const running = levelJobs.get(key);
  if (running) return running;
  const job = buildWritingLevels(id, itemId, level).finally(() => levelJobs.delete(key));
  levelJobs.set(key, job);
  return job;
}

async function buildWritingLevels(id: string, itemId: string, level?: Cefr): Promise<WritingLevels> {
  const s = await exerciseSessions.get(id);
  if (!s) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  const rated = (x: ExerciseAttempt) => x.itemId === itemId && (x.feedback?.kind === "writing" || x.feedback?.kind === "speaking");
  const a = [...s.attempts].reverse().find(rated);
  // Writing: the AI's improved version. Speaking: the transcript with the AI's corrections applied.
  const fb = a?.feedback;
  const base = fb?.kind === "writing" ? fb.improvedVersion.trim()
    : fb?.kind === "speaking" ? correctedText(fb.transcript, fromExerciseCorrections(fb.errors)).trim() : "";
  if (!a || !base) throw new EngineError("no_improved_version", "There is no corrected version of this answer yet.", 409);
  const type: LevelTextType = fb?.kind === "speaking" ? "speaking" : s.config.writingType ?? "email";
  let levels: WritingLevels = a.levels ?? { estimated: null, reason: null, versions: {} };
  const save = async (patch: (l: WritingLevels) => void) => {
    const { session } = await exerciseSessions.update(id, (ss) => {
      const att = [...ss.attempts].reverse().find(rated);
      if (!att) return;
      att.levels ??= { estimated: null, reason: null, versions: {} };
      patch(att.levels);
    });
    const att = [...session.attempts].reverse().find(rated);
    levels = att?.levels ?? levels;
  };
  if (!levels.estimated) {
    const r = await levelOfText(base, type);
    await save((l) => {
      l.estimated = r.level;
      l.reason = r.reason;
    });
  }
  if (level && level !== levels.estimated && !levels.versions[level]) {
    const v = await rewriteAtLevel(base, levels.estimated!, level, type);
    await save((l) => void (l.versions[level] = v));
  }
  return levels;
}

/** Text the TTS endpoint may speak for this session item (never exposed to the browser as text). */
export async function speakableText(
  sessionId: string,
  itemId: string,
): Promise<{ text: string; style: "dictation" | "natural"; kind: "spelling" | "repeat" | "speaking" }> {
  const s = await exerciseSessions.get(sessionId);
  if (!s || !s.items.some((i) => i.itemId === itemId)) throw new EngineError("item_not_found", "Audio not available for this item.", 404);
  const item = requireItem<AnyItem>(itemId, await learnerMemory.get());
  if (s.kind === "spelling") return { text: (item as SpellingItem).text, style: "dictation", kind: "spelling" };
  if (s.kind === "speaking-repeat") return { text: (item as RepeatSentence).text, style: "natural", kind: "repeat" };
  if (s.kind === "speaking-interaction") return { text: (item as SpeakingQuestion).text, style: "natural", kind: "speaking" };
  throw new EngineError("no_audio", "This exercise has no audio.", 400);
}

/* ---------- overview (hub + profile) ---------- */

export interface AreaOverview {
  area: ExerciseArea;
  /** Level of your most recent session in this area. */
  level: Cefr | null;
  recommended: Cefr | null;
  mastery: number | null;
  counts: { mastered: number; learning: number; weak: number } | null;
  toReview: number;
  sessions: number;
  lastPracticedAt: number | null;
  averageScore: number | null;
  /** Spelling: best score (correct answers in one session). */
  bestScore: number | null;
}

export interface ExerciseHistoryItem {
  id: string;
  kind: ExerciseKind;
  level: Cefr;
  status: ExerciseSession["status"];
  at: number;
  summary: ExerciseSummary;
  maxHearts: number;
  focus?: string;
  topic?: string;
}

export interface WeakArea {
  key: string;
  area: ExerciseArea;
  label: string;
  detail: string;
  href: string;
}

export interface ExercisesOverview {
  areas: Record<ExerciseArea, AreaOverview>;
  weakAreas: WeakArea[];
  toReview: number;
  savedMistakes: number;
  history: ExerciseHistoryItem[];
  content: Record<ExerciseArea, number>;
}

function scoresMeetingLevel(sessions: ExerciseSession[]): number | null {
  const results = sessions
    .flatMap((s) => s.attempts.map((a) => ({ a, level: a.level })))
    .filter(({ a }) => a.feedback && (a.feedback.kind === "writing" || a.feedback.kind === "speaking"))
    .slice(-20);
  if (!results.length) return null;
  const met = results.filter(({ a, level }) => (a.feedback as { score: number }).score >= CEFR_BAND[level] - 0.5).length;
  return Math.round((met / results.length) * 100);
}

export async function exercisesOverview(): Promise<ExercisesOverview> {
  const [all, m] = await Promise.all([exerciseSessions.list(), learnerMemory.get()]);
  const sessions = all.filter((s) => s.attempts.length > 0).sort((a, b) => b.createdAt - a.createdAt);
  const records = Object.values(m.records);
  const now = Date.now();
  const bank = exerciseBank();

  const areas = {} as Record<ExerciseArea, AreaOverview>;
  for (const area of EXERCISE_AREAS) {
    const own = sessions.filter((s) => areaOf(s.kind) === area);
    const kinds: TrackedKind[] = area === "reading" ? ["reading"] : area === "spelling" ? ["spelling"] : area === "grammar" ? ["grammar"] : area === "speaking" ? ["speaking-repeat"] : [];
    const recs = records.filter((r) => kinds.includes(r.kind));
    const itemMastery = masteryPercent(recs);
    const responseMastery = area === "writing" || area === "speaking" ? scoresMeetingLevel(own.filter((s) => s.kind === "writing" || s.kind === "speaking-interaction")) : null;
    const parts = [itemMastery, responseMastery].filter((x): x is number => x !== null);
    const aiScores = own.flatMap((s) => s.attempts.flatMap((a) => (a.feedback && (a.feedback.kind === "writing" || a.feedback.kind === "speaking") ? [a.feedback.score] : [])));
    const latest = own[0];
    const latestSummary = latest ? summarize(latest) : null;
    areas[area] = {
      area,
      level: latest ? (isEndless(latest.kind) ? latestSummary!.levelReached : latest.config.level) : null,
      recommended: latestSummary?.recommendNext ?? null,
      mastery: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null,
      counts: recs.some((r) => r.attempts > 0) ? statusCounts(recs) : null,
      toReview: recs.filter((r) => isActiveMistake(r) || (r.status !== "mastered" && r.attempts > 0 && r.nextReviewAt <= now)).length,
      sessions: own.length,
      lastPracticedAt: latest ? latest.updatedAt : null,
      bestScore: area === "spelling" && own.length ? Math.max(...own.map(spellingPoints)) : null,
      averageScore: aiScores.length ? Math.round((aiScores.slice(-10).reduce((a, b) => a + b, 0) / Math.min(10, aiScores.length)) * 2) / 2 : null,
    };
  }

  const weakAreas: WeakArea[] = [];
  const grammarWeak = Object.values(m.weaknesses).filter((w) => w.area === "grammar").sort((a, b) => b.count - a.count).slice(0, 4);
  for (const w of grammarWeak) {
    const label = GRAMMAR_CATEGORY_LABEL[w.category as GrammarCategory] ?? w.category;
    weakAreas.push({ key: w.key, area: "grammar", label, detail: `${w.count} mistake${w.count === 1 ? "" : "s"}`, href: `/exercises/grammar?focus=${w.category}` });
  }
  const weakWords = records.filter((r) => r.kind === "spelling" && r.status === "weak");
  if (weakWords.length) {
    const fromWriting = weakWords.filter((r) => r.source === "writing").length;
    weakAreas.push({
      key: "spelling", area: "spelling", label: "Spelling",
      detail: `${weakWords.length} word${weakWords.length === 1 ? "" : "s"} to review${fromWriting ? ` · ${fromWriting} from your writing` : ""}`,
      href: "/exercises/spelling",
    });
  }
  const weakReading = records.filter((r) => r.kind === "reading" && r.status === "weak").length;
  if (weakReading) weakAreas.push({ key: "reading", area: "reading", label: "Complete the Words", detail: `${weakReading} passage${weakReading === 1 ? "" : "s"} to review`, href: "/exercises/reading" });
  const weakRepeat = records.filter((r) => r.kind === "speaking-repeat" && r.status === "weak").length;
  if (weakRepeat) weakAreas.push({ key: "repeat", area: "speaking", label: "Listen & Repeat", detail: `${weakRepeat} sentence${weakRepeat === 1 ? "" : "s"} to repeat again`, href: "/exercises/speaking?mode=repeat" });

  return {
    areas,
    weakAreas,
    toReview: records.filter((r) => isActiveMistake(r)).length,
    savedMistakes: records.filter((r) => r.incorrect > 0).length,
    history: sessions.map((s) => ({
      id: s.id, kind: s.kind, level: s.config.level, status: s.status, at: s.completedAt ?? s.updatedAt,
      summary: summarize(s), maxHearts: MAX_HEARTS, focus: s.config.focus, topic: s.config.topic,
    })),
    content: {
      reading: bank.reading.length,
      spelling: bank.spelling.length,
      grammar: bank.grammar.length,
      writing: bank.writing.length,
      speaking: bank.interaction.length + bank.repeat.length,
    },
  };
}

/** Average estimated scores from exercise writing/speaking sessions, as level evidence. */
export async function exerciseEvidence(): Promise<{ skill: "writing" | "speaking"; band: number; at: number }[]> {
  const sessions = await exerciseSessions.list();
  return sessions.flatMap((s) => {
    if (s.kind !== "writing" && s.kind !== "speaking-interaction") return [];
    const sum = summarize(s);
    if (sum.averageScore === null) return [];
    return [{ skill: s.kind === "writing" ? "writing" : "speaking", band: sum.averageScore, at: s.completedAt ?? s.updatedAt }];
  });
}
