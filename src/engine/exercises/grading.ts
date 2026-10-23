import { gradeCtw } from "../evaluation/objective";
import type { GrammarFeedback, GrammarQuestion, ReadingFeedback, ReadingPassage, SpellingFeedback, SpellingItem } from "./types";

/**
 * British spellings accepted for the American spelling used in the bank (checked word by word, with common
 * inflections). The learner may use either consistently; neither counts as a mistake.
 */
const UK_TO_US: Record<string, string> = Object.fromEntries(
  (
    "colour:color favour:favor favourite:favorite behaviour:behavior neighbour:neighbor labour:labor honour:honor humour:humor " +
    "harbour:harbor flavour:flavor rumour:rumor vapour:vapor endeavour:endeavor centre:center theatre:theater metre:meter " +
    "litre:liter fibre:fiber organise:organize organisation:organization realise:realize recognise:recognize " +
    "emphasise:emphasize summarise:summarize criticise:criticize apologise:apologize specialise:specialize " +
    "prioritise:prioritize minimise:minimize maximise:maximize categorise:categorize characterise:characterize " +
    "memorise:memorize modernise:modernize utilise:utilize analyse:analyze paralyse:paralyze catalogue:catalog " +
    "defence:defense offence:offense licence:license programme:program grey:gray jewellery:jewelry enrol:enroll " +
    "fulfil:fulfill skilful:skillful judgement:judgment ageing:aging travelled:traveled travelling:traveling " +
    "traveller:traveler cancelled:canceled cancelling:canceling modelling:modeling labelled:labeled " +
    "fuelled:fueled counselling:counseling practise:practice sceptical:skeptical tyre:tire manoeuvre:maneuver " +
    "aluminium:aluminum mould:mold plough:plow cheque:check pyjamas:pajamas acknowledgement:acknowledgment " +
    "encyclopaedia:encyclopedia paediatric:pediatric anaesthetic:anesthetic oestrogen:estrogen foetus:fetus"
  )
    .split(" ")
    .flatMap((pair) => {
      const [uk, us] = pair.split(":");
      const forms: [string, string][] = [[uk, us]];
      for (const suf of ["s", "d", "ed", "ing", "r", "rs", "able", "ation", "ations", "ite", "ites", "ful", "less"]) {
        const ukStem = uk.endsWith("e") && /^[aeiu]/.test(suf) ? uk.slice(0, -1) : uk;
        const usStem = us.endsWith("e") && /^[aeiu]/.test(suf) ? us.slice(0, -1) : us;
        forms.push([ukStem + suf, usStem + suf]);
      }
      return forms;
    }),
);

const toUs = (text: string) => text.replace(/\p{L}+/gu, (w) => UK_TO_US[w] ?? w);

/** Lenient normalization: case, curly quotes, spacing and edge punctuation never count as spelling mistakes. */
export function normalizeSpelling(text: string, type: SpellingItem["type"]): string {
  return toUs(baseNormalize(text, type));
}

function baseNormalize(text: string, type: SpellingItem["type"]): string {
  const t = text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "") // café = cafe
    .normalize("NFC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (type === "word") return t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  // Sentences: punctuation and capitalization are ignored; hyphens count as spaces ("well-known" = "well known").
  return t
    .replace(/-/g, " ")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/(^|\s)'+|'+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

type Op<T> = { op: "same" | "sub"; a: T; b: T } | { op: "del"; a: T } | { op: "ins"; b: T };

/** Levenshtein alignment of `given` (a) against `expected` (b): del = extra in given, ins = missing from given. */
export function align<T>(a: T[], b: T[]): Op<T>[] {
  const n = a.length;
  const m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  const ops: Op<T>[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      ops.push(a[i - 1] === b[j - 1] ? { op: "same", a: a[i - 1], b: b[j - 1] } : { op: "sub", a: a[i - 1], b: b[j - 1] });
      i--;
      j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      ops.push({ op: "del", a: a[--i] });
    } else {
      ops.push({ op: "ins", b: b[--j] });
    }
  }
  return ops.reverse();
}

function segments(ops: Op<string>[], sep: string): SpellingFeedback["diff"] {
  const out: SpellingFeedback["diff"] = [];
  const push = (text: string, op: "same" | "add" | "del") => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += sep + text;
    else out.push({ text, op });
  };
  for (const o of ops) {
    if (o.op === "same") push(o.a, "same");
    else if (o.op === "sub") {
      push(o.a, "del");
      push(o.b, "add");
    } else if (o.op === "del") push(o.a, "del");
    else push(o.b, "add");
  }
  return out;
}

const q = (s: string) => `“${s}”`;

/** A plausible misspelling of `expected` (not a different or random word): few letters changed. */
export function isNearMiss(given: string, expected: string): boolean {
  if (!given || given === expected) return false;
  const edits = align([...given], [...expected]).filter((o) => o.op !== "same").length;
  return edits <= Math.max(1, Math.round(expected.length * 0.34));
}

/** One short, concrete reason for a single-word mistake, or null when the difference is not a simple one. */
export function explainWord(given: string, expected: string): { text: string | null; errorType: string } {
  if (!given) return { text: "No answer was given.", errorType: "no-answer" };
  const ops = align([...given], [...expected]).filter((o) => o.op !== "same");
  if (ops.length === 2 && ops[0].op === "sub" && ops[1].op === "sub") {
    const i = [...given].findIndex((c, k) => c !== expected[k]);
    if (i >= 0 && given[i] === expected[i + 1] && given[i + 1] === expected[i]) {
      return { text: `The letters ${q(given.slice(i, i + 2))} are reversed — write ${q(expected.slice(i, i + 2))}.`, errorType: "swapped-letters" };
    }
  }
  if (ops.length === 1) {
    const o = ops[0];
    if (o.op === "ins") {
      const idx = [...expected].findIndex((c, k) => c !== given[k]);
      const doubled = idx > 0 && expected[idx - 1] === o.b ? true : expected[idx + 1] === o.b;
      return doubled
        ? { text: `The correct spelling has a double ${q(o.b + o.b)}.`, errorType: "double-letter" }
        : { text: `The correct spelling contains the missing ${q(o.b)}.`, errorType: "missing-letter" };
    }
    if (o.op === "del") return { text: `There is an extra ${q(o.a)} in your spelling.`, errorType: "extra-letter" };
    if (o.op === "sub") return { text: `Write ${q(o.b)} instead of ${q(o.a)}.`, errorType: "wrong-letter" };
  }
  return { text: null, errorType: "misspelling" };
}

export function gradeSpelling(item: SpellingItem, rawGiven: string): { correct: boolean; feedback: SpellingFeedback; errorType: string | null } {
  const given = normalizeSpelling(rawGiven, item.type);
  const expected = normalizeSpelling(item.text, item.type);
  const correct = given === expected;

  if (item.type === "word") {
    const why = correct ? null : explainWord(given, expected);
    return {
      correct,
      errorType: why?.errorType ?? null,
      feedback: {
        kind: "spelling",
        expected: item.text,
        given: rawGiven.trim(),
        diff: segments(align([...given], [...expected]), ""),
        explanation: why?.text ?? null,
        wrongWords: correct ? [] : [{ given, expected }],
      },
    };
  }

  const ops = align(given ? given.split(" ") : [], expected.split(" "));
  const wrongWords = ops.flatMap((o) =>
    o.op === "sub" ? [{ given: o.a, expected: o.b }] : o.op === "ins" ? [{ given: "", expected: o.b }] : [],
  );
  const missing = ops.filter((o) => o.op === "ins").length;
  const extra = ops.filter((o) => o.op === "del").length;
  const subs = ops.filter((o) => o.op === "sub") as { a: string; b: string }[];
  let explanation: string | null = null;
  let errorType: string | null = null;
  if (!correct) {
    if (!given) {
      explanation = "No answer was given.";
      errorType = "no-answer";
    } else if (subs.length === 1 && missing === 0 && extra === 0) {
      const why = explainWord(subs[0].a, subs[0].b);
      explanation = `${q(subs[0].a)} should be ${q(subs[0].b)}.${why.text ? ` ${why.text}` : ""}`;
      errorType = why.errorType;
    } else {
      const parts = [
        subs.length ? `${subs.length} misspelled word${subs.length === 1 ? "" : "s"}` : "",
        missing ? `${missing} missing word${missing === 1 ? "" : "s"}` : "",
        extra ? `${extra} extra word${extra === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      explanation = parts.length ? `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()) : null;
      errorType = subs.length ? "misspelling" : "missing-word";
    }
  }
  return {
    correct,
    errorType,
    feedback: { kind: "spelling", expected: item.text, given: rawGiven.trim(), diff: segments(ops, " "), explanation, wrongWords },
  };
}

export function gradeGrammar(qn: GrammarQuestion, chosen: number): { correct: boolean; feedback: GrammarFeedback; errorType: string } {
  return {
    correct: chosen === qn.answer,
    errorType: qn.category,
    feedback: { kind: "grammar", answer: qn.answer, chosen, explanation: qn.explanation, category: qn.category },
  };
}

/** Writing/speaking responses below the level's band (minus half a band) cost a heart in speaking. */
/**
 * Reading (Complete the Words): each blank is right when the missing letters (or the whole word) are typed,
 * ignoring case, exactly as in the test. The passage counts as correct only when every word is.
 */
export function gradeReading(p: ReadingPassage, answers: Record<string, string>, timedOut: boolean): { correct: boolean; feedback: ReadingFeedback } {
  const blanks = p.blanks.map((b) => {
    const given = String(answers[b.id] ?? "").replace(/\s/g, "").slice(0, 40);
    return { ...b, given, correct: gradeCtw(b, { kind: "text", value: given }) === "correct" };
  });
  const correct = blanks.filter((b) => b.correct).length;
  return { correct: correct === blanks.length, feedback: { kind: "reading", blanks, correct, total: blanks.length, timedOut } };
}

export const passesLevel = (score: number, levelBand: number) => score >= levelBand - 0.5;
