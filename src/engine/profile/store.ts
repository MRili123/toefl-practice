import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../paths";
import { KeyedMutex, writeAtomic } from "../fsutil";
import type { SectionId, TaskKind } from "../bank/types";
import type { Note } from "./notes";

export type { Note, NoteTag } from "./notes";

export interface SavedQuestion {
  id: string;
  sessionId: string;
  testNumber: number;
  /** Scored item id, or the task id for a Complete-the-Words passage; for exercises the exercise item id. */
  key: string;
  section: SectionId | "spelling" | "grammar";
  taskKind: TaskKind | string;
  /** "exercise" for questions saved from the Exercises section (testNumber is then 0). */
  origin?: "test" | "exercise";
  numberLabel: string;
  preview: string;
  savedAt: number;
}

export interface Profile {
  name: string | null;
  savedQuestions: SavedQuestion[];
  notes: Note[];
}

const FILE = path.join(DATA_DIR, "profile.json");

// Only the lock is process-wide; the repository itself is re-created on hot reload so code changes apply.
const g = globalThis as unknown as { __toeflProfileMutex?: KeyedMutex };
const mutex = (g.__toeflProfileMutex ??= new KeyedMutex());

class ProfileRepository {
  async get(): Promise<Profile> {
    try {
      const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<Profile>;
      return { name: raw.name ?? null, savedQuestions: raw.savedQuestions ?? [], notes: raw.notes ?? [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { name: null, savedQuestions: [], notes: [] };
      throw e;
    }
  }

  update<T>(fn: (p: Profile) => T | Promise<T>): Promise<{ profile: Profile; result: T }> {
    return mutex.run("profile", async () => {
      const profile = await this.get();
      const result = await fn(profile);
      await fs.mkdir(DATA_DIR, { recursive: true });
      await writeAtomic(FILE, JSON.stringify(profile, null, 2));
      return { profile, result };
    });
  }
}

export const profiles = new ProfileRepository();
