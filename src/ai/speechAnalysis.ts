import type { AlignOp, DeliveryMetrics } from "./feedbackTypes";
import type { SttWord } from "./stt";

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberWords(n: number): string[] {
  if (n < 20) return [ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
  if (n < 1000) return [ONES[Math.floor(n / 100)], "hundred", ...(n % 100 ? numberWords(n % 100) : [])];
  return [String(n)];
}

/** Words after which 's / 'd are a verb ("it's" = it is), not a possessive ("John's"). */
const PRONOUN_LIKE = new Set(
  "i you he she it we they there here that this what where who how when why let everyone everything someone something nobody nothing".split(" "),
);
const IRREGULAR: Record<string, string[]> = { "won't": ["will", "not"], "can't": ["can", "not"], cannot: ["can", "not"], "shan't": ["shall", "not"], "let's": ["let", "us"], "ain't": ["is", "not"] };

/**
 * Contractions in their full form, so "It's very cold" and "It is very cold" compare as the same words: the
 * learner may say either, and Whisper often writes the short form whatever was said. 's/'d are read as is/would
 * (has/had differ only in a function word, a minor change).
 */
function expandContraction(w: string): string[] {
  if (IRREGULAR[w]) return IRREGULAR[w];
  let m = /^(\w+)n't$/.exec(w);
  if (m) return [m[1], "not"];
  m = /^(\w+)'(m|re|ve|ll|d|s)$/.exec(w);
  if (!m) return [w];
  const [, base, tail] = m;
  const full = { m: "am", re: "are", ve: "have", ll: "will", d: "would", s: "is" }[tail]!;
  if ((tail === "s" || tail === "d") && !PRONOUN_LIKE.has(base)) return [w]; // John's book
  return [base, full];
}

/**
 * Lowercase words, punctuation stripped, small integers spelled out (Whisper may write "3" for "three"),
 * contractions written in full.
 */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (/^\d+$/.test(w) ? numberWords(Number(w)) : [w.replace(/^'+|'+$/g, "")]))
    .filter(Boolean)
    .flatMap(expandContraction);
}

/** Word-level Levenshtein alignment of the target sentence against what was said. */
export function alignWords(target: string[], spoken: string[]): AlignOp[] {
  const n = target.length;
  const m = spoken.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = target[i - 1] === spoken[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (target[i - 1] === spoken[j - 1] ? 0 : 1)) {
      ops.push({ op: target[i - 1] === spoken[j - 1] ? "match" : "sub", target: target[i - 1], spoken: spoken[j - 1] });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ op: "del", target: target[--i] });
    } else {
      ops.push({ op: "ins", spoken: spoken[--j] });
    }
  }
  return ops.reverse();
}

const FUNCTION_WORDS = new Set(
  ("a an the this that these those my your his her its our their some any each every no " +
    "i you he she it we they me him us them " +
    "am is are was were be been being do does did have has had will would can could shall should may might must " +
    "to of in on at by for with from into onto about over under up down out off through during before after " +
    "and or but so if as than then because while when where which who whom whose what " +
    "not there here very just also too").split(" "),
);
const stemOf = (w: string) => w.replace(/'s$/, "").replace(/(ing|ed|es|s|d)$/, "");

/** Missing/changed function words and wrong endings (tense, number) are "minor" in the ETS guide. */
function isMinorChange(o: AlignOp): boolean {
  if (o.op === "sub") return (FUNCTION_WORDS.has(o.target) && FUNCTION_WORDS.has(o.spoken)) || stemOf(o.target) === stemOf(o.spoken);
  if (o.op === "del") return FUNCTION_WORDS.has(o.target);
  if (o.op === "ins") return FUNCTION_WORDS.has(o.spoken);
  return true;
}

/**
 * ETS Listen and Repeat scoring guide (0–5), approximated from the word alignment:
 * 5 exact · 4 meaning kept, only minor changes (1–2 function words/endings; one content word in longer sentences)
 * 3 essentially full, most content words present · 2 significant part missing · 1 very little · 0 no response.
 */
export function repeatScore(ops: AlignOp[], targetLength: number): { score: number; accuracy: number; errors: number } {
  const matches = ops.filter((o) => o.op === "match").length;
  const changes = ops.filter((o) => o.op !== "match");
  const errors = changes.length;
  const accuracy = targetLength === 0 ? 0 : matches / targetLength;
  const contentTargets = ops.filter((o) => o.op !== "ins" && !FUNCTION_WORDS.has(o.target));
  const contentMatched = contentTargets.filter((o) => o.op === "match").length;
  const contentRatio = contentTargets.length ? contentMatched / contentTargets.length : accuracy;
  const major = changes.filter((o) => !isMinorChange(o)).length;

  let score: number;
  if (matches === 0) score = 0;
  else if (errors === 0) score = 5;
  else if (errors <= 2 && (major === 0 || (major === 1 && targetLength >= 8))) score = 4;
  else if (contentRatio > 0.5 && accuracy >= 0.6) score = 3;
  else if (accuracy >= 0.3) score = 2;
  else score = 1;
  return { score, accuracy: Math.round(accuracy * 100) / 100, errors };
}

export function deliveryMetrics(words: SttWord[]): DeliveryMetrics {
  if (words.length === 0) {
    return { speechSeconds: 0, wordCount: 0, wordsPerMinute: 0, longPauses: 0, longestPauseSeconds: 0, meanConfidence: 0, lowConfidenceWords: [] };
  }
  const speechSeconds = Math.max(0.1, words[words.length - 1].end - words[0].start);
  let longPauses = 0;
  let longest = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > 0.8) longPauses++;
    longest = Math.max(longest, gap);
  }
  const clean = (w: string) => w.replace(/[^\p{L}\p{N}']/gu, "");
  return {
    speechSeconds: Math.round(speechSeconds * 10) / 10,
    wordCount: words.length,
    wordsPerMinute: Math.round((words.length / speechSeconds) * 60),
    longPauses,
    longestPauseSeconds: Math.round(longest * 10) / 10,
    meanConfidence: Math.round((words.reduce((a, w) => a + w.p, 0) / words.length) * 100) / 100,
    lowConfidenceWords: [...new Set(words.filter((w) => w.p < 0.5).map((w) => clean(w.w)).filter(Boolean))].slice(0, 12),
  };
}
