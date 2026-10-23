import { expect, it } from "vitest";
import { isWordFamily, wordForms } from "../exercises/evaluate";
it("word-form questions use one word family, never degrees of comparison", () => {
  expect(isWordFamily(["success", "succeed", "successful", "successfully"])).toBe(true); // "succe" stem
  expect(isWordFamily(["beauty", "beautiful", "beautifully", "beautify"])).toBe(true);
  expect(isWordFamily(["fast", "faster", "fastest", "more fast"])).toBe(false);
  expect(isWordFamily(["happy", "happier", "happiest", "happily"])).toBe(false);
  expect(isWordFamily(["good", "better", "best", "well"])).toBe(false);
});

it("finds real forms of a word to replace invented options", () => {
  const forms = wordForms(["remarkable", "remarkably"]);
  expect(forms).toContain("remark");
  expect(forms).not.toContain("remarkablyness");
  expect(forms).not.toContain("remarkable");
});
