import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTest } from "../bank/loader";
import { describeQuestion, reviewSaved } from "../profile/register";
import type { SavedQuestion } from "../profile/store";
import { beginSection, createSession, endBlockEarly, normalizeConfig, saveAnswer } from "../session/session";

const hasBank = fs.existsSync(path.join(process.cwd(), "data", "bank", "test-01.json"));

describe.skipIf(!hasBank)("question register", () => {
  const test = loadTest(1);
  const ctw = test.sections.reading.modules[0].tasks[0];
  const repeat = test.sections.speaking.modules[0].tasks[0];

  it("describes a Complete-the-Words passage as one question with its number range", () => {
    const d = describeQuestion(test, ctw.id);
    expect(d.section).toBe("reading");
    expect(d.numberLabel).toBe("Questions 1–10");
  });

  it("never previews the sentence to repeat", () => {
    const d = describeQuestion(test, repeat.id);
    expect(repeat.kind === "listen_and_repeat" && d.preview.includes(repeat.sentence)).toBe(false);
    expect(d.preview).toMatch(/^Listen and Repeat/);
  });

  it("reveals answers only after the test is finished", () => {
    const s = createSession("00000000-0000-0000-0000-00000000000a", 1, normalizeConfig({ mode: "practice", sections: ["reading"], timed: false }), 0);
    beginSection(s, test, 0);
    const blank = ctw.kind === "complete_the_words" ? ctw.blanks[0] : null;
    saveAnswer(s, test, blank!.id, { kind: "text", value: blank!.answer }, 1);
    const saved: SavedQuestion = { id: "x", sessionId: s.id, testNumber: 1, key: ctw.id, section: "reading", taskKind: ctw.kind, numberLabel: "", preview: "", savedAt: 0 };

    const during = reviewSaved(saved, s, test);
    expect(during.available).toBe(false);
    expect(during.items).toEqual([]);

    endBlockEarly(s, test, 2);
    endBlockEarly(s, test, 3);
    const after = reviewSaved(saved, s, test);
    expect(after.available).toBe(true);
    expect(after.items).toHaveLength(10);
    expect(after.status).toBe("partial");
  });
});
