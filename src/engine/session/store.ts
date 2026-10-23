import fs from "node:fs/promises";
import path from "node:path";
import { SESSIONS_DIR } from "../paths";
import { EngineError } from "../errors";
import { KeyedMutex, writeAtomic } from "../fsutil";
import type { Session } from "./types";

/** Storage boundary: swap this implementation (e.g. SQLite) without touching engine logic. */
export interface SessionRepository {
  get(id: string): Promise<Session | null>;
  list(): Promise<Session[]>;
  create(session: Session): Promise<void>;
  update<T>(id: string, fn: (s: Session) => T | Promise<T>): Promise<{ session: Session; result: T }>;
}

const ID_RE = /^[0-9a-f-]{36}$/;

function fileOf(id: string): string {
  if (!ID_RE.test(id)) throw new EngineError("session_not_found", "Session not found", 404);
  return path.join(SESSIONS_DIR, `${id}.json`);
}

class JsonFileSessionRepository implements SessionRepository {
  private mutex = new KeyedMutex();

  async get(id: string): Promise<Session | null> {
    try {
      return JSON.parse(await fs.readFile(fileOf(id), "utf8")) as Session;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async list(): Promise<Session[]> {
    let names: string[];
    try {
      names = await fs.readdir(SESSIONS_DIR);
    } catch {
      return [];
    }
    const sessions = await Promise.all(
      names.filter((n) => n.endsWith(".json")).map((n) => this.get(n.replace(/\.json$/, "")).catch(() => null)),
    );
    return sessions.filter((s): s is Session => s !== null);
  }

  async create(session: Session): Promise<void> {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    await writeAtomic(fileOf(session.id), JSON.stringify(session));
  }

  update<T>(id: string, fn: (s: Session) => T | Promise<T>): Promise<{ session: Session; result: T }> {
    return this.mutex.run(id, async () => {
      const session = await this.get(id);
      if (!session) throw new EngineError("session_not_found", "Session not found", 404);
      const result = await fn(session);
      session.updatedAt = Date.now();
      await writeAtomic(fileOf(id), JSON.stringify(session));
      return { session, result };
    });
  }
}

// Route handlers may be bundled separately; one repository (and lock table) per process.
const g = globalThis as unknown as { __toeflSessions?: SessionRepository };
export const sessions: SessionRepository = (g.__toeflSessions ??= new JsonFileSessionRepository());
