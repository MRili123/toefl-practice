import fs from "node:fs";
import path from "node:path";
import { BANK_DIR } from "../paths";
import { EngineError } from "../errors";
import { type ScoredItem, scoredItems } from "./items";
import type { BankTest, CtwBlank, McqItem, Module, SectionId, Task, TestMeta } from "./types";

export interface ItemRef {
  sectionId: SectionId;
  moduleId: string;
  task: Task;
  scored: ScoredItem;
  mcq: McqItem | null;
  blank: CtwBlank | null;
}

interface BankCache {
  tests: Map<number, BankTest>;
  indexes: Map<number, Map<string, ItemRef>>;
  meta: TestMeta[] | null;
}

// Route handlers may be bundled separately; keep one cache per process.
const g = globalThis as unknown as { __toeflBank?: BankCache };
const cache: BankCache = (g.__toeflBank ??= { tests: new Map(), indexes: new Map(), meta: null });

export function listTests(): TestMeta[] {
  if (!cache.meta) {
    const file = path.join(BANK_DIR, "index.json");
    if (!fs.existsSync(file)) throw new EngineError("bank_missing", "Question bank not found. Run `npm run import-bank`.", 500);
    cache.meta = JSON.parse(fs.readFileSync(file, "utf8")) as TestMeta[];
  }
  return cache.meta;
}

export function loadTest(n: number): BankTest {
  let t = cache.tests.get(n);
  if (!t) {
    const file = path.join(BANK_DIR, `test-${String(n).padStart(2, "0")}.json`);
    if (!fs.existsSync(file)) throw new EngineError("test_not_found", `Test ${n} not found`, 404);
    t = JSON.parse(fs.readFileSync(file, "utf8")) as BankTest;
    cache.tests.set(n, t);
  }
  return t;
}

export function itemIndex(n: number): Map<string, ItemRef> {
  let idx = cache.indexes.get(n);
  if (!idx) {
    idx = new Map();
    const test = loadTest(n);
    for (const section of Object.values(test.sections)) {
      for (const mod of section.modules) {
        for (const task of mod.tasks) {
          for (const scored of scoredItems(task)) {
            const mcq = "questions" in task ? (task.questions as McqItem[]).find((q) => q.id === scored.id) ?? null : null;
            const blank = task.kind === "complete_the_words" ? task.blanks.find((b) => b.id === scored.id) ?? null : null;
            idx.set(scored.id, { sectionId: section.id, moduleId: mod.id, task, scored, mcq, blank });
          }
        }
      }
    }
    cache.indexes.set(n, idx);
  }
  return idx;
}

export function getModule(test: BankTest, sectionId: SectionId, moduleId: string): Module {
  const m = test.sections[sectionId].modules.find((x) => x.id === moduleId);
  if (!m) throw new EngineError("module_not_found", `Module ${moduleId} not found`, 500);
  return m;
}
