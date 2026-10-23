import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../paths";
import { EngineError } from "../errors";
import { KeyedMutex, writeAtomic } from "../fsutil";
import type { ExerciseSession, GrammarQuestion, MasteryRecord, MistakeLink, SpellingItem, WeaknessRecord } from "./types";

export const EXERCISE_SESSIONS_DIR = path.join(DATA_DIR, "exercise-sessions");
export const EXERCISE_RECORDINGS_DIR = path.join(DATA_DIR, "exercise-recordings");
const MEMORY_FILE = path.join(DATA_DIR, "exercises", "memory.json");

/** Everything the app remembers about the learner's exercise performance. Never pruned. */
export interface LearnerMemory {
  records: Record<string, MasteryRecord>;
  weaknesses: Record<string, WeaknessRecord>;
  generated: { grammar: GrammarQuestion[]; spelling: SpellingItem[] };
  /** How often each non-graded prompt (writing, interaction question) was given. */
  seen: Record<string, number>;
  /** Spelling/grammar mistakes already processed (word added to practice, grammar question generated). */
  mistakes: Record<string, MistakeLink>;
}

const emptyMemory = (): LearnerMemory => ({ records: {}, weaknesses: {}, generated: { grammar: [], spelling: [] }, seen: {}, mistakes: {} });

// Locks are process-wide; the repositories are re-created on hot reload so code changes apply.
const g = globalThis as unknown as { __toeflExerciseMutex?: KeyedMutex };
const mutex = (g.__toeflExerciseMutex ??= new KeyedMutex());

const ID_RE = /^[0-9a-f-]{36}$/;
function fileOf(id: string) {
  if (!ID_RE.test(id)) throw new EngineError("exercise_not_found", "Practice session not found", 404);
  return path.join(EXERCISE_SESSIONS_DIR, `${id}.json`);
}

export const exerciseSessions = {
  async get(id: string): Promise<ExerciseSession | null> {
    try {
      return JSON.parse(await fs.readFile(fileOf(id), "utf8")) as ExerciseSession;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  },

  async list(): Promise<ExerciseSession[]> {
    let names: string[];
    try {
      names = await fs.readdir(EXERCISE_SESSIONS_DIR);
    } catch {
      return [];
    }
    const all = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => this.get(n.slice(0, -5)).catch(() => null)));
    return all.filter((s): s is ExerciseSession => s !== null);
  },

  async create(s: ExerciseSession) {
    await fs.mkdir(EXERCISE_SESSIONS_DIR, { recursive: true });
    await writeAtomic(fileOf(s.id), JSON.stringify(s));
  },

  update<T>(id: string, fn: (s: ExerciseSession) => T | Promise<T>): Promise<{ session: ExerciseSession; result: T }> {
    return mutex.run(`session:${id}`, async () => {
      const s = await this.get(id);
      if (!s) throw new EngineError("exercise_not_found", "Practice session not found", 404);
      const result = await fn(s);
      s.updatedAt = Date.now();
      await writeAtomic(fileOf(id), JSON.stringify(s));
      return { session: s, result };
    });
  },

  async remove(id: string) {
    await fs.rm(fileOf(id), { force: true });
    await fs.rm(path.join(EXERCISE_RECORDINGS_DIR, id), { recursive: true, force: true });
  },
};

export const learnerMemory = {
  async get(): Promise<LearnerMemory> {
    try {
      const raw = JSON.parse(await fs.readFile(MEMORY_FILE, "utf8")) as Partial<LearnerMemory>;
      const base = emptyMemory();
      return {
        records: raw.records ?? base.records,
        weaknesses: raw.weaknesses ?? base.weaknesses,
        generated: { grammar: raw.generated?.grammar ?? [], spelling: raw.generated?.spelling ?? [] },
        seen: raw.seen ?? base.seen,
        mistakes: raw.mistakes ?? base.mistakes,
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyMemory();
      throw e;
    }
  },

  update<T>(fn: (m: LearnerMemory) => T | Promise<T>): Promise<{ memory: LearnerMemory; result: T }> {
    return mutex.run("memory", async () => {
      const m = await this.get();
      const result = await fn(m);
      await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });
      await writeAtomic(MEMORY_FILE, JSON.stringify(m));
      return { memory: m, result };
    });
  },
};
