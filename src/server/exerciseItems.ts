import { EngineError } from "@/engine/errors";
import { bankItem, exerciseBank } from "@/engine/exercises/bank";
import type { LearnerMemory } from "@/engine/exercises/store";
import type { GrammarQuestion, ReadingPassage, RepeatSentence, SpeakingQuestion, SpellingItem, WritingPrompt } from "@/engine/exercises/types";

export type AnyItem = ReadingPassage | SpellingItem | GrammarQuestion | SpeakingQuestion | RepeatSentence | WritingPrompt;

/** Bank items first, then items generated from the learner's own mistakes. */
export function findItem(id: string, m: LearnerMemory): AnyItem | null {
  return (
    bankItem<AnyItem>(id) ??
    m.generated.grammar.find((g) => g.id === id) ??
    m.generated.spelling.find((s) => s.id === id) ??
    null
  );
}

export function requireItem<T extends AnyItem>(id: string, m: LearnerMemory): T {
  const item = findItem(id, m);
  if (!item) throw new EngineError("item_not_found", "This question is no longer available.", 404);
  return item as T;
}

let bankWordCache: { bank: object; words: Map<string, SpellingItem> } | null = null;
/** Bank spelling words by lowercase text, so a word misspelled in writing reuses its bank item. */
export function bankWords(): Map<string, SpellingItem> {
  const bank = exerciseBank();
  if (bankWordCache?.bank !== bank) {
    bankWordCache = { bank, words: new Map(bank.spelling.filter((s) => s.type === "word").map((s) => [s.text.toLowerCase(), s])) };
  }
  return bankWordCache.words;
}

export function itemPrompt(item: AnyItem | null): string {
  if (!item) return "Unavailable item";
  if ("segments" in item) return item.title;
  if ("stem" in item) return item.stem;
  if ("type" in item && (item.type === "email" || item.type === "discussion" || item.type === "essay")) {
    return item.type === "email" ? item.situation : item.type === "discussion" ? item.professor.text : item.prompt;
  }
  return (item as { text: string }).text;
}
