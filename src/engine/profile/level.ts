/**
 * Learner level estimation. Tests are the primary evidence; exercises and course assessments can
 * only refine a level that tests have established — watching lessons never raises it.
 */
import { SECTION_ORDER, type SectionId } from "../bank/types";
import type { Band } from "../config/toefl2026";
import { overallBand } from "../scoring/concordance";

export type EvidenceSource = "test" | "exercise" | "course";

export interface Evidence {
  skill: SectionId;
  /** 1–6 band (tests) or band-equivalent (exercises, course assessments). */
  band: number;
  at: number;
  source: EvidenceSource;
  /** Reliability of this piece of evidence before source weighting (e.g. test mode). */
  reliability: number;
}

export const LEVEL_CONFIG = {
  sourceWeight: { test: 1, exercise: 0.35, course: 0.1 } satisfies Record<EvidenceSource, number>,
  /** Test reliability by mode: real conditions are the strongest evidence. */
  modeReliability: { real: 1, practiceTimed: 0.7, practiceOther: 0.5 },
  halfLifeDays: 60,
};

export interface SkillLevel {
  skill: SectionId;
  level: Band | null;
  /** Latest test score minus the previous one; null without two test scores. */
  trend: number | null;
  latest: number | null;
  tests: number;
  exercises: number;
  courses: number;
}

export interface LevelSummary {
  overall: Band | null;
  skills: Record<SectionId, SkillLevel>;
  missingSkills: SectionId[];
}

const DAY = 86_400_000;
const toBand = (x: number) => Math.max(1, Math.min(6, Math.floor(x * 2 + 0.5) / 2)) as Band;

export function computeLevels(evidence: Evidence[], now: number): LevelSummary {
  const skills = {} as Record<SectionId, SkillLevel>;
  for (const skill of SECTION_ORDER) {
    const mine = evidence.filter((e) => e.skill === skill);
    const tests = mine.filter((e) => e.source === "test").sort((a, b) => a.at - b.at);
    let level: Band | null = null;
    if (tests.length > 0) {
      let sum = 0;
      let weight = 0;
      for (const e of mine) {
        const recency = Math.pow(0.5, Math.max(0, now - e.at) / DAY / LEVEL_CONFIG.halfLifeDays);
        const w = LEVEL_CONFIG.sourceWeight[e.source] * e.reliability * recency;
        sum += w * e.band;
        weight += w;
      }
      level = weight > 0 ? toBand(sum / weight) : null;
    }
    skills[skill] = {
      skill,
      level,
      trend: tests.length >= 2 ? tests[tests.length - 1].band - tests[tests.length - 2].band : null,
      latest: tests.length ? tests[tests.length - 1].band : null,
      tests: tests.length,
      exercises: mine.filter((e) => e.source === "exercise").length,
      courses: mine.filter((e) => e.source === "course").length,
    };
  }
  const missingSkills = SECTION_ORDER.filter((s) => skills[s].level === null);
  const overall = missingSkills.length === 0 ? overallBand(SECTION_ORDER.map((s) => skills[s].level!)) : null;
  return { overall, skills, missingSkills };
}
