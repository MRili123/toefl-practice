import { describe, expect, it } from "vitest";
import { computeLevels, type Evidence } from "../profile/level";

const DAY = 86_400_000;
const NOW = 1_000 * DAY;
const test = (skill: Evidence["skill"], band: number, daysAgo = 0, reliability = 1): Evidence => ({
  skill, band, at: NOW - daysAgo * DAY, source: "test", reliability,
});
const allFour = (band: number, daysAgo = 0) =>
  (["reading", "listening", "writing", "speaking"] as const).map((s) => test(s, band, daysAgo));

describe("level calculation", () => {
  it("reports not enough data without any test", () => {
    const r = computeLevels([], NOW);
    expect(r.overall).toBeNull();
    expect(r.skills.reading.level).toBeNull();
    expect(r.missingSkills).toHaveLength(4);
  });

  it("needs all four skills for a current level", () => {
    const r = computeLevels([test("reading", 5)], NOW);
    expect(r.skills.reading.level).toBe(5);
    expect(r.overall).toBeNull();
    expect(r.missingSkills).toEqual(["listening", "writing", "speaking"]);
  });

  it("averages the four skills with ETS half-up rounding", () => {
    const r = computeLevels([test("reading", 5), test("listening", 5), test("writing", 5.5), test("speaking", 5.5)], NOW);
    expect(r.overall).toBe(5.5);
  });

  it("weights recent tests more than old ones", () => {
    const r = computeLevels([test("reading", 3, 365), test("reading", 5, 0)], NOW);
    expect(r.skills.reading.level).toBe(5);
  });

  it("real-condition tests outweigh untimed practice", () => {
    const r = computeLevels([test("reading", 5, 0, 1), test("reading", 3, 0, 0.5)], NOW);
    expect(r.skills.reading.level).toBe(4.5);
  });

  it("exercises and courses cannot establish a level on their own", () => {
    const e: Evidence[] = [
      { skill: "reading", band: 6, at: NOW, source: "exercise", reliability: 1 },
      { skill: "reading", band: 6, at: NOW, source: "course", reliability: 1 },
    ];
    expect(computeLevels(e, NOW).skills.reading.level).toBeNull();
  });

  it("exercises move a test-based level only a little", () => {
    const e: Evidence[] = [test("reading", 4), { skill: "reading", band: 6, at: NOW, source: "exercise", reliability: 1 }];
    expect(computeLevels(e, NOW).skills.reading.level).toBe(4.5);
  });

  it("shows a trend only with two or more tests", () => {
    expect(computeLevels(allFour(4, 10), NOW).skills.reading.trend).toBeNull();
    const r = computeLevels([...allFour(4, 10), test("reading", 4.5, 0)], NOW);
    expect(r.skills.reading.trend).toBe(0.5);
    expect(r.skills.listening.trend).toBeNull();
  });
});
