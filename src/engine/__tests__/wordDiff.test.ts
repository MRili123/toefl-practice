import { describe, expect, it } from "vitest";
import { diffWords } from "@/lib/wordDiff";

describe("diffWords", () => {
  const added = (a: string, b: string) => diffWords(a, b).filter((p) => p.op === "add").map((p) => p.text.trim());
  const removed = (a: string, b: string) => diffWords(a, b).filter((p) => p.op === "del").map((p) => p.text.trim());

  it("marks only the words that changed", () => {
    expect(added("I think it is good.", "I believe it is beneficial.")).toEqual(["believe", "beneficial."]);
    expect(removed("I think it is good.", "I believe it is beneficial.")).toEqual(["think", "good."]);
  });

  it("rebuilds the new text exactly (spacing and paragraphs kept)", () => {
    const after = "Dear Professor,\n\nI would like to ask for an extension.";
    const text = diffWords("Dear Professor,\n\nI want more time.", after).filter((p) => p.op !== "del").map((p) => p.text).join("");
    expect(text).toBe(after);
  });

  it("finds nothing to mark in identical texts", () => {
    expect(diffWords("Same text here.", "Same text here.")).toEqual([{ text: "Same text here.", op: "same" }]);
  });
});
