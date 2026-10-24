/**
 * A frequency check on the CEFR level the AI gives a word added to Spelling practice: the local model often
 * labels rare words as A1 ("toil"). content/exercises/word-frequency.json lists whole English words from the
 * Whisper vocabulary in merge order (frequent words first). Calibrated on the 600 built-in spelling words, it is
 * reliable for rare words, so it only raises a level that is clearly too low; it never lowers one.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT_DIR } from "./bank";
import { type Cefr, CEFR_LEVELS } from "./types";

let ranks: Map<string, number> | null = null;
function rankOf(word: string): number | null {
  if (!ranks) {
    try {
      const { words } = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, "word-frequency.json"), "utf8")) as { words: string[] };
      ranks = new Map(words.map((w, i) => [w, i]));
    } catch {
      ranks = new Map(); // no list: no adjustment
    }
  }
  if (!ranks.size) return null;
  const w = word.toLowerCase();
  if (NUMBER_WORDS.has(w)) return 0; // basic, though spelled-out numbers are rare in written text
  // Inflected forms are rarer than their base ("plates", "dishes"): use the most frequent form.
  return Math.min(...baseForms(w).map((f) => ranks!.get(f) ?? Infinity));
}

const NUMBER_WORDS = new Set(
  ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen " +
    "nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion first second third " +
    "fourth fifth sixth seventh eighth ninth tenth").split(" "),
);

/** The word and its likely base forms (plurals, past tense, -ing, comparatives, adverbs). */
function baseForms(w: string): string[] {
  const out = new Set([w]);
  for (const [suffix, repl] of [["ies", "y"], ["es", ""], ["s", ""], ["ed", ""], ["ed", "e"], ["ing", ""], ["ing", "e"], ["er", ""], ["est", ""], ["ly", ""]]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) out.add(w.slice(0, w.length - suffix.length) + repl);
  }
  return [...out];
}

/** Frequency rank of a word (0 = most common), via its most frequent base form; null when the list is unavailable. */
export const wordRank = (word: string): number | null => rankOf(word);

/** A word that is rare in English (or unknown to the frequency list); false when the list is unavailable. */
export function isRareWord(word: string): boolean {
  const r = rankOf(word);
  return r !== null && r >= 9000;
}

/** The lowest believable level for a word (null when frequency says nothing). */
export function levelFloor(word: string): Cefr | null {
  const r = rankOf(word);
  if (r === null) return null;
  if (r >= 15000) return "C1"; // rare or not even a whole word in the vocabulary (toil, curter)
  if (r >= 9000) return "B2";
  if (r >= 6000) return "B1";
  return null;
}

/** The AI's level for a word, raised to the frequency floor when it is clearly too low. */
export function checkedWordLevel(word: string, level: Cefr): Cefr {
  const floor = levelFloor(word);
  return floor && CEFR_LEVELS.indexOf(floor) > CEFR_LEVELS.indexOf(level) ? floor : level;
}
