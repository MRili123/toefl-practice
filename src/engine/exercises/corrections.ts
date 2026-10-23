import type { ExerciseCorrection } from "./types";

const FUNCTION_WORDS = new Set(
  ("a an the this that these those my your his her its our their some any each every no " +
    "i you he she it we they me him us them myself yourself himself herself itself ourselves themselves " +
    "am is are was were be been being do does did have has had will would can could shall should may might must " +
    "to of in on at by for with from into onto about over under up down out off through during before after " +
    "and or but so if as than then because while when where which who whom whose what not there here very just also too much many more most less few").split(" "),
);

const words = (s: string) => s.toLowerCase().match(/[a-z']+/g) ?? [];

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

const commonPrefix = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** Two tokens that are forms of the same word or both grammatical function words (is → are, a → the, in → on). */
function relatedTokens(a: string, b: string): boolean {
  if (a === b) return true;
  if (FUNCTION_WORDS.has(a) && FUNCTION_WORDS.has(b)) return true;
  if (Math.min(a.length, b.length) >= 4 && commonPrefix(a, b) >= Math.min(4, Math.min(a.length, b.length) - 1)) return true;
  return editDistance(a, b) <= 2;
}

/**
 * A grammar/sentence-structure correction must repair the learner's own wording: an inflection, a function word,
 * an omission, a word order slip. Rewrites that replace ideas with different content (for example when the model
 * "fixes" an off-topic answer) are not grammar mistakes and are dropped, so error counts and the mistake memory
 * stay honest.
 */
export function isPlausibleFix(c: Pick<ExerciseCorrection, "original" | "correction" | "type">): boolean {
  if (c.type !== "grammar" && c.type !== "sentence-structure") return true;
  const a = words(c.original);
  const b = words(c.correction);
  if (a.length === 0 && b.length === 0) return true; // punctuation-only
  if (a.length === 0 || b.length === 0) {
    const w = a.length ? a : b; // insertion or deletion
    return w.length <= 2 && w.every((x) => FUNCTION_WORDS.has(x));
  }
  if (a.length === 1 && b.length === 1) return relatedTokens(a[0], b[0]);
  // Longer spans: mostly the same words (word order, an added/removed function word, a changed ending).
  const setB = new Set(b);
  const shared = a.filter((w) => setB.has(w) || b.some((x) => relatedTokens(w, x))).length;
  return shared / Math.max(a.length, b.length) >= 0.6;
}

const SENTENCE_END = /[.!?\n]/;

/** The sentence containing [start, end) and the same sentence with the fix applied — a concrete example of the mistake. */
export function exampleAround(text: string, start: number, end: number, fix: string): { original: string; correction: string } | null {
  if (start < 0 || end > text.length || end <= start) return null;
  let s = start;
  while (s > 0 && !SENTENCE_END.test(text[s - 1])) s--;
  let e = end;
  while (e < text.length && !SENTENCE_END.test(text[e])) e++;
  if (e < text.length) e++;
  const original = text.slice(s, e).trim();
  if (original.length < 8 || original.length > 220) return null;
  const correction = (text.slice(s, start) + fix + text.slice(end, e)).trim();
  return { original, correction };
}

/**
 * The words that changed between what the learner wrote and the correction ("I swim yesterday" →
 * "I swam yesterday" gives swim → swam), when the mistake is one short replacement. A missing or extra word
 * takes its neighbour along ("go to school" → "go to the school" gives school → the school).
 */
export function mistakeFocus(original: string, correction: string): { wrong: string; right: string } | null {
  const a = original.trim().split(/\s+/);
  const b = correction.trim().split(/\s+/);
  const clean = (w: string) => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "").toLowerCase();
  let start = 0;
  while (start < Math.min(a.length, b.length) && clean(a[start]) === clean(b[start])) start++;
  let end = 0;
  while (end < Math.min(a.length, b.length) - start && clean(a[a.length - 1 - end]) === clean(b[b.length - 1 - end])) end++;
  if (start === a.length - end || start === b.length - end) {
    // Nothing replaced, only a word added or removed: include the next shared word (or the previous one).
    if (end > 0) end--;
    else if (start > 0) start--;
  }
  const wrong = a.slice(start, a.length - end).map(clean).join(" ").trim();
  const right = b.slice(start, b.length - end).map(clean).join(" ").trim();
  if (!wrong || !right || wrong === right) return null;
  if (wrong.split(" ").length > 3 || right.split(" ").length > 3) return null;
  return { wrong, right };
}
