import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { mergeMemory, mergeProfile, parseBackup } from "@/server/backup";
import type { LearnerMemory } from "../exercises/store";
import type { MasteryRecord } from "../exercises/types";
import type { Profile } from "../profile/store";

const note = (id: string, updatedAt: number, title = id) => ({ id, title, body: "", tag: "general" as const, createdAt: 0, updatedAt });
const saved = (id: string, sessionId = "s", key = id) => ({
  id, sessionId, key, testNumber: 1, section: "reading" as const, taskKind: "academic_passage", numberLabel: "", preview: "", savedAt: 0,
});
const rec = (key: string, lastAttemptAt: number, status: MasteryRecord["status"]) =>
  ({ key, kind: "spelling", itemId: key, level: "A1", text: key, correctAnswer: key, lastUserAnswer: null, errorType: null, category: null, source: "bank",
    attempts: 1, correct: 0, incorrect: 1, streak: 0, everWrong: true, status, firstSeenAt: 0, lastAttemptAt, nextReviewAt: 0 }) as MasteryRecord;
const memory = (m: Partial<LearnerMemory>): LearnerMemory => ({ records: {}, weaknesses: {}, generated: { grammar: [], spelling: [] }, seen: {}, mistakes: {}, ...m });

describe("progress backup", () => {
  it("merges the profile without losing anything: union of saved questions and notes, newer note edit wins", () => {
    const here: Profile = { name: "Ilias", savedQuestions: [saved("a"), saved("b")], notes: [note("n1", 5, "mine"), note("n2", 1)] };
    const there: Profile = { name: "Other", savedQuestions: [saved("b"), saved("c"), saved("dup", "s", "a")], notes: [note("n1", 9, "newer"), note("n3", 2)] };
    const m = mergeProfile(here, there);
    expect(m.name).toBe("Ilias");
    expect(m.savedQuestions.map((q) => q.id).sort()).toEqual(["a", "b", "c"]);
    expect(m.notes.find((n) => n.id === "n1")!.title).toBe("newer");
    expect(m.notes).toHaveLength(3);
  });

  it("merges the mistake memory: most recent attempt wins, larger weakness count wins", () => {
    const w = (count: number) => ({ key: "grammar:articles", area: "grammar" as const, category: "articles", count, examples: [], lastAt: 0, generatedAtCount: 0 });
    const here = memory({ records: { x: rec("x", 10, "mastered"), y: rec("y", 5, "weak") }, weaknesses: { "grammar:articles": w(3) }, seen: { p: 2 } });
    const there = memory({ records: { x: rec("x", 4, "weak"), y: rec("y", 8, "improving"), z: rec("z", 1, "weak") }, weaknesses: { "grammar:articles": w(1) }, seen: { p: 5 } });
    const m = mergeMemory(here, there);
    expect([m.records.x.status, m.records.y.status, m.records.z.status]).toEqual(["mastered", "improving", "weak"]);
    expect(m.weaknesses["grammar:articles"].count).toBe(3);
    expect(m.seen.p).toBe(5);
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackup(Buffer.from("hello"))).toThrow(/not a TOEFL Practice/);
    expect(() => parseBackup(gzipSync(Buffer.from(JSON.stringify({ format: "other" }))))).toThrow(/not a TOEFL Practice/);
  });
});
