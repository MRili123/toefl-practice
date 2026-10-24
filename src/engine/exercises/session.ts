import { EngineError } from "../errors";
import {
  type Cefr, CEFR_LEVELS, type ExerciseAttempt, type ExerciseConfig, type ExerciseSession, GRAMMAR_CATEGORIES,
  type GrammarCategory, MAX_HEARTS, shiftLevel, SPEAKING_TOPICS, type WritingType,
} from "./types";

const COUNTS: Record<ExerciseConfig["kind"], number[]> = {
  reading: [5, 10, 20],
  spelling: [10, 20, 30],
  grammar: [10, 20, 30],
  "speaking-repeat": [10, 20, 30],
  "speaking-interaction": [5, 10, 15, 20],
  writing: [1],
};

export function normalizeExerciseConfig(input: Partial<ExerciseConfig>): ExerciseConfig {
  const kind = input.kind;
  if (!kind || !(kind in COUNTS)) throw new EngineError("invalid_exercise", "Unknown exercise type.");
  const level: Cefr = CEFR_LEVELS.includes(input.level as Cefr) ? (input.level as Cefr) : "B1";
  const allowed = COUNTS[kind];
  const count = allowed.includes(Number(input.count)) ? Number(input.count) : allowed[Math.min(1, allowed.length - 1)];
  const config: ExerciseConfig = { kind, level, count };
  if (kind === "grammar" && GRAMMAR_CATEGORIES.includes(input.focus as GrammarCategory)) config.focus = input.focus;
  if (kind === "spelling") {
    config.spellingType = input.spellingType === "word" || input.spellingType === "sentence" ? input.spellingType : "mixed";
    config.mistakeOrder = input.mistakeOrder === "first" ? "first" : "mixed";
  }
  if (kind === "speaking-interaction") {
    if (!SPEAKING_TOPICS.includes(input.topic as never)) throw new EngineError("invalid_topic", "Choose a topic.");
    config.topic = input.topic;
    config.progressive = count === 20 && !!input.progressive;
  }
  if (kind === "reading") {
    const t = input.timeLimit;
    config.timeLimit = t === null || t === undefined ? null : Math.max(30, Math.min(30 * 60, Math.round(Number(t)) || 0));
  }
  if (kind === "writing") {
    const types: WritingType[] = ["email", "discussion", "essay"];
    config.writingType = types.includes(input.writingType as WritingType) ? input.writingType : "email";
    const t = input.timeLimit;
    config.timeLimit = t === null || t === undefined ? null : Math.max(60, Math.min(120 * 60, Math.round(Number(t)) || 0));
  }
  return config;
}

/** Level of each position; progressive runs step up every quarter of the session (capped at C2). */
export function levelPlan(config: ExerciseConfig): Cefr[] {
  if (!config.progressive) return Array.from({ length: config.count }, () => config.level);
  const quarter = Math.ceil(config.count / 4);
  return Array.from({ length: config.count }, (_, i) => shiftLevel(config.level, Math.floor(i / quarter)));
}

export function createExerciseSession(id: string, config: ExerciseConfig, items: { itemId: string; level: Cefr }[], now: number): ExerciseSession {
  return {
    id,
    kind: config.kind,
    config,
    items,
    index: 0,
    // Writing, Reading and the speaking Interaction Test have no hearts: you choose the level and length.
    hearts: config.kind === "writing" || config.kind === "speaking-interaction" || config.kind === "reading" ? null : MAX_HEARTS,
    attempts: [],
    status: "active",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function currentItem(s: ExerciseSession) {
  return s.status === "active" ? (s.items[s.index] ?? null) : null;
}

export function assertCurrent(s: ExerciseSession, itemId: string) {
  if (s.status !== "active") throw new EngineError("exercise_finished", "This practice session has ended.", 409);
  if (s.attempts.some((a) => a.itemId === itemId && a.ai && a.ai.stage !== "done" && a.ai.stage !== "error")) {
    throw new EngineError("evaluation_pending", "Your previous response is still being evaluated.", 409);
  }
  if (currentItem(s)?.itemId !== itemId) throw new EngineError("not_current", "This question is not the current one.", 409);
}

/** Records a graded attempt: a mistake costs a heart; 0 hearts ends the run; the last item completes it. */
export function recordAttempt(s: ExerciseSession, attempt: ExerciseAttempt, now: number) {
  s.attempts.push(attempt);
  if (attempt.ai && attempt.ai.stage !== "done" && attempt.ai.stage !== "error") return; // resolved later
  settle(s, attempt, now);
}

export function latestAttempt(s: ExerciseSession, itemId: string): ExerciseAttempt | undefined {
  return [...s.attempts].reverse().find((a) => a.itemId === itemId);
}

/**
 * Updates an AI-evaluated attempt. Hearts and progress are applied once, when the evaluation first ends
 * (a failed evaluation never costs a heart; a later retry only updates the feedback).
 */
export function resolveAttempt(s: ExerciseSession, itemId: string, patch: Partial<ExerciseAttempt>, now: number) {
  const attempt = latestAttempt(s, itemId);
  if (!attempt) return;
  Object.assign(attempt, patch);
  const ended = attempt.ai?.stage === "done" || attempt.ai?.stage === "error";
  if (ended && !attempt.settled) settle(s, attempt, now);
}

function settle(s: ExerciseSession, attempt: ExerciseAttempt, now: number) {
  attempt.settled = true;
  if (s.hearts !== null && attempt.correct === false) {
    attempt.heartLost = true;
    s.hearts = Math.max(0, s.hearts - 1);
  }
  if (s.status !== "active") return;
  s.index += 1;
  if (s.hearts === 0) finish(s, "failed", now);
  else if (s.kind !== "writing" && s.index >= s.items.length) finish(s, "completed", now);
}

export function finish(s: ExerciseSession, status: "completed" | "failed" | "abandoned", now: number) {
  s.status = status;
  s.completedAt = now;
}

/** Spelling, Grammar and Listen & Repeat have no length or level choice: they run until the hearts are gone. */
export const isEndless = (kind: ExerciseSession["kind"]) => kind === "spelling" || kind === "grammar" || kind === "speaking-repeat";

export interface ExerciseSummary {
  answered: number;
  correct: number;
  total: number;
  /** Exercise score in percent (writing: estimated score as a share of 6). */
  percent: number | null;
  /** Average estimated practice score (writing and interaction), 1–6. */
  averageScore: number | null;
  hearts: number | null;
  pending: number;
  recommendNext: Cefr | null;
  /** Highest level answered correctly in this session. */
  levelReached: Cefr | null;
  /** Reading: words completed correctly across all passages (the exercise score is based on these). */
  words: { correct: number; total: number } | null;
}

export function summarize(s: ExerciseSession): ExerciseSummary {
  const done = s.attempts.filter((a) => !a.ai || a.ai.stage === "done");
  const pending = s.attempts.length - done.length;
  const graded = done.filter((a) => a.correct !== null);
  const correct = graded.filter((a) => a.correct).length;
  const scores = done.flatMap((a) => (a.feedback && (a.feedback.kind === "writing" || a.feedback.kind === "speaking") ? [a.feedback.score] : []));
  const averageScore = scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 2) / 2 : null;
  const words =
    s.kind === "reading"
      ? done.reduce((w, a) => (a.feedback?.kind === "reading" ? { correct: w.correct + a.feedback.correct, total: w.total + a.feedback.total } : w), { correct: 0, total: 0 })
      : null;
  const percent =
    s.kind === "writing"
      ? averageScore === null ? null : Math.round((averageScore / 6) * 100)
      : words
        ? words.total ? Math.round((words.correct / words.total) * 100) : null
        : graded.length ? Math.round((correct / graded.length) * 100) : null;
  const passedAll = s.status === "completed" && s.kind !== "writing" && graded.length === s.items.length;
  const top = s.config.level;
  const recommendNext =
    !isEndless(s.kind) && passedAll && percent !== null && percent >= 80 && top !== "C2" && !s.config.progressive ? shiftLevel(top, 1) : null;
  const levels = graded.filter((a) => a.correct).map((a) => CEFR_LEVELS.indexOf(a.level));
  const levelReached = levels.length ? CEFR_LEVELS[Math.max(...levels)] : null;
  return {
    answered: s.attempts.length,
    correct,
    total: s.kind === "writing" ? s.attempts.length : s.items.length,
    percent,
    averageScore,
    hearts: s.hearts,
    pending,
    recommendNext,
    levelReached,
    words,
  };
}
