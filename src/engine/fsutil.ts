import fs from "node:fs/promises";

export async function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (e) {
      // Windows can briefly lock a file that is being read (EPERM/EBUSY).
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
}

/** Runs async tasks one after another per key (read-modify-write on the same file). */
export class KeyedMutex {
  private locks = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(key, run);
    void run
      .finally(() => {
        if (this.locks.get(key) === run) this.locks.delete(key);
      })
      .catch(() => undefined);
    return run;
  }
}
