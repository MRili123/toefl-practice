import { describe, expect, it } from "vitest";
import { findSpellingErrors } from "../spelling";

describe("spell checker", () => {
  it("flags misspellings with positions and suggestions", () => {
    const text = "It still has not arive. I recieve nothing until tuesday.";
    const issues = findSpellingErrors(text);
    expect(issues.map((i) => [i.word, i.suggestion])).toEqual([
      ["arive", "arrive"],
      ["recieve", "receive"],
      ["tuesday", "Tuesday"],
    ]);
    expect(text.slice(issues[0].start, issues[0].end)).toBe("arive");
  });

  it("accepts UK spelling, contractions, names, e-mails and task words", () => {
    const text = "The colour and behaviour of Professor Hayes is great. I'm fine, don't worry. Write to bookstore@state.edu. Best, Ilias";
    expect(findSpellingErrors(text, ["Hayes"])).toEqual([]);
  });

  it("still catches a capitalized typo at the start of a sentence", () => {
    expect(findSpellingErrors("Becuase of the delay.").map((i) => i.suggestion)).toEqual(["Because"]);
  });
});
