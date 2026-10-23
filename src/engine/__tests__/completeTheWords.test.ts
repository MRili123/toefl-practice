import { describe, expect, it } from "vitest";
import { listTests, loadTest } from "../bank/loader";
import { exerciseBank } from "../exercises/bank";

type Blank = { id: string; prefix: string; answer: string; fullWord: string };

/**
 * Every "Complete the Words" blank must be answerable: the shown letters plus the typed letters spell the word,
 * and the box (one slot per missing letter) is exactly as long as the missing part.
 */
function checkBlanks(where: string, segments: string[], blanks: Blank[]) {
  expect(segments.length, `${where}: segments around the blanks`).toBe(blanks.length + 1);
  blanks.forEach((b, i) => {
    const tag = `${where} #${i + 1} ${b.prefix}[${b.answer}]`;
    expect(b.prefix + b.answer, `${tag}: shown + missing letters spell the word`).toBe(b.fullWord);
    expect(b.prefix.length, `${tag}: some letters are shown`).toBeGreaterThan(0);
    expect(b.answer.length, `${tag}: some letters are missing`).toBeGreaterThan(0);
    expect(b.fullWord, `${tag}: a plain word`).toMatch(/^[A-Za-z'-]+$/);
    expect(segments[i], `${tag}: not glued to the word before`).not.toMatch(/[A-Za-z]$/);
    expect(segments[i + 1], `${tag}: not glued to the word after`).not.toMatch(/^[A-Za-z]/);
  });
}

describe("Complete the Words blanks", () => {
  it("series tests: every blank can be typed exactly", () => {
    let n = 0;
    for (const meta of listTests()) {
      for (const mod of loadTest(meta.number).sections.reading.modules) {
        for (const task of mod.tasks) {
          if (task.kind !== "complete_the_words") continue;
          checkBlanks(`Test ${meta.number} ${task.id}`, task.segments, task.blanks);
          n += task.blanks.length;
        }
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it("reading practice: every blank can be typed exactly", () => {
    for (const p of exerciseBank().reading) checkBlanks(`${p.id} ${p.title}`, p.segments, p.blanks);
  });
});
