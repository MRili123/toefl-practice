import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { EngineError } from "@/engine/errors";
import { EXERCISE_RECORDINGS_DIR, exerciseSessions, type LearnerMemory, learnerMemory } from "@/engine/exercises/store";
import type { ExerciseSession } from "@/engine/exercises/types";
import { RECORDINGS_DIR } from "@/engine/paths";
import { type Profile, profiles } from "@/engine/profile/store";
import { sessions } from "@/engine/session/store";
import type { Session } from "@/engine/session/types";

/**
 * Progress backup: one gzip-compressed JSON file with test sessions, exercise sessions, their recordings,
 * the profile (name, saved questions, notes) and the exercise mistake memory. Local settings (API keys)
 * are never included.
 */
export interface Backup {
  format: "toefl-practice-backup";
  version: 1;
  createdAt: number;
  sessions: Session[];
  exerciseSessions: ExerciseSession[];
  /** "<sessionId>/<file>" → base64 audio */
  recordings: Record<string, string>;
  exerciseRecordings: Record<string, string>;
  profile: Profile;
  memory: LearnerMemory;
}

export interface BackupSummary {
  tests: number;
  exerciseSessions: number;
  savedQuestions: number;
  notes: number;
  mistakes: number;
  createdAt: number;
  /** Items that are not already on this computer. */
  new: { tests: number; exerciseSessions: number; savedQuestions: number; notes: number };
}

const REC_KEY = /^[0-9a-f-]{36}\/[\w.-]{1,120}$/;

async function readRecordings(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(root);
  } catch {
    return out;
  }
  for (const d of dirs) {
    let files: string[] = [];
    try {
      files = await fs.readdir(path.join(root, d));
    } catch {
      continue;
    }
    for (const f of files) {
      const key = `${d}/${f}`;
      if (REC_KEY.test(key)) out[key] = (await fs.readFile(path.join(root, d, f))).toString("base64");
    }
  }
  return out;
}

export async function exportBackup(): Promise<Buffer> {
  const backup: Backup = {
    format: "toefl-practice-backup",
    version: 1,
    createdAt: Date.now(),
    sessions: await sessions.list(),
    exerciseSessions: await exerciseSessions.list(),
    recordings: await readRecordings(RECORDINGS_DIR),
    exerciseRecordings: await readRecordings(EXERCISE_RECORDINGS_DIR),
    profile: await profiles.get(),
    memory: await learnerMemory.get(),
  };
  return gzipSync(Buffer.from(JSON.stringify(backup)));
}

export function parseBackup(file: Buffer): Backup {
  let data: Backup;
  try {
    data = JSON.parse(gunzipSync(file).toString("utf8")) as Backup;
  } catch {
    throw new EngineError("invalid_backup", "This file is not a TOEFL Practice progress backup.");
  }
  if (data?.format !== "toefl-practice-backup" || data.version !== 1) {
    throw new EngineError("invalid_backup", "This file is not a TOEFL Practice progress backup (or was made by a newer version).");
  }
  return data;
}

/* ---------- merge rules (pure) ---------- */

const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));

/** Name: keep the one already here; saved questions: union; notes: union, newer edit wins. */
export function mergeProfile(current: Profile, incoming: Profile): Profile {
  const saved = byId(current.savedQuestions);
  for (const q of incoming.savedQuestions ?? []) {
    const dup = [...saved.values()].some((s) => s.sessionId === q.sessionId && s.key === q.key);
    if (!saved.has(q.id) && !dup) saved.set(q.id, q);
  }
  const notes = byId(current.notes);
  for (const n of incoming.notes ?? []) {
    const here = notes.get(n.id);
    if (!here || n.updatedAt > here.updatedAt) notes.set(n.id, n);
  }
  return { name: current.name ?? incoming.name ?? null, savedQuestions: [...saved.values()], notes: [...notes.values()] };
}

/** Mastery: the record with the most recent attempt wins; weaknesses: the larger count; generated items: union. */
export function mergeMemory(current: LearnerMemory, incoming: LearnerMemory): LearnerMemory {
  const records = { ...current.records };
  for (const [k, r] of Object.entries(incoming.records ?? {})) {
    if (!records[k] || r.lastAttemptAt > records[k].lastAttemptAt) records[k] = r;
  }
  const weaknesses = { ...current.weaknesses };
  for (const [k, w] of Object.entries(incoming.weaknesses ?? {})) {
    if (!weaknesses[k] || w.count > weaknesses[k].count) weaknesses[k] = w;
  }
  const union = <T extends { id: string }>(a: T[], b: T[] = []) => [...byId([...b, ...a]).values()];
  const seen = { ...current.seen };
  for (const [k, n] of Object.entries(incoming.seen ?? {})) seen[k] = Math.max(seen[k] ?? 0, n);
  const mistakes = { ...(current.mistakes ?? {}) };
  for (const [k, l] of Object.entries(incoming.mistakes ?? {})) {
    // Keep the link that carries a generated question (the question itself arrives in generated.grammar).
    if (!mistakes[k] || (!mistakes[k].questionId && l.questionId)) mistakes[k] = { ...l, generation: undefined };
  }
  return {
    records,
    weaknesses,
    generated: {
      grammar: union(current.generated.grammar, incoming.generated?.grammar),
      spelling: union(current.generated.spelling, incoming.generated?.spelling),
    },
    seen,
    mistakes,
  };
}

/* ---------- import ---------- */

export async function summarizeBackup(b: Backup): Promise<BackupSummary> {
  const [tests, exercises, profile] = await Promise.all([sessions.list(), exerciseSessions.list(), profiles.get()]);
  const haveTests = new Set(tests.map((s) => s.id));
  const haveEx = new Set(exercises.map((s) => s.id));
  const haveSaved = new Set(profile.savedQuestions.map((q) => q.id));
  const haveNotes = new Set(profile.notes.map((n) => n.id));
  return {
    tests: b.sessions.length,
    exerciseSessions: b.exerciseSessions.length,
    savedQuestions: b.profile.savedQuestions?.length ?? 0,
    notes: b.profile.notes?.length ?? 0,
    mistakes: Object.values(b.memory.records ?? {}).filter((r) => r.incorrect > 0).length,
    createdAt: b.createdAt,
    new: {
      tests: b.sessions.filter((s) => !haveTests.has(s.id)).length,
      exerciseSessions: b.exerciseSessions.filter((s) => !haveEx.has(s.id)).length,
      savedQuestions: (b.profile.savedQuestions ?? []).filter((q) => !haveSaved.has(q.id)).length,
      notes: (b.profile.notes ?? []).filter((n) => !haveNotes.has(n.id)).length,
    },
  };
}

async function writeRecordings(root: string, recs: Record<string, string>) {
  for (const [key, b64] of Object.entries(recs ?? {})) {
    if (!REC_KEY.test(key)) continue;
    const file = path.join(root, ...key.split("/"));
    try {
      await fs.access(file);
      continue; // never overwrite an existing recording
    } catch {
      /* not present */
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(b64, "base64"));
  }
}

/** Merges a backup into this computer's data. Nothing already here is deleted. */
export async function importBackup(b: Backup): Promise<BackupSummary> {
  const summary = await summarizeBackup(b);
  for (const s of b.sessions ?? []) {
    const here = await sessions.get(s.id).catch(() => null);
    if (!here) await sessions.create(s);
  }
  for (const s of b.exerciseSessions ?? []) {
    const here = await exerciseSessions.get(s.id).catch(() => null);
    if (!here) await exerciseSessions.create(s);
  }
  await writeRecordings(RECORDINGS_DIR, b.recordings);
  await writeRecordings(EXERCISE_RECORDINGS_DIR, b.exerciseRecordings);
  await profiles.update((p) => {
    const merged = mergeProfile(p, b.profile);
    p.name = merged.name;
    p.savedQuestions = merged.savedQuestions;
    p.notes = merged.notes;
  });
  await learnerMemory.update((m) => {
    const merged = mergeMemory(m, b.memory);
    Object.assign(m, merged);
  });
  return summary;
}
