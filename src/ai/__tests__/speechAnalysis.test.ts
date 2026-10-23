import { describe, expect, it } from "vitest";
import { alignWords, deliveryMetrics, normalizeWords, repeatScore } from "../speechAnalysis";

const score = (target: string, spoken: string) => {
  const t = normalizeWords(target);
  return repeatScore(alignWords(t, normalizeWords(spoken)), t.length);
};

describe("Listen and Repeat scoring", () => {
  it("normalizes punctuation, case and digits", () => {
    expect(normalizeWords("Books can be borrowed for up to 3 weeks.")).toEqual(
      ["books", "can", "be", "borrowed", "for", "up", "to", "three", "weeks"],
    );
    expect(normalizeWords("Walk-in hours: 21")).toEqual(["walk", "in", "hours", "twenty", "one"]);
  });
  it("treats contractions and their full form as the same words", () => {
    expect(score("It is very cold outside.", "It's very cold outside").score).toBe(5);
    expect(score("I don't think they're ready.", "I do not think they are ready").score).toBe(5);
    expect(score("You cannot park here.", "you can't park here").score).toBe(5);
    expect(score("We won't be late.", "we will not be late").score).toBe(5);
    expect(normalizeWords("John's book")).toEqual(["john's", "book"]); // a possessive stays one word
    expect(score("It is very cold outside.", "It was very cold outside").score).toBe(4); // a real change still counts
  });
  it("gives 5 for a perfect repetition and 4 for one error", () => {
    expect(score("Books can be borrowed for up to three weeks.", "books can be borrowed for up to 3 weeks").score).toBe(5);
    expect(score("Books can be borrowed for up to three weeks.", "books can be borrowed up to three weeks").score).toBe(4);
  });
  it("degrades with accuracy and gives 0 for no response (ETS guide)", () => {
    expect(score("Please sign in at the front desk.", "please sign at desk").score).toBe(2);
    expect(score("Please sign in at the front desk.", "").score).toBe(0);
  });
  it("treats wrong endings and function words as minor changes (score 4)", () => {
    expect(score("Walk-in hours are offered Monday through Thursday afternoons.", "walk in hours is offered monday through thursday afternoon").score).toBe(4);
    expect(score("Please sign in at the front desk.", "please sign in at front table").score).toBe(3);
  });
  it("reports substitutions and insertions in the alignment", () => {
    const ops = alignWords(["the", "front", "desk"], ["the", "big", "front", "table"]);
    expect(ops).toEqual([
      { op: "match", target: "the", spoken: "the" },
      { op: "ins", spoken: "big" },
      { op: "match", target: "front", spoken: "front" },
      { op: "sub", target: "desk", spoken: "table" },
    ]);
  });
  it("measures speech rate and pauses from word timestamps", () => {
    const m = deliveryMetrics([
      { w: "one", start: 0, end: 0.5, p: 0.9 },
      { w: "two", start: 2, end: 2.5, p: 0.3 },
      { w: "three", start: 2.6, end: 3, p: 0.9 },
    ]);
    expect(m.longPauses).toBe(1);
    expect(m.wordsPerMinute).toBe(60);
    expect(m.lowConfidenceWords).toEqual(["two"]);
  });
});
