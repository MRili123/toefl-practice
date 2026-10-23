/**
 * Splits a (possibly sentence-long) correction into minimal word-level edits, so each mistake is
 * counted and highlighted on its own. Offsets are absolute positions in the learner's text.
 */

export interface Edit {
  start: number;
  end: number;
  original: string;
  suggestion: string;
  kind: "capitalization" | "punctuation" | "word";
}

interface Token {
  text: string;
  start: number;
  end: number;
}

const tokenize = (s: string): Token[] =>
  [...s.matchAll(/[\p{L}\p{N}’'-]+|[^\s\p{L}\p{N}]/gu)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));

const isPunct = (t: string) => /^[^\p{L}\p{N}]+$/u.test(t);
const norm = (t: string) => t.replace(/’/g, "'");

type Op = { type: "eq"; a: number; b: number } | { type: "del"; a: number } | { type: "ins"; b: number };

function diff(a: Token[], b: Token[]): Op[] {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = norm(a[i].text) === norm(b[j].text) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && norm(a[i].text) === norm(b[j].text)) ops.push({ type: "eq", a: i++, b: j++ });
    else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) ops.push({ type: "ins", b: j++ });
    else ops.push({ type: "del", a: i++ });
  }
  return ops;
}

export function splitIntoEdits(original: string, offset: number, suggestion: string): Edit[] {
  const a = tokenize(original);
  const b = tokenize(suggestion);
  const ops = diff(a, b);
  const edits: Edit[] = [];

  let k = 0;
  while (k < ops.length) {
    if (ops[k].type === "eq") {
      k++;
      continue;
    }
    const hunk: Op[] = [];
    while (k < ops.length && ops[k].type !== "eq") hunk.push(ops[k++]);

    const aIdx = hunk.flatMap((o) => (o.type === "del" ? [o.a] : []));
    const bIdx = hunk.flatMap((o) => (o.type === "ins" ? [o.b] : []));
    // Pure insertion: anchor on the preceding word (or the following one at the start).
    let aFrom: number, aTo: number, bFrom: number, bTo: number;
    if (aIdx.length === 0) {
      const prevEq = [...ops.slice(0, k - hunk.length)].reverse().find((o) => o.type === "eq") as { a: number; b: number } | undefined;
      const nextEq = ops.slice(k).find((o) => o.type === "eq") as { a: number; b: number } | undefined;
      const anchor = prevEq ?? nextEq;
      if (!anchor) continue;
      aFrom = aTo = anchor.a;
      bFrom = Math.min(anchor.b, ...bIdx);
      bTo = Math.max(anchor.b, ...bIdx);
    } else {
      aFrom = Math.min(...aIdx);
      aTo = Math.max(...aIdx);
      bFrom = bIdx.length ? Math.min(...bIdx) : -1;
      bTo = bIdx.length ? Math.max(...bIdx) : -1;
    }
    const origText = original.slice(a[aFrom].start, a[aTo].end);
    const suggText = bFrom >= 0 ? suggestion.slice(b[bFrom].start, b[bTo].end) : "";
    const changed = [...aIdx.map((x) => a[x].text), ...bIdx.map((x) => b[x].text)];
    const kind: Edit["kind"] =
      origText.toLowerCase() === suggText.toLowerCase()
        ? "capitalization"
        : changed.every(isPunct)
          ? "punctuation"
          : "word";
    edits.push({ start: offset + a[aFrom].start, end: offset + a[aTo].end, original: origText, suggestion: suggText || "(remove)", kind });
  }
  return edits;
}
