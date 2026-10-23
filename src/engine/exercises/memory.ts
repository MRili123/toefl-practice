/** Pure updates of the learner's mistake memory (persisted by store.ts). */
import { applyResult, type ItemInfo, masteryKey, newRecord } from "./mastery";
import type { LearnerMemory } from "./store";
import type { Cefr, ItemSource, SpellingItem, WeaknessRecord } from "./types";
import { soundsLike } from "./words";

export function recordResult(
  m: LearnerMemory,
  info: ItemInfo,
  correct: boolean,
  now: number,
  detail: { userAnswer?: string | null; errorType?: string | null } = {},
) {
  const key = masteryKey(info.kind, info.itemId);
  const prev = m.records[key] ?? newRecord(info, now);
  m.records[key] = applyResult(prev, correct, now, detail);
  return m.records[key];
}

const slug = (w: string) => w.toLowerCase().replace(/[^a-z'-]/g, "");

/**
 * Adds a misspelled word (from a dictation sentence, writing or speaking) to spelling practice as a weak item.
 * Uses the bank's own item when the word exists there, so all evidence about a word lives in one record.
 */
export function rememberSpellingWord(
  m: LearnerMemory,
  word: string,
  level: Cefr,
  source: ItemSource,
  userAnswer: string,
  now: number,
  bankWords: Map<string, SpellingItem>,
): string | null {
  const w = word.trim().replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
  if (w.length < 3 || !/^[A-Za-z][A-Za-z'-]*$/.test(w)) return null;
  // A dictated word must be recognizable by ear: "inn" cannot be told apart from "in".
  if (soundsLike(w).length) return null;
  let item = bankWords.get(w.toLowerCase()) ?? m.generated.spelling.find((s) => s.text.toLowerCase() === w.toLowerCase());
  if (!item) {
    item = { id: `sp-x-${slug(w)}`, level, type: "word", text: w, source };
    m.generated.spelling.push(item);
  }
  recordResult(m, { kind: "spelling", itemId: item.id, level: item.level, text: item.text, correctAnswer: item.text, source: item.source }, false, now, {
    userAnswer,
    errorType: source === "bank" ? "misspelling" : `misspelling-in-${source}`,
  });
  return item.id;
}

/** Counts a recurring error category. Returns true when enough new occurrences justify a fresh practice question. */
export function bumpWeakness(
  m: LearnerMemory,
  area: WeaknessRecord["area"],
  category: string,
  example: { original: string; correction: string } | null,
  now: number,
): { record: WeaknessRecord; generate: boolean } {
  const key = `${area}:${category}`;
  const r: WeaknessRecord = m.weaknesses[key] ?? { key, area, category, count: 0, examples: [], lastAt: now, generatedAtCount: 0 };
  r.count += 1;
  r.lastAt = now;
  if (example && example.original.trim()) {
    r.examples = [...r.examples, { ...example, at: now }].slice(-8);
  }
  m.weaknesses[key] = r;
  // Repeated (≥ 2) and two new occurrences since the last generated question.
  const generate = area === "grammar" && r.count >= 2 && r.count - r.generatedAtCount >= 2;
  return { record: r, generate };
}
