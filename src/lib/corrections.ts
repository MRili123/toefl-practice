import type { Correction } from "@/ai/feedbackTypes";

export interface Span {
  start: number;
  end: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where each correction sits in the text: stored offsets when valid, otherwise the first match. */
export function locateCorrections(text: string, corrections: Correction[]): (Span | null)[] {
  return corrections.map((c) => {
    if (c.start !== undefined && c.end !== undefined && text.slice(c.start, c.end).toLowerCase() === c.original.toLowerCase()) {
      return { start: c.start, end: c.end };
    }
    const words = c.original.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    const m = new RegExp(words.map(escapeRe).join("\\s+"), "i").exec(text);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  });
}

export const isRemoval = (suggestion: string) => suggestion.trim() === "" || suggestion.trim() === "(remove)";

export type CorrectedSegment = { text: string; index: null } | { text: string; index: number; original: string };

/**
 * The learner's text with the corrections applied. Where two corrections overlap, the model's
 * in-context grammar/vocabulary fix wins over a plain spelling fix ("arive" → "arrived", not "arrive").
 */
export function correctedSegments(text: string, corrections: Correction[]): CorrectedSegment[] {
  const spans = locateCorrections(text, corrections);
  const priority = (c: Correction) =>
    c.source === "model" && c.type !== "spelling" && c.type !== "capitalization" ? 0 : c.source === "spellcheck" ? 1 : 2;
  const candidates = corrections
    .map((c, index) => ({ c, index, span: spans[index] }))
    .filter((x): x is { c: Correction; index: number; span: Span } => x.span !== null)
    .sort((a, b) => priority(a.c) - priority(b.c) || b.span.end - b.span.start - (a.span.end - a.span.start));

  const chosen: typeof candidates = [];
  for (const x of candidates) {
    if (!chosen.some((y) => x.span.start < y.span.end && y.span.start < x.span.end)) chosen.push(x);
  }
  chosen.sort((a, b) => a.span.start - b.span.start);

  const out: CorrectedSegment[] = [];
  let pos = 0;
  for (const { c, index, span } of chosen) {
    let { start, end } = span;
    const removal = isRemoval(c.suggestion);
    // Removing a word also removes one neighbouring space so no double space is left behind.
    if (removal) {
      if (text[end] === " ") end++;
      else if (start > 0 && text[start - 1] === " ") start--;
    }
    if (start < pos) continue;
    if (start > pos) out.push({ text: text.slice(pos, start), index: null });
    out.push({ text: removal ? "" : c.suggestion, index, original: text.slice(span.start, span.end) });
    pos = end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), index: null });
  return out;
}

export function correctedText(text: string, corrections: Correction[]): string {
  return correctedSegments(text, corrections)
    .map((s) => s.text)
    .join("");
}

/** Practice-exercise corrections (writing/speaking) in the shared Correction shape, so the same helpers apply. */
export function fromExerciseCorrections(list: { original: string; correction: string; reason: string; type: string; start: number | null; end: number | null }[]): Correction[] {
  return list.map((c) => ({
    original: c.original,
    suggestion: c.correction,
    explanation: c.reason,
    type: c.type,
    start: c.start ?? undefined,
    end: c.end ?? undefined,
    source: "model" as const,
  }));
}
