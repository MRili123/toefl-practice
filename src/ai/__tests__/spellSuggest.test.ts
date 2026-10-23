import { describe, expect, it } from "vitest";
import { refineSpelling, spellingCorrections } from "../evaluators";
import { bestSuggestion, findSpellingErrors } from "../spelling";

describe("spelling suggestions", () => {
  it("prefers the common word among equally close suggestions", () => {
    expect(bestSuggestion("ibn", ["inn", "in", "ion"])).toBe("in");
    expect(findSpellingErrors("I live ibn Paris.")[0]?.suggestion).toBe("in");
  });
  it("keeps the closest suggestion when no common word is as close", () => {
    expect(bestSuggestion("enviroment", ["environment", "the"])).toBe("environment");
  });
});

describe("spelling fixes in context", () => {
  const text = "I love Moroccan culter and I answerd every question.";
  const spelling = spellingCorrections(text, []);
  it("the spell checker alone guesses rare words", () => {
    expect(spelling.map((c) => c.suggestion)).toEqual(["curter", "answers"]);
  });
  it("uses the AI's corrected text when it is a respelling of the same word", () => {
    const fixed = refineSpelling(spelling, [], text, "I love Moroccan culture and I answered every question.");
    expect(fixed.map((c) => c.suggestion)).toEqual(["culture", "answered"]);
  });
  it("uses the AI's own correction of that word", () => {
    const fixed = refineSpelling(spelling, [{ original: "culter", suggestion: "culture", explanation: "", type: "spelling" }], text);
    expect(fixed[0].suggestion).toBe("culture");
  });
  it("ignores rewrites that are not respellings", () => {
    const fixed = refineSpelling(spelling, [], text, "I love Moroccan food and I replied to every question.");
    expect(fixed.map((c) => c.suggestion)).toEqual(["curter", "answers"]);
  });
});

describe("spelling fixes in rewritten sentences", () => {
  it("finds the respelled word when nearby words changed too, and drops lowercase names", () => {
    const text = "I study at the university of ibn tofil and answerd by yes. We eat food from different culter (morrocan food).";
    const corrected = "I study at the University of Ibn Tofail and answered with yes. We eat food from different cultures, such as Moroccan food.";
    const fixed = refineSpelling(spellingCorrections(text, []), [], text, corrected);
    const byWord = Object.fromEntries(fixed.map((c) => [c.original, c.suggestion]));
    expect(byWord.tofil).toBeUndefined(); // a name, not a misspelling
    expect(byWord.ibn).toBeUndefined();
    expect(byWord.answerd).toBe("answered");
    expect(byWord.culter).toBe("cultures");
  });
});

describe("keeping a good spell-checker word", () => {
  it("keeps a common, closer word when the AI only rephrased the sentence", () => {
    const text = "Discover many dishese from home.";
    const fixed = refineSpelling(spellingCorrections(text, []), [], text, "Discover many dish types from home.");
    expect(fixed[0].suggestion).toBe("dishes");
  });
});
