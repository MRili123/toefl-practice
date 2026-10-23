import { describe, expect, it } from "vitest";
import { exampleAround, isPlausibleFix, mistakeFocus } from "../exercises/corrections";
import { explainWord, gradeGrammar, gradeSpelling, normalizeSpelling } from "../exercises/grading";
import { applyResult, masteryPercent, newRecord } from "../exercises/mastery";
import { bumpWeakness, rememberSpellingWord } from "../exercises/memory";
import { adaptivePlan, seededRng } from "../exercises/selection";
import { createExerciseSession, levelPlan, normalizeExerciseConfig, recordAttempt, resolveAttempt, summarize } from "../exercises/session";
import type { LearnerMemory } from "../exercises/store";
import type { ExerciseAttempt, GrammarQuestion, MasteryRecord, SpellingItem } from "../exercises/types";
import { CEFR_LEVELS } from "../exercises/types";

const DAY = 86_400_000;
const rec = (itemId: string, patch: Partial<MasteryRecord> = {}): MasteryRecord => ({
  ...newRecord({ kind: "spelling", itemId, level: "B1", text: itemId, correctAnswer: itemId }, 0),
  attempts: 1,
  ...patch,
});

describe("mastery", () => {
  it("moves a missed word weak → improving → strong → mastered, and back to weak on a new mistake", () => {
    let r = newRecord({ kind: "spelling", itemId: "w", level: "B2", text: "accommodate", correctAnswer: "accommodate" }, 0);
    r = applyResult(r, false, 1, { userAnswer: "accomodate", errorType: "double-letter" });
    expect(r.status).toBe("weak");
    expect(r.nextReviewAt).toBe(1);
    r = applyResult(r, true, 2);
    expect(r.status).toBe("improving");
    r = applyResult(r, true, 3);
    expect(r.status).toBe("strong");
    r = applyResult(r, true, 4);
    expect(r.status).toBe("mastered");
    expect(r.nextReviewAt).toBe(4 + 7 * DAY);
    r = applyResult(r, false, 5);
    expect(r.status).toBe("weak");
    expect([r.attempts, r.correct, r.incorrect]).toEqual([5, 3, 2]);
  });

  it("items never missed go learning → strong → mastered", () => {
    let r = newRecord({ kind: "grammar", itemId: "g", level: "A2", text: "", correctAnswer: "" }, 0);
    r = applyResult(r, true, 1);
    expect(r.status).toBe("learning");
    r = applyResult(applyResult(r, true, 2), true, 3);
    expect(r.status).toBe("mastered");
  });

  it("mastery % is null without data", () => {
    expect(masteryPercent([])).toBeNull();
    expect(masteryPercent([rec("a", { status: "mastered" }), rec("b", { status: "weak" })])).toBe(50);
  });
});

describe("adaptive run order", () => {
  const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
  const items = LEVELS.flatMap((level) => Array.from({ length: 30 }, (_, i) => ({ id: `${level}-${i}`, level })));

  it("with no history: 10 random items per level from A1 to C2, then the rest, nothing repeated", () => {
    const plan = adaptivePlan(items, new Map(), seededRng(1));
    expect(plan).toHaveLength(items.length);
    expect(new Set(plan.map((i) => i.id)).size).toBe(items.length);
    expect(plan.slice(0, 60).map((i) => i.level)).toEqual(LEVELS.flatMap((l) => Array(10).fill(l)));
    expect(plan[60].level).toBe("C2");
  });

  it("puts every non-mastered mistake first, lowest level first, by its own id", () => {
    const records = new Map<string, MasteryRecord>([
      ["B1-4", rec("B1-4", { status: "weak", everWrong: true, incorrect: 1 })],
      ["A1-7", rec("A1-7", { status: "improving", everWrong: true, incorrect: 2, streak: 1 })],
      ["C1-2", rec("C1-2", { status: "mastered", everWrong: true, streak: 3 })],
      ["A2-3", rec("A2-3", { status: "learning", streak: 1 })],
    ]);
    const plan = adaptivePlan(items, records, seededRng(2));
    expect(plan.slice(0, 2).map((i) => i.id)).toEqual(["A1-7", "B1-4"]);
    expect(plan[2].level).toBe("A1");
    expect(plan.slice(0, 12).map((i) => i.id)).not.toContain("C1-2");
  });

  it("serves generated questions right after the mistakes", () => {
    const plan = adaptivePlan(items, new Map([["B2-1", rec("B2-1", { status: "weak", everWrong: true })]]), seededRng(3), { first: ["C2-9"] });
    expect(plan.slice(0, 2).map((i) => i.id)).toEqual(["B2-1", "C2-9"]);
  });

  it("Listen & Repeat: exactly 5 at A1–B1, 10 at B2 and C1, then all of C2; mistakes count inside their level", () => {
    const items = CEFR_LEVELS.flatMap((level) => Array.from({ length: 50 }, (_, n) => ({ id: `${level}-${n}`, level })));
    // Six A1 mistakes and one A2 mistake.
    const records = new Map(["A1-1", "A1-2", "A1-3", "A1-4", "A1-5", "A1-6", "A2-7"].map((id) => [id, rec(id, { status: "weak", everWrong: true, incorrect: 1 })]));
    const plan = adaptivePlan(items, records, seededRng(4), { perLevel: { A1: 5, A2: 5, B1: 5, B2: 10, C1: 10, C2: Infinity }, reviewInLevel: true });
    const levels = plan.slice(0, 35).map((i) => i.level);
    expect(levels).toEqual([...Array(5).fill("A1"), ...Array(5).fill("A2"), ...Array(5).fill("B1"), ...Array(10).fill("B2"), ...Array(10).fill("C1")]);
    expect(plan.slice(0, 5).every((i) => records.has(i.id))).toBe(true); // A1: five of the six mistakes
    expect(plan[5].id).toBe("A2-7"); // A2: its mistake first
    expect(plan.slice(35, 85).every((i) => i.level === "C2")).toBe(true); // then all of C2
  });

  it("Grammar ladder: generated questions stay in their own level, after its mistakes", () => {
    const items = CEFR_LEVELS.flatMap((level) => Array.from({ length: 20 }, (_, n) => ({ id: `${level}-${n}`, level })));
    const records = new Map([["A1-1", rec("A1-1", { status: "weak", everWrong: true, incorrect: 1 })]]);
    const ladder = { A1: 5, A2: 5, B1: 5, B2: 10, C1: 10, C2: Infinity };
    const plan = adaptivePlan(items, records, seededRng(5), { perLevel: ladder, reviewInLevel: true, first: ["B1-3", "A1-9"] });
    expect(plan.slice(0, 15).map((i) => i.level)).toEqual([...Array(5).fill("A1"), ...Array(5).fill("A2"), ...Array(5).fill("B1")]);
    expect(plan.slice(0, 2).map((i) => i.id)).toEqual(["A1-1", "A1-9"]); // A1: the mistake, then its generated question
    expect(plan[10].id).toBe("B1-3"); // B1 starts with its generated question
  });
});

describe("spelling grading", () => {
  const word: SpellingItem = { id: "w", level: "B2", type: "word", text: "environmental", source: "bank" };
  const sentence: SpellingItem = { id: "s", level: "B1", type: "sentence", text: "The students received their results on Monday.", source: "bank" };

  it("ignores case, spacing and edge punctuation", () => {
    expect(gradeSpelling(word, "  Environmental. ").correct).toBe(true);
    expect(gradeSpelling(sentence, "the students received their results on monday").correct).toBe(true);
    expect(normalizeSpelling("Well-known ideas!", "sentence")).toBe("well known ideas");
  });

  it("explains a single-letter mistake", () => {
    const r = gradeSpelling(word, "enviromental");
    expect(r.correct).toBe(false);
    expect(r.feedback.kind === "spelling" && r.feedback.explanation).toBe("The correct spelling contains the missing “n”.");
    expect(explainWord("accomodate", "accommodate").errorType).toBe("double-letter");
    expect(explainWord("recieve", "receive").errorType).toBe("swapped-letters");
    expect(explainWord("seperate", "separate").text).toBe("Write “a” instead of “e”.");
  });

  it("lists misspelled words in a sentence", () => {
    const r = gradeSpelling(sentence, "The students recieved their results on Monday.");
    expect(r.feedback.kind === "spelling" && r.feedback.wrongWords).toEqual([{ given: "recieved", expected: "received" }]);
  });

  it("grades grammar by option index", () => {
    const q: GrammarQuestion = { id: "g", level: "A1", stem: "She _____ to the university.", options: ["go", "goes", "going", "gone"], answer: 1, explanation: "", category: "subject-verb-agreement", difficulty: 1, tags: [], source: "bank" };
    expect(gradeGrammar(q, 1).correct).toBe(true);
    expect(gradeGrammar(q, 0).correct).toBe(false);
  });
});

describe("exercise sessions", () => {
  const attempt = (itemId: string, correct: boolean | null, ai: ExerciseAttempt["ai"] = null): ExerciseAttempt => ({
    itemId, level: "B1", answer: "x", correct, heartLost: false, feedback: null, ai, at: 0,
  });

  it("five mistakes end the run", () => {
    const config = normalizeExerciseConfig({ kind: "grammar", level: "B1", count: 10 });
    const s = createExerciseSession("s", config, Array.from({ length: 10 }, (_, i) => ({ itemId: `q${i}`, level: "B1" as const })), 0);
    for (let i = 0; i < 5; i++) recordAttempt(s, attempt(`q${i}`, false), i);
    expect(s.hearts).toBe(0);
    expect(s.status).toBe("failed");
    expect(summarize(s).percent).toBe(0);
  });

  it("Interaction Test: no hearts, always completes, recommends the next level after a strong run", () => {
    const config = normalizeExerciseConfig({ kind: "speaking-interaction", level: "B1", count: 10, topic: "health" });
    const s = createExerciseSession("s", config, Array.from({ length: 10 }, (_, i) => ({ itemId: `q${i}`, level: "B1" as const })), 0);
    expect(s.hearts).toBeNull(); // the Interaction Test has no hearts
    for (let i = 0; i < 10; i++) recordAttempt(s, attempt(`q${i}`, i < 3 ? false : true), i);
    expect(s.status).toBe("completed"); // three answers below target do not end the run
    expect(s.attempts.some((a) => a.heartLost)).toBe(false);
    expect(summarize(s)).toMatchObject({ percent: 70, recommendNext: null });
    const strong = createExerciseSession("t", config, Array.from({ length: 10 }, (_, i) => ({ itemId: `q${i}`, level: "B1" as const })), 0);
    for (let i = 0; i < 10; i++) recordAttempt(strong, attempt(`q${i}`, i !== 3), i);
    expect(summarize(strong)).toMatchObject({ percent: 90, recommendNext: "B2" });
  });

  it("adaptive runs never recommend a level; they report the level reached", () => {
    const config = normalizeExerciseConfig({ kind: "spelling" });
    const s = createExerciseSession("s", config, [{ itemId: "a", level: "A1" }, { itemId: "b", level: "A2" }, { itemId: "c", level: "B1" }], 0);
    recordAttempt(s, { ...attempt("a", true), level: "A1" }, 0);
    recordAttempt(s, { ...attempt("b", true), level: "A2" }, 1);
    recordAttempt(s, { ...attempt("c", false), level: "B1" }, 2);
    expect(summarize(s)).toMatchObject({ recommendNext: null, levelReached: "A2" });
  });

  it("applies a speaking result once, even if the evaluation is retried", () => {
    const config = normalizeExerciseConfig({ kind: "speaking-repeat", level: "A2", count: 10 });
    const s = createExerciseSession("s", config, Array.from({ length: 10 }, (_, i) => ({ itemId: `r${i}`, level: "A2" as const })), 0);
    recordAttempt(s, attempt("r0", null, { stage: "queued", error: null }), 0);
    expect(s.index).toBe(0);
    resolveAttempt(s, "r0", { correct: false, ai: { stage: "done", error: null } }, 1);
    resolveAttempt(s, "r0", { correct: false, ai: { stage: "done", error: null } }, 2);
    expect([s.index, s.hearts]).toEqual([1, 4]);
  });

  it("progressive difficulty steps up each quarter, capped at C2", () => {
    const plan = levelPlan(normalizeExerciseConfig({ kind: "speaking-interaction", level: "B2", count: 20, topic: "environment", progressive: true }));
    expect([plan[0], plan[5], plan[10], plan[19]]).toEqual(["B2", "C1", "C2", "C2"]);
  });
});

describe("mistake memory", () => {
  const memory = (): LearnerMemory => ({ records: {}, weaknesses: {}, generated: { grammar: [], spelling: [] }, seen: {}, mistakes: {} });

  it("adds a word misspelled in writing to spelling practice as weak, reusing the bank item", () => {
    const m = memory();
    const bank = new Map<string, SpellingItem>([["environment", { id: "sp-b1-w03", level: "B1", type: "word", text: "environment", source: "bank" }]]);
    expect(rememberSpellingWord(m, "environment", "B2", "writing", "enviroment", 1, bank)).toBe("sp-b1-w03");
    expect(rememberSpellingWord(m, "necessary", "B2", "writing", "neccessary", 2, bank)).toBe("sp-x-necessary");
    rememberSpellingWord(m, "environment", "B2", "writing", "enviroment", 3, bank);
    expect(m.records["spelling:sp-b1-w03"]).toMatchObject({ status: "weak", incorrect: 2 });
    expect(m.generated.spelling).toHaveLength(1);
  });

  it("never adds the same word twice, whatever its capitalization or source", () => {
    const m = memory();
    const bank = new Map<string, SpellingItem>([["garden", { id: "sp-a1-w34", level: "A1", type: "word", text: "garden", source: "bank" }]]);
    expect(rememberSpellingWord(m, "park", "A1", "reading", "parc", 1, bank)).toBe("sp-x-park");
    expect(rememberSpellingWord(m, "Park", "B1", "writing", "Parck", 2, bank)).toBe("sp-x-park");
    expect(rememberSpellingWord(m, "Garden", "A1", "reading", "gardin", 3, bank)).toBe("sp-a1-w34");
    expect(m.generated.spelling.map((s) => s.text)).toEqual(["park"]);
    expect(m.records["spelling:sp-x-park"]).toMatchObject({ incorrect: 2 });
  });

  it("asks for a new grammar question once a mistake repeats", () => {
    const m = memory();
    const ex = { original: "People is", correction: "People are" };
    expect(bumpWeakness(m, "grammar", "subject-verb-agreement", ex, 1).generate).toBe(false);
    expect(bumpWeakness(m, "grammar", "subject-verb-agreement", ex, 2).generate).toBe(true);
    m.weaknesses["grammar:subject-verb-agreement"].generatedAtCount = 2;
    expect(bumpWeakness(m, "grammar", "subject-verb-agreement", ex, 3).generate).toBe(false);
  });
});

describe("correction plausibility", () => {
  const fix = (original: string, correction: string, type: "grammar" | "spelling" | "sentence-structure" = "grammar") => ({ original, correction, type });

  it("keeps real grammar repairs", () => {
    expect(isPlausibleFix(fix("is", "are"))).toBe(true);
    expect(isPlausibleFix(fix("wants", "want"))).toBe(true);
    expect(isPlausibleFix(fix("I went store", "I went to the store"))).toBe(true);
    expect(isPlausibleFix(fix("has", "have"))).toBe(true);
    expect(isPlausibleFix(fix("in the university", "at the university"))).toBe(true);
  });

  it("drops rewrites that replace the learner's ideas", () => {
    expect(isPlausibleFix(fix("Professor", "Editor"))).toBe(false);
    expect(isPlausibleFix(fix("because I missed", "to introduce myself and ask about"))).toBe(false);
    expect(isPlausibleFix(fix("meeting time", "word limit and deadline"))).toBe(false);
  });

  it("never filters spelling corrections", () => {
    expect(isPlausibleFix(fix("enviroment", "environment", "spelling"))).toBe(true);
  });

  it("extracts the sentence around an error as a concrete example", () => {
    const text = "I like this club. People is worried about the city. We start soon.";
    const start = text.indexOf("is worried");
    expect(exampleAround(text, start, start + 2, "are")).toEqual({
      original: "People is worried about the city.",
      correction: "People are worried about the city.",
    });
  });
});

describe("mistake focus (the words a generated question practises)", () => {
  it("finds the replaced word or short phrase, ignoring case and punctuation", () => {
    expect(mistakeFocus("swim", "swam")).toEqual({ wrong: "swim", right: "swam" });
    expect(mistakeFocus("Yesterday I swim in the lake.", "Yesterday I swam in the lake.")).toEqual({ wrong: "swim", right: "swam" });
    expect(mistakeFocus("She has went home", "She has gone home")).toEqual({ wrong: "went", right: "gone" });
    expect(mistakeFocus("if I will go", "if I go")).toEqual({ wrong: "will go", right: "go" });
  });
  it("takes the neighbouring word along for a missing or extra word", () => {
    expect(mistakeFocus("go to school", "go to the school")).toEqual({ wrong: "school", right: "the school" });
    expect(mistakeFocus("I enjoy to read", "I enjoy reading")).toEqual({ wrong: "to read", right: "reading" });
  });
  it("has nothing to offer for a long rewrite", () => {
    expect(mistakeFocus("hy M mitchell m writing", "Hi, Professor Mitchell, I am writing to you about the essay")).toBeNull();
  });
});

describe("dictation-safe words", () => {
  it("never adds a word that sounds like another word to Spelling practice", () => {
    const m: LearnerMemory = { records: {}, weaknesses: {}, generated: { grammar: [], spelling: [] }, seen: {}, mistakes: {} };
    expect(rememberSpellingWord(m, "inn", "A1", "writing", "ibn", 1, new Map())).toBeNull();
    expect(rememberSpellingWord(m, "weather", "A2", "writing", "wether", 2, new Map())).toBeNull();
    expect(rememberSpellingWord(m, "bookstore", "A2", "writing", "bokstore", 3, new Map())).toBe("sp-x-bookstore");
    expect(m.generated.spelling.map((s) => s.text)).toEqual(["bookstore"]);
  });
});
