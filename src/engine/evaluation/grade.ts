import type { ItemRef } from "../bank/loader";
import { type Answer, type Correctness, buildSentenceText, gradeBuildSentence, gradeCtw, gradeMcq } from "./objective";

/** null for items that need AI evaluation (essays, speech). */
export function gradeItem(ref: ItemRef, answer: Answer | undefined): Correctness | null {
  switch (ref.scored.kind) {
    case "mcq":
      return gradeMcq(ref.mcq!, answer);
    case "ctw":
      return gradeCtw(ref.blank!, answer);
    case "bas":
      return ref.task.kind === "build_a_sentence" ? gradeBuildSentence(ref.task, answer) : null;
    default:
      return null;
  }
}

const LETTERS = "ABCDEFGH";

export function optionLabel(ref: ItemRef, optionId: string): string {
  const i = ref.mcq!.options.findIndex((o) => o.id === optionId);
  return i < 0 ? optionId : `${LETTERS[i]}. ${ref.mcq!.options[i].text}`;
}

export function correctAnswerText(ref: ItemRef): string | null {
  switch (ref.scored.kind) {
    case "mcq":
      return optionLabel(ref, ref.mcq!.correctOptionId);
    case "ctw":
      return ref.blank!.fullWord;
    case "bas":
      return ref.task.kind === "build_a_sentence" ? ref.task.correctSentence : null;
    default:
      return null;
  }
}

export function answerText(ref: ItemRef, answer: Answer | undefined): string | null {
  if (!answer) return null;
  switch (answer.kind) {
    case "mcq":
      return ref.mcq ? optionLabel(ref, answer.optionId) : answer.optionId;
    case "text":
      return ref.blank ? ref.blank.prefix + answer.value.trim() : answer.value;
    case "order":
      return ref.task.kind === "build_a_sentence" ? buildSentenceText(ref.task, answer.chunks) : answer.chunks.join(" ");
    case "essay":
      return answer.text;
    case "recording":
      return "Recorded response";
  }
}

export function explanationOf(ref: ItemRef): string | null {
  if (ref.mcq) return ref.mcq.explanation || null;
  if (ref.task.kind === "build_a_sentence") return ref.task.explanation;
  if (ref.blank) return `The complete word is “${ref.blank.fullWord}”.`;
  return null;
}
