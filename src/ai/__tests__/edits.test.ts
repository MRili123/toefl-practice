import { describe, expect, it } from "vitest";
import { splitIntoEdits } from "../edits";

describe("splitIntoEdits", () => {
  it("splits a rewritten sentence into its individual mistakes with absolute offsets", () => {
    const text = "all the readings is in this book and I am worry about my grade";
    const edits = splitIntoEdits(text, 100, "all the readings are in this book, and I am worried about my grade");
    expect(edits.map((e) => [e.original, e.suggestion, e.kind])).toEqual([
      ["is", "are", "word"],
      ["book", "book,", "punctuation"],
      ["worry", "worried", "word"],
    ]);
    expect(edits[0].start).toBe(100 + text.indexOf("is in"));
  });

  it("detects capitalization-only changes", () => {
    const edits = splitIntoEdits("next tuesday", 0, "next Tuesday");
    expect(edits).toEqual([{ start: 5, end: 12, original: "tuesday", suggestion: "Tuesday", kind: "capitalization" }]);
  });

  it("returns nothing when the suggestion is identical", () => {
    expect(splitIntoEdits("I ordered it.", 0, "I ordered it.")).toEqual([]);
  });
});
