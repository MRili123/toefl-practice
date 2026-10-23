/**
 * Every tunable of the practice simulation lives here, so TOEFL criteria can be
 * updated without touching UI or engine logic.
 *
 * ETS facts are sourced from the "Updated TOEFL iBT Test Overview" (2026), the "TOEFL iBT 2026 Update
 * Test Blueprint and Specifications Document" and ets.org score-scale pages. Values marked SIMULATION
 * are this app's own assumptions: ETS does not publish its adaptive algorithm or raw→band conversion.
 */
import type { SectionId } from "../bank/types";

export const TOEFL_2026 = {
  sectionLabels: {
    reading: "Reading",
    listening: "Listening",
    writing: "Writing",
    speaking: "Speaking",
  } satisfies Record<SectionId, string>,

  /** Official 2026 item counts per section (ETS). */
  itemCounts: { reading: 50, listening: 47, writing: 12, speaking: 11 } satisfies Record<SectionId, number>,

  timing: {
    /**
     * Reading module clocks (ETS blueprint): router 18–21 min (upper bound used, so the section totals the
     * 30-minute base time) + lower/upper module 9 min. Listening has no module clock when timed: every question
     * is timed on its own (see listeningQuestionSeconds; ETS module totals: 18 min + 7 / 11 min).
     */
    moduleSeconds: {
      reading: { stage1: 21 * 60, easy: 9 * 60, hard: 9 * 60 },
    } as Partial<Record<SectionId, { stage1: number; easy: number; hard: number }>>,
    /**
     * Timed Listening (Real Test Conditions and timed practice): each question has its own clock, which starts when the question appears
     * (listening time is not counted) and you cannot return to a question. Per-question times are not in the
     * ETS documents; these follow 2026 test-taker reports (20 s or 30 s). Adjust here if needed.
     */
    listeningQuestionSeconds: { choose_response: 20, other: 30 },
    /** Writing task clocks: Email 7 min and Discussion 10 min (ETS); Build a Sentence gets the rest of the 23-minute section. */
    writing: { buildASentenceBlock: 360, email: 420, discussion: 600 },
    /** Estimated minutes per section for the dashboard (ETS approximate). */
    estimatedMinutes: { reading: 30, listening: 29, writing: 23, speaking: 8 } satisfies Record<SectionId, number>,
    /** Grace period for writes that arrive just after a deadline (network latency). */
    graceMs: 2000,
    /** Extra grace for speaking uploads, which happen after recording stops. */
    recordingUploadGraceMs: 15000,
  },

  /** SIMULATION: multistage routing after Module 1. */
  adaptive: {
    routeHardThreshold: 0.6,
  },

  scoring: {
    /** SIMULATION: path-adjusted proportion correct → 0–30 scale before banding. */
    objectivePath: {
      hard: { floor: 8, ceiling: 30 },
      easy: { floor: 0, ceiling: 22 },
    },
    /**
     * ETS raw points: Writing 0–20 (Build a Sentence 1 each, Email 0–5, Discussion 0–5);
     * Speaking 0–55 (Listen and Repeat and Take an Interview, 0–5 each).
     * SIMULATION: raw proportion → 0–30 scale before banding (ETS's raw→band table is not published).
     */
    writingRawMax: 20,
    speakingRawMax: 55,
  },
} as const;

export type Band = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5 | 5.5 | 6;
export const BANDS: Band[] = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

/** ETS: 1–6 band → 0–120 total range, with CEFR. */
export const TOTAL_CONCORDANCE: { band: Band; min: number; max: number; cefr: string }[] = [
  { band: 6, min: 114, max: 120, cefr: "C2" },
  { band: 5.5, min: 107, max: 113, cefr: "C1" },
  { band: 5, min: 95, max: 106, cefr: "C1" },
  { band: 4.5, min: 86, max: 94, cefr: "B2" },
  { band: 4, min: 72, max: 85, cefr: "B2" },
  { band: 3.5, min: 58, max: 71, cefr: "B1" },
  { band: 3, min: 44, max: 57, cefr: "B1" },
  { band: 2.5, min: 34, max: 43, cefr: "A2" },
  { band: 2, min: 24, max: 33, cefr: "A2" },
  { band: 1.5, min: 12, max: 23, cefr: "A1" },
  { band: 1, min: 0, max: 11, cefr: "A1" },
];

/** ETS: per-section 0–30 → 1–6 band. Each row: lowest 0–30 score that earns the band. */
export const SECTION_CONCORDANCE: Record<SectionId, { band: Band; min: number }[]> = {
  reading: [
    { band: 6, min: 29 }, { band: 5.5, min: 27 }, { band: 5, min: 24 }, { band: 4.5, min: 22 },
    { band: 4, min: 18 }, { band: 3.5, min: 12 }, { band: 3, min: 6 }, { band: 2.5, min: 4 },
    { band: 2, min: 3 }, { band: 1.5, min: 2 }, { band: 1, min: 0 },
  ],
  listening: [
    { band: 6, min: 28 }, { band: 5.5, min: 26 }, { band: 5, min: 22 }, { band: 4.5, min: 20 },
    { band: 4, min: 17 }, { band: 3.5, min: 13 }, { band: 3, min: 9 }, { band: 2.5, min: 6 },
    { band: 2, min: 4 }, { band: 1.5, min: 2 }, { band: 1, min: 0 },
  ],
  writing: [
    { band: 6, min: 29 }, { band: 5.5, min: 27 }, { band: 5, min: 24 }, { band: 4.5, min: 21 },
    { band: 4, min: 17 }, { band: 3.5, min: 15 }, { band: 3, min: 13 }, { band: 2.5, min: 11 },
    { band: 2, min: 7 }, { band: 1.5, min: 3 }, { band: 1, min: 0 },
  ],
  speaking: [
    { band: 6, min: 28 }, { band: 5.5, min: 27 }, { band: 5, min: 25 }, { band: 4.5, min: 23 },
    { band: 4, min: 20 }, { band: 3.5, min: 18 }, { band: 3, min: 16 }, { band: 2.5, min: 13 },
    { band: 2, min: 10 }, { band: 1.5, min: 5 }, { band: 1, min: 0 },
  ],
};

/** Dev/testing only: multiplies every clock (e.g. 0.05 → 30 min becomes 90 s). */
export function timeScale(): number {
  const v = Number(process.env.TOEFL_TIME_SCALE);
  return Number.isFinite(v) && v > 0 ? v : 1;
}
