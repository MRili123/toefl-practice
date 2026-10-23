import type { Cefr, ItemSource, MasteryRecord, MasteryStatus, TrackedKind } from "./types";

const DAY = 24 * 60 * 60 * 1000;
/** Review intervals after 1, 2, 3 and 4+ consecutive correct answers. */
export const REVIEW_DAYS = [1, 3, 7, 21];

export const masteryKey = (kind: TrackedKind, itemId: string) => `${kind}:${itemId}`;

export interface ItemInfo {
  kind: TrackedKind;
  itemId: string;
  level: Cefr;
  text: string;
  correctAnswer: string;
  category?: string | null;
  source?: ItemSource;
}

export function newRecord(info: ItemInfo, now: number): MasteryRecord {
  return {
    key: masteryKey(info.kind, info.itemId),
    kind: info.kind,
    itemId: info.itemId,
    level: info.level,
    text: info.text,
    correctAnswer: info.correctAnswer,
    lastUserAnswer: null,
    errorType: null,
    category: info.category ?? null,
    source: info.source ?? "bank",
    attempts: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
    everWrong: false,
    status: "new",
    firstSeenAt: now,
    lastAttemptAt: now,
    nextReviewAt: now,
  };
}

/**
 * Applies one answer. A mistake always makes the item weak and due again at once. Correct answers climb:
 * after a mistake improving → strong → mastered; never missed: learning → strong → mastered.
 * A mastered item that is missed returns to the weak pool. Records are never deleted.
 */
export function applyResult(
  record: MasteryRecord,
  correct: boolean,
  now: number,
  detail: { userAnswer?: string | null; errorType?: string | null } = {},
): MasteryRecord {
  const r = { ...record, attempts: record.attempts + 1, lastAttemptAt: now };
  if (detail.userAnswer !== undefined) r.lastUserAnswer = detail.userAnswer;
  if (correct) {
    r.correct += 1;
    r.streak += 1;
    r.status = statusForStreak(r.streak, r.everWrong);
    r.nextReviewAt = now + REVIEW_DAYS[Math.min(r.streak, REVIEW_DAYS.length) - 1] * DAY;
  } else {
    r.incorrect += 1;
    r.streak = 0;
    r.everWrong = true;
    r.status = "weak";
    r.errorType = detail.errorType ?? r.errorType;
    r.nextReviewAt = now;
  }
  return r;
}

function statusForStreak(streak: number, everWrong: boolean): MasteryStatus {
  if (streak >= 3) return "mastered";
  if (streak === 2) return "strong";
  return everWrong ? "improving" : "learning";
}

/** Higher = more urgent to practise again. */
export function priority(r: MasteryRecord, now: number): number {
  const statusWeight: Record<MasteryStatus, number> = { weak: 6, improving: 3, learning: 2, new: 1, strong: 1, mastered: 0 };
  const overdueDays = Math.max(0, (now - r.nextReviewAt) / DAY);
  return statusWeight[r.status] + r.incorrect * 1.5 - r.streak + Math.min(overdueDays, 10) * 0.2;
}

export const isActiveMistake = (r: MasteryRecord) => r.status === "weak" || r.status === "improving";

/** Mastery counts mastered items fully, strong ¾, learning/improving ½ and weak 0 — over items practised. */
export function masteryPercent(records: MasteryRecord[]): number | null {
  const seen = records.filter((r) => r.attempts > 0);
  if (seen.length === 0) return null;
  const w: Record<MasteryStatus, number> = { mastered: 1, strong: 0.75, learning: 0.5, improving: 0.5, weak: 0, new: 0 };
  return Math.round((seen.reduce((s, r) => s + w[r.status], 0) / seen.length) * 100);
}

export function statusCounts(records: MasteryRecord[]) {
  const c = { mastered: 0, learning: 0, weak: 0 };
  for (const r of records) {
    if (r.attempts === 0) continue;
    if (r.status === "mastered") c.mastered++;
    else if (r.status === "weak") c.weak++;
    else c.learning++;
  }
  return c;
}
