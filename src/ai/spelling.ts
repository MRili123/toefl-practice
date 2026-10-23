import fs from "node:fs";
import path from "node:path";
import nspell from "nspell";
import { COMMON_WORDS } from "@/engine/exercises/words";

type Checker = ReturnType<typeof nspell>;

export interface SpellingIssue {
  start: number;
  end: number;
  word: string;
  suggestion: string | null;
}

const g = globalThis as unknown as { __toeflSpell?: { us: Checker; gb: Checker } };

function checkers() {
  if (!g.__toeflSpell) {
    const load = (pkg: string) => {
      const dir = path.join(process.cwd(), "node_modules", pkg);
      return nspell(fs.readFileSync(path.join(dir, "index.aff")), fs.readFileSync(path.join(dir, "index.dic")));
    };
    g.__toeflSpell = { us: load("dictionary-en"), gb: load("dictionary-en-gb") };
  }
  return g.__toeflSpell;
}

export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

export function isKnownWord(word: string): boolean {
  const { us, gb } = checkers();
  return us.correct(word) || gb.correct(word);
}

/** Edit distance where swapping two neighbouring letters ("recieve" / "receive") counts as one slip. */
export function typoDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The dictionary's suggestions come in no frequency order, so "ibn" may get "inn" before "in". Among the closest
 * suggestions (fewest letter changes), a very common word wins; otherwise the dictionary's order is kept.
 */
export function bestSuggestion(word: string, suggestions: string[]): string | null {
  if (!suggestions.length) return null;
  const lower = word.toLowerCase();
  const scored = [...new Set(suggestions)].map((s, i) => ({ s, i, d: typoDistance(lower, s.toLowerCase()) }));
  const min = Math.min(...scored.map((x) => x.d));
  const closest = scored.filter((x) => x.d === min);
  return (closest.find((x) => COMMON_WORDS.has(x.s.toLowerCase())) ?? closest[0]).s;
}

/**
 * Dictionary spell check (US or UK spelling accepted). Capitalized unknown words are treated as
 * names unless they are a close misspelling of a common word (e.g. "Becuase"). Words that appear
 * in `known` (the task prompt: names, places) are never flagged.
 */
export function findSpellingErrors(text: string, known: Iterable<string> = []): SpellingIssue[] {
  const { us, gb } = checkers();
  const ok = (w: string) => us.correct(w) || gb.correct(w);
  // Exact forms only: the prompt's "Tuesday" must not excuse the learner's "tuesday".
  const knownSet = new Set(known);
  const issues: SpellingIssue[] = [];

  for (const chunk of text.matchAll(/\S+/g)) {
    // Skip e-mail addresses, URLs and anything with digits.
    if (/@|:\/\/|www\.|\d/.test(chunk[0])) continue;
    for (const m of chunk[0].matchAll(/[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/g)) {
      const raw = m[0];
      const word = raw.replace(/’/g, "'");
      if (word.length < 2 || /^[A-Z]{2,}$/.test(word) || knownSet.has(word)) continue;
      if (ok(word)) continue;
      if (word.endsWith("'s") && ok(word.slice(0, -2))) continue;
      if (word.includes("-") && word.split("-").every((p) => p.length <= 1 || ok(p) || ok(p.toLowerCase()))) continue;

      const suggestion = bestSuggestion(word, [...us.suggest(word), ...gb.suggest(word)]);
      if (/^[A-Z]/.test(word)) {
        if (ok(word.toLowerCase())) continue;
        const looksLikeTypo =
          suggestion !== null && ok(suggestion.toLowerCase()) && levenshtein(word.toLowerCase(), suggestion.toLowerCase()) <= 2;
        if (!looksLikeTypo) continue;
      }
      const start = (chunk.index ?? 0) + (m.index ?? 0);
      issues.push({ start, end: start + raw.length, word: raw, suggestion });
    }
  }
  return issues;
}
