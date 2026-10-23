import { describe, expect, it } from "vitest";
import type { Correction } from "@/ai/feedbackTypes";
import { correctedSegments, correctedText } from "../corrections";

const c = (original: string, suggestion: string, start: number, type = "grammar", source: Correction["source"] = "model"): Correction => ({
  original,
  suggestion,
  start,
  end: start + original.length,
  type,
  source,
  explanation: "",
});

describe("corrected version", () => {
  const text = "I order the book but it has not arive. See you next tuesday.";

  it("applies every correction at its position", () => {
    const fixes = [
      c("order", "ordered", 2),
      c("arive", "arrive", 32, "spelling", "spellcheck"),
      c("tuesday", "Tuesday", 52, "spelling", "spellcheck"),
    ];
    expect(correctedText(text, fixes)).toBe("I ordered the book but it has not arrive. See you next Tuesday.");
  });

  it("prefers the model's in-context fix over a plain spelling fix on the same word", () => {
    const fixes = [c("arive", "arrive", 32, "spelling", "spellcheck"), c("arive", "arrived", 32, "grammar", "model")];
    expect(correctedText(text, fixes)).toBe("I order the book but it has not arrived. See you next tuesday.");
    const changed = correctedSegments(text, fixes).filter((s) => s.index !== null);
    expect(changed).toEqual([{ text: "arrived", index: 1, original: "arive" }]);
  });

  it("removes deleted words without leaving a double space", () => {
    expect(correctedText("I am very very happy.", [c("very", "(remove)", 5)])).toBe("I am very happy.");
  });

  it("falls back to searching when stored offsets are missing", () => {
    const fix: Correction = { original: "is", suggestion: "are", type: "grammar", explanation: "" };
    expect(correctedText("The readings is long.", [fix])).toBe("The readings are long.");
  });
});
