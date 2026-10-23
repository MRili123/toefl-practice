import { describe, expect, it } from "vitest";
import type { BuildSentenceTask, CtwBlank, McqItem, Section } from "../bank/types";
import { routeAfterStage1 } from "../adaptive/router";
import { gradeBuildSentence, gradeCtw, gradeMcq } from "../evaluation/objective";
import { bandFromScale30, comparable120, overallBand } from "../scoring/concordance";
import { objectiveSectionScore, speakingSectionScore, writingSectionScore } from "../scoring/section";

const section: Section = {
  id: "reading",
  modules: [
    { id: "r-m1", stage: 1, difficulty: "medium", introAudio: null, tasks: [] },
    { id: "r-m2-hard", stage: 2, difficulty: "hard", introAudio: null, tasks: [] },
    { id: "r-m2-easy", stage: 2, difficulty: "easy", introAudio: null, tasks: [] },
  ],
};

describe("adaptive router", () => {
  it("routes to the hard module at or above the threshold", () => {
    expect(routeAfterStage1(section, { moduleId: "r-m1", correct: 18, total: 30 }).nextModuleId).toBe("r-m2-hard");
    expect(routeAfterStage1(section, { moduleId: "r-m1", correct: 30, total: 30 }).route).toBe("hard");
  });
  it("routes to the easy module below the threshold", () => {
    expect(routeAfterStage1(section, { moduleId: "r-m1", correct: 17, total: 30 }).nextModuleId).toBe("r-m2-easy");
    expect(routeAfterStage1(section, { moduleId: "r-m1", correct: 0, total: 30 }).route).toBe("easy");
  });
});

describe("objective grading", () => {
  const item: McqItem = {
    id: "q1", stem: "", highlightText: null, explanation: "", skill: "Detail", correctOptionId: "b",
    options: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
  };
  it("grades multiple choice", () => {
    expect(gradeMcq(item, { kind: "mcq", optionId: "b" })).toBe("correct");
    expect(gradeMcq(item, { kind: "mcq", optionId: "a" })).toBe("incorrect");
    expect(gradeMcq(item, undefined)).toBe("unanswered");
  });

  const blank: CtwBlank = { id: "w1", prefix: "funda", answer: "mental", fullWord: "fundamental" };
  it("accepts the missing letters or the whole word, case-insensitively", () => {
    expect(gradeCtw(blank, { kind: "text", value: "mental" })).toBe("correct");
    expect(gradeCtw(blank, { kind: "text", value: " MENTAL " })).toBe("correct");
    expect(gradeCtw(blank, { kind: "text", value: "fundamental" })).toBe("correct");
    expect(gradeCtw(blank, { kind: "text", value: "mentle" })).toBe("incorrect");
    expect(gradeCtw(blank, { kind: "text", value: "  " })).toBe("unanswered");
  });

  const bas = {
    correctOrder: ["be", "there", "if", "I", "finish", "my paper", "on time"],
    acceptedOrders: [["be", "there", "on time", "if", "I", "finish", "my paper"]],
  } as BuildSentenceTask;
  it("accepts the canonical order and any accepted alternative", () => {
    expect(gradeBuildSentence(bas, { kind: "order", chunks: bas.correctOrder })).toBe("correct");
    expect(gradeBuildSentence(bas, { kind: "order", chunks: bas.acceptedOrders[0] })).toBe("correct");
    expect(gradeBuildSentence(bas, { kind: "order", chunks: ["be", "there", "if", "I", "finishing", "my paper", "on time"] })).toBe("incorrect");
    expect(gradeBuildSentence(bas, { kind: "order", chunks: [] })).toBe("unanswered");
  });
});

describe("ETS concordance", () => {
  it("maps section 0–30 boundaries exactly as published", () => {
    expect(bandFromScale30("reading", 29)).toBe(6);
    expect(bandFromScale30("reading", 28)).toBe(5.5);
    expect(bandFromScale30("reading", 24)).toBe(5);
    expect(bandFromScale30("reading", 23)).toBe(4.5);
    expect(bandFromScale30("listening", 22)).toBe(5);
    expect(bandFromScale30("listening", 21)).toBe(4.5);
    expect(bandFromScale30("speaking", 27)).toBe(5.5);
    expect(bandFromScale30("speaking", 26)).toBe(5);
    expect(bandFromScale30("writing", 2)).toBe(1);
    expect(bandFromScale30("writing", 3)).toBe(1.5);
  });
  it("rounds the overall mean to the nearest half band, halves up", () => {
    expect(overallBand([5, 5, 5.5, 5.5])).toBe(5.5); // mean 5.25
    expect(overallBand([5, 5, 5, 5.5])).toBe(5); // mean 5.125
    expect(overallBand([4, 4.5, 4.5, 4.5])).toBe(4.5); // mean 4.375
    expect(overallBand([6, 6, 6, 6])).toBe(6);
    expect(overallBand([])).toBeNull();
  });
  it("gives the midpoint of the 0–120 range", () => {
    expect(comparable120(5)).toEqual({ score: 101, min: 95, max: 106 });
    expect(comparable120(6).score).toBe(117);
    expect(comparable120(1).score).toBe(6);
  });
});

describe("section scoring", () => {
  it("caps the easy path below the hard path", () => {
    const easyPerfect = objectiveSectionScore("reading", 50, 50, "easy");
    const hardPerfect = objectiveSectionScore("reading", 50, 50, "hard");
    expect(hardPerfect.band).toBe(6);
    expect(easyPerfect.band!).toBeLessThan(hardPerfect.band!);
  });
  it("marks AI-scored sections pending until every evaluation is in", () => {
    expect(writingSectionScore({ basCorrect: 10, basTotal: 10, email: 5, discussion: null }).status).toBe("pending");
    expect(writingSectionScore({ basCorrect: 10, basTotal: 10, email: 5, discussion: 5 }).band).toBe(6);
    expect(speakingSectionScore({ listenAndRepeat: [5, null], interview: [5] }).status).toBe("pending");
    expect(speakingSectionScore({ listenAndRepeat: [1, 1], interview: [0, 0] }).band).toBe(1);
  });
});
