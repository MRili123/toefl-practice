import type { SectionId } from "../bank/types";
import type { Route } from "../adaptive/router";
import { type Band, TOEFL_2026 } from "../config/toefl2026";
import { bandFromScale30 } from "./concordance";

export interface SectionScore {
  section: SectionId;
  status: "final" | "pending";
  band: Band | null;
  scale30: number | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Reading/Listening: path-adjusted proportion correct over every item on the taken path. */
export function objectiveSectionScore(
  section: "reading" | "listening",
  correct: number,
  total: number,
  route: Route,
): SectionScore {
  const { floor, ceiling } = TOEFL_2026.scoring.objectivePath[route];
  const pct = total === 0 ? 0 : correct / total;
  const scale30 = floor + (ceiling - floor) * clamp01(pct);
  return { section, status: "final", band: bandFromScale30(section, scale30), scale30: Math.round(scale30 * 10) / 10 };
}

/** AI-evaluated task scores: null = evaluation still pending. */
export interface WritingInputs {
  basCorrect: number;
  basTotal: number;
  email: number | null; // 0–5
  discussion: number | null; // 0–5
}

/** ETS raw score: Build a Sentence (1 point each) + Email (0–5) + Discussion (0–5) = 0–20. */
export function writingSectionScore(w: WritingInputs): SectionScore {
  if (w.email === null || w.discussion === null) return { section: "writing", status: "pending", band: null, scale30: null };
  const raw = w.basCorrect + w.email + w.discussion;
  const scale30 = 30 * clamp01(raw / TOEFL_2026.scoring.writingRawMax);
  return { section: "writing", status: "final", band: bandFromScale30("writing", scale30), scale30: Math.round(scale30 * 10) / 10 };
}

export interface SpeakingInputs {
  listenAndRepeat: (number | null)[]; // 0–5 per item
  interview: (number | null)[]; // 0–5 per item
}

/** ETS raw score: 7 Listen and Repeat + 4 Take an Interview items, 0–5 each = 0–55. */
export function speakingSectionScore(s: SpeakingInputs): SectionScore {
  const all = [...s.listenAndRepeat, ...s.interview];
  if (all.some((v) => v === null)) return { section: "speaking", status: "pending", band: null, scale30: null };
  const raw = (all as number[]).reduce((a, b) => a + b, 0);
  const scale30 = 30 * clamp01(raw / TOEFL_2026.scoring.speakingRawMax);
  return { section: "speaking", status: "final", band: bandFromScale30("speaking", scale30), scale30: Math.round(scale30 * 10) / 10 };
}
