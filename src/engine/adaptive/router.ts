import type { Section } from "../bank/types";
import { TOEFL_2026 } from "../config/toefl2026";

export type Route = "hard" | "easy";

export interface RoutingDecision {
  fromModuleId: string;
  nextModuleId: string;
  route: Route;
  correct: number;
  total: number;
  pct: number;
  threshold: number;
}

/**
 * TOEFL-style multistage routing (simulation — not ETS's proprietary algorithm):
 * Module 1 performance at or above the threshold routes to the harder Module 2.
 */
export function routeAfterStage1(
  section: Section,
  stage1: { moduleId: string; correct: number; total: number },
  threshold: number = TOEFL_2026.adaptive.routeHardThreshold,
): RoutingDecision {
  const pct = stage1.total === 0 ? 0 : stage1.correct / stage1.total;
  const route: Route = pct >= threshold ? "hard" : "easy";
  const next = section.modules.find((m) => m.stage === 2 && m.difficulty === route);
  if (!next) throw new Error(`Section ${section.id} has no stage-2 ${route} module`);
  return {
    fromModuleId: stage1.moduleId,
    nextModuleId: next.id,
    route,
    correct: stage1.correct,
    total: stage1.total,
    pct,
    threshold,
  };
}

export function isAdaptive(section: Section): boolean {
  return section.modules.some((m) => m.stage === 2);
}
