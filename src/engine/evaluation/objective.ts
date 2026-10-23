import type { BuildSentenceTask, CtwBlank, McqItem } from "../bank/types";

export type Answer =
  | { kind: "mcq"; optionId: string }
  | { kind: "text"; value: string }
  | { kind: "order"; chunks: string[] }
  | { kind: "essay"; text: string }
  | { kind: "recording"; file: string; mimeType: string; durationMs: number };

export type Correctness = "correct" | "incorrect" | "unanswered";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function gradeMcq(item: McqItem, answer: Answer | undefined): Correctness {
  if (answer?.kind !== "mcq" || !answer.optionId) return "unanswered";
  return answer.optionId === item.correctOptionId ? "correct" : "incorrect";
}

/** The learner types the missing letters; typing the whole word is also accepted. */
export function gradeCtw(blank: CtwBlank, answer: Answer | undefined): Correctness {
  if (answer?.kind !== "text" || !answer.value.trim()) return "unanswered";
  const v = norm(answer.value);
  const ok = v === norm(blank.answer) || norm(blank.prefix + answer.value) === norm(blank.fullWord) || v === norm(blank.fullWord);
  return ok ? "correct" : "incorrect";
}

export function gradeBuildSentence(task: BuildSentenceTask, answer: Answer | undefined): Correctness {
  if (answer?.kind !== "order" || answer.chunks.length === 0) return "unanswered";
  const given = answer.chunks.map(norm);
  const matches = (order: string[]) => order.length === given.length && order.every((c, i) => norm(c) === given[i]);
  return [task.correctOrder, ...task.acceptedOrders].some(matches) ? "correct" : "incorrect";
}

export function buildSentenceText(task: BuildSentenceTask, chunks: string[]): string {
  return [task.answerPrefix, ...chunks].filter(Boolean).join(" ") + task.answerSuffix;
}
