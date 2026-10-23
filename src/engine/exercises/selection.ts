import { type Cefr, CEFR_LEVELS, type MasteryRecord } from "./types";

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so selection can be tested. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface LeveledItem {
  id: string;
  level: Cefr;
}

/** Items the learner got wrong and has not mastered yet — they come back first, by level, most-missed first. */
export const needsReview = (r: MasteryRecord | undefined) => !!r && r.everWrong && r.status !== "mastered";

/**
 * The run order for Spelling, Grammar and Listen & Repeat (no length, no level choice):
 * 1. every non-mastered mistake (A1 first; within a level, the most-missed first), each by its own id;
 * 2. `first` items (e.g. questions generated from the learner's recurring mistakes);
 * 3. then `perLevel` random items from each level, A1 → C2 (never-seen items first); a number for every level,
 *    or a count per level (a level left out, or Infinity, takes all its items);
 * 4. then the rest of the final level, then everything else — the run only ends when the hearts run out.
 * With `reviewInLevel`, steps 1 and 2 are folded into step 3: each level has exactly its count — its own mistakes
 * first (most-missed first), then its `first` items, then new items; any beyond the count wait for a later run.
 */
export function adaptivePlan(
  items: LeveledItem[],
  records: Map<string, MasteryRecord>,
  rng: Rng,
  { perLevel = 10 as number | Partial<Record<Cefr, number>>, first = [] as string[], reviewInLevel = false } = {},
): LeveledItem[] {
  const countFor = (l: Cefr) => (typeof perLevel === "number" ? perLevel : (perLevel[l] ?? Infinity));
  const byId = new Map(items.map((i) => [i.id, i]));
  const used = new Set<string>();
  const out: LeveledItem[] = [];
  const add = (i: LeveledItem | undefined) => {
    if (i && !used.has(i.id)) {
      used.add(i.id);
      out.push(i);
    }
  };
  const rank = (l: Cefr) => CEFR_LEVELS.indexOf(l);

  const mistakes = items
    .filter((i) => needsReview(records.get(i.id)))
    .sort((a, b) => rank(a.level) - rank(b.level) || (records.get(b.id)!.incorrect - records.get(a.id)!.incorrect));
  const firsts = first.map((id) => byId.get(id)).filter((i): i is LeveledItem => !!i);
  if (!reviewInLevel) {
    mistakes.forEach(add);
    firsts.forEach(add);
  }

  const fresh = (level: Cefr) => {
    const own = items.filter((i) => i.level === level && !used.has(i.id));
    const unseen = shuffle(own.filter((i) => !records.get(i.id)?.attempts), rng);
    const seen = shuffle(own.filter((i) => records.get(i.id)?.attempts && records.get(i.id)!.status !== "mastered"), rng);
    const mastered = shuffle(own.filter((i) => records.get(i.id)?.status === "mastered"), rng);
    return [...unseen, ...seen, ...mastered];
  };
  for (const level of CEFR_LEVELS) {
    const own = reviewInLevel ? [...mistakes, ...firsts].filter((i) => i.level === level && !used.has(i.id)) : [];
    [...own, ...fresh(level)].slice(0, countFor(level)).forEach(add);
  }
  const top = [...CEFR_LEVELS].reverse().find((l) => items.some((i) => i.level === l));
  if (top) fresh(top).forEach(add);
  for (const level of [...CEFR_LEVELS].reverse()) fresh(level).forEach(add);
  return out;
}

/** For prompts without right/wrong (writing, interaction questions): least-seen first, random among equals. */
export function pickLeastSeen(pool: string[], seen: Map<string, number>, n: number, rng: Rng, exclude: Set<string> = new Set()): string[] {
  return pool
    .filter((id) => !exclude.has(id))
    .map((id) => ({ id, k: (seen.get(id) ?? 0) + rng() * 0.9 }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.id);
}
