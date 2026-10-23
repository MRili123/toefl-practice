import { describe, expect, it } from "vitest";
import { exerciseBank, parsePassage } from "../exercises/bank";
import { gradeReading } from "../exercises/grading";
import { CEFR_LEVELS, GRAMMAR_CATEGORIES, SPEAKING_TOPICS } from "../exercises/types";

const bank = exerciseBank();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const dupes = (xs: string[]) => xs.filter((x, i) => xs.indexOf(x) !== i);

describe("exercise content bank", () => {
  it("reading: 50 Complete the Words passages per level, 10 blanks each, first sentence intact", () => {
    for (const level of CEFR_LEVELS) expect(bank.reading.filter((p) => p.level === level).length, level).toBeGreaterThanOrEqual(50);
    expect(dupes(bank.reading.map((p) => norm(p.segments.join(""))))).toEqual([]);
    for (const p of bank.reading) {
      expect(p.blanks, p.id).toHaveLength(10);
      expect(p.segments, p.id).toHaveLength(11);
      expect(p.segments[0], `${p.id} first sentence`).toMatch(/[.!?]\s/);
      expect(p.title.length, p.id).toBeGreaterThan(2);
      for (const b of p.blanks) {
        expect(b.prefix + b.answer, b.id).toBe(b.fullWord);
        expect(b.answer.length, b.id).toBeGreaterThanOrEqual(b.prefix.length); // the second half is missing
        expect(b.fullWord, b.id).toMatch(/^[A-Za-z]{3,}$/);
      }
    }
  });

  it("reading: words are cut as on the test and graded on the missing letters or the whole word", () => {
    const p = parsePassage("rd-x-01", "B2", "Coral", "Reefs are old. These {colorful} formations give {shelter} to {fish}.");
    expect(p.blanks.map((b) => [b.prefix, b.answer])).toEqual([["colo", "rful"], ["she", "lter"], ["fi", "sh"]]);
    expect(p.segments).toEqual(["Reefs are old. These ", " formations give ", " to ", "."]);
    const r = gradeReading(p, { [p.blanks[0].id]: "RFUL", [p.blanks[1].id]: "shelter", [p.blanks[2].id]: "hs" }, false);
    expect(r.feedback.blanks.map((b) => b.correct)).toEqual([true, true, false]);
    expect(r.correct).toBe(false);
    expect(r.feedback.correct).toBe(2);
  });

  it("spelling: 50 words and 50 sentences per level, no duplicates anywhere", () => {
    for (const level of CEFR_LEVELS) {
      const items = bank.spelling.filter((s) => s.level === level);
      expect(items.filter((s) => s.type === "word").length, `${level} words`).toBeGreaterThanOrEqual(50);
      expect(items.filter((s) => s.type === "sentence").length, `${level} sentences`).toBeGreaterThanOrEqual(50);
    }
    expect(dupes(bank.spelling.map((s) => norm(s.text)))).toEqual([]);
    for (const s of bank.spelling.filter((x) => x.type === "word")) expect(s.text, s.id).toMatch(/^[a-z][a-z-]*$/);
    for (const s of bank.spelling.filter((x) => x.type === "sentence")) expect(s.text, s.id).not.toMatch(/\d/);
  });

  it("grammar: 50 per level, 4 distinct options, one blank, valid answer and category", () => {
    for (const level of CEFR_LEVELS) expect(bank.grammar.filter((g) => g.level === level).length, level).toBeGreaterThanOrEqual(50);
    for (const g of bank.grammar) {
      expect(g.options, g.id).toHaveLength(4);
      expect(new Set(g.options.map(norm)).size, `${g.id} distinct options`).toBe(4);
      expect(g.stem.match(/_{5}/g), `${g.id} blank`).toHaveLength(1);
      expect([0, 1, 2, 3], g.id).toContain(g.answer);
      expect(GRAMMAR_CATEGORIES, g.id).toContain(g.category);
      expect(g.explanation.length, `${g.id} explanation`).toBeGreaterThan(20);
      expect(g.difficulty, g.id).toBeGreaterThanOrEqual(1);
    }
    expect(dupes(bank.grammar.map((g) => norm(g.stem)))).toEqual([]);
    // Every category is practised somewhere.
    for (const c of GRAMMAR_CATEGORIES) expect(bank.grammar.some((g) => g.category === c), c).toBe(true);
  });

  it("listen & repeat: 50 sentences per level", () => {
    for (const level of CEFR_LEVELS) expect(bank.repeat.filter((r) => r.level === level).length, level).toBeGreaterThanOrEqual(50);
    expect(dupes(bank.repeat.map((r) => norm(r.text)))).toEqual([]);
    for (const r of bank.repeat) expect(r.text, r.id).not.toMatch(/\d/);
  });

  it("speaking interaction: 50 questions per topic and level", () => {
    for (const topic of SPEAKING_TOPICS) {
      for (const level of CEFR_LEVELS) {
        expect(bank.interaction.filter((q) => q.topic === topic && q.level === level).length, `${topic} ${level}`).toBeGreaterThanOrEqual(50);
      }
    }
    expect(dupes(bank.interaction.map((q) => norm(q.text)))).toEqual([]);
    // Questions, or short speaking instructions ("Describe…", "Tell me about…").
    for (const q of bank.interaction) expect(q.text, q.id).toMatch(/[?.]$/);
  });

  it("writing: 50 email, 50 discussion and 50 essay prompts per level", () => {
    for (const level of CEFR_LEVELS) {
      for (const type of ["email", "discussion", "essay"] as const) {
        expect(bank.writing.filter((w) => w.level === level && w.type === type).length, `${level} ${type}`).toBeGreaterThanOrEqual(50);
      }
    }
    for (const w of bank.writing) {
      if (w.type === "email") {
        expect(w.tasks.length, w.id).toBeGreaterThanOrEqual(2);
        expect(w.to.length, w.id).toBeGreaterThan(2);
      }
      if (w.type === "discussion") {
        expect(w.students, w.id).toHaveLength(2);
        expect(w.professor.text, w.id).toMatch(/\?/);
      }
    }
    const texts = bank.writing.map((w) => norm(w.type === "email" ? w.situation : w.type === "discussion" ? w.professor.text : w.prompt));
    expect(dupes(texts)).toEqual([]);
  });
});
