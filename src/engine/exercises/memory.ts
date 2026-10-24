/** Pure updates of the learner's mistake memory (persisted by store.ts). */
import { applyResult, type ItemInfo, masteryKey, newRecord } from "./mastery";
import type { LearnerMemory } from "./store";
import type { Cefr, ItemSource, MasteryRecord, MasteryStatus, SpellingItem, WeaknessRecord } from "./types";
import { sameWord, soundsLike } from "./words";

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
  let item = findSpellingWord(m, w, bankWords);
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

/**
 * The Spelling practice word for `word`, if one exists: the same word, else the same word in another form
 * ("governments" → "government"), built-in words first. Used so the AI never adds a word twice.
 */
export function findSpellingWord(m: LearnerMemory, word: string, bankWords: Map<string, SpellingItem>): SpellingItem | undefined {
  const w = word.toLowerCase();
  const exact = bankWords.get(w) ?? m.generated.spelling.find((s) => s.type === "word" && s.text.toLowerCase() === w);
  if (exact) return exact;
  return [...bankWords.values(), ...m.generated.spelling].find((s) => s.type === "word" && sameWord(s.text, w));
}

/**
 * Merges words the AI added that already exist in another form (added before this check existed): mistakes and
 * progress move to the existing word, and the duplicate is removed. Returns how many were merged.
 */
export function mergeDuplicateWords(m: LearnerMemory, bankWords: Map<string, SpellingItem>): number {
  const kept: SpellingItem[] = [];
  let merged = 0;
  for (const g of m.generated.spelling) {
    const target = g.type === "word" ? [...bankWords.values(), ...kept].find((k) => k.type === "word" && k.id !== g.id && sameWord(k.text, g.text)) : undefined;
    if (!target) {
      kept.push(g);
      continue;
    }
    merged++;
    for (const link of Object.values(m.mistakes)) if (link.spellingItemId === g.id) link.spellingItemId = target.id;
    const from = masteryKey("spelling", g.id), to = masteryKey("spelling", target.id);
    const r = m.records[from];
    if (r) {
      const moved = { ...r, key: to, itemId: target.id, text: target.text, correctAnswer: target.text, level: target.level };
      m.records[to] = m.records[to] ? combineRecords(m.records[to], moved) : moved;
    }
    delete m.records[from];
    if (m.seen[g.id]) {
      m.seen[target.id] = (m.seen[target.id] ?? 0) + m.seen[g.id];
      delete m.seen[g.id];
    }
  }
  m.generated.spelling = kept;
  return merged;
}

/** Weakest first: the status a combined record keeps, so a mistake is never hidden by an earlier success. */
const STATUS_RANK: MasteryStatus[] = ["weak", "learning", "improving", "new", "strong", "mastered"];

/** One record for two records of the same word: counts added up, the weaker status, the most recent answer. */
export function combineRecords(a: MasteryRecord, b: MasteryRecord): MasteryRecord {
  const latest = b.lastAttemptAt > a.lastAttemptAt ? b : a;
  return {
    ...a,
    attempts: a.attempts + b.attempts,
    correct: a.correct + b.correct,
    incorrect: a.incorrect + b.incorrect,
    everWrong: a.everWrong || b.everWrong,
    streak: Math.min(a.streak, b.streak),
    status: STATUS_RANK.indexOf(a.status) <= STATUS_RANK.indexOf(b.status) ? a.status : b.status,
    firstSeenAt: Math.min(a.firstSeenAt, b.firstSeenAt),
    lastAttemptAt: latest.lastAttemptAt,
    nextReviewAt: Math.min(a.nextReviewAt, b.nextReviewAt),
    lastUserAnswer: latest.lastUserAnswer,
    errorType: latest.errorType ?? a.errorType ?? b.errorType,
  };
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
