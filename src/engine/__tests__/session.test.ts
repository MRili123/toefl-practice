import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTest, itemIndex } from "../bank/loader";
import { scoredItems } from "../bank/items";
import type { McqItem } from "../bank/types";
import { buildResults } from "../results/results";
import {
  activeSection, beginBlock, beginSection, createSession, currentModule, endBlockEarly, expire, gotoTask, itemsNeedingEvaluation,
  nextTask, normalizeConfig, saveAnswer, startQuestion, submitQuestion, submitTask, timeout, checkItem,
} from "../session/session";
import { buildView } from "../session/view";
import type { Session } from "../session/types";

const hasBank = fs.existsSync(path.join(process.cwd(), "data", "bank", "test-01.json"));
const T0 = 1_000_000;

function answerModuleCorrectly(s: Session, correctFraction: number, now: number) {
  const test = loadTest(1);
  const st = activeSection(s)!;
  const mod = currentModule(test, st)!;
  const idx = itemIndex(1);
  const items = mod.tasks.flatMap(scoredItems);
  const nCorrect = Math.round(items.length * correctFraction);
  items.forEach((it, i) => {
    const ref = idx.get(it.id)!;
    const right = i < nCorrect;
    if (ref.mcq) {
      const opt = right ? ref.mcq.correctOptionId : ref.mcq.options.find((o) => o.id !== ref.mcq!.correctOptionId)!.id;
      s.answers[it.id] = { kind: "mcq", optionId: opt, at: now };
    } else if (ref.blank) {
      s.answers[it.id] = { kind: "text", value: right ? ref.blank.answer : "zzz", at: now };
    }
  });
  for (const task of mod.tasks) submitTask(s, test, task.id, true, now);
}

describe.skipIf(!hasBank)("session state machine (test 01)", () => {
  it("routes Reading to the hard module after a strong Module 1", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000001", 1, normalizeConfig({ mode: "real", sections: ["reading"] }), T0);
    beginSection(s, test, T0);
    answerModuleCorrectly(s, 0.9, T0 + 1000);
    const st = activeSection(s)!;
    expect(st.routing?.route).toBe("hard");
    expect(st.activeModuleId).toBe("r-m2-hard");
    expect(buildView(s, test, T0).current!.itemNumbers[0]).toBe(31);
  });

  it("routes to the easy module after a weak Module 1 and scores 50 items", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000002", 1, normalizeConfig({ mode: "real", sections: ["reading"] }), T0);
    beginSection(s, test, T0);
    answerModuleCorrectly(s, 0.3, T0 + 1000);
    expect(activeSection(s)!.activeModuleId).toBe("r-m2-easy");
    answerModuleCorrectly(s, 1, T0 + 2000);
    expect(s.status).toBe("completed");
    const r = buildResults(s, test);
    expect(r.sections[0].stats!.total).toBe(50);
    expect(r.sections[0].score!.band).not.toBeNull();
    expect(r.overall.status).toBe("final");
  });

  it("real-mode Reading: free movement inside a module, no return to Module 1", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000003", 1, normalizeConfig({ mode: "real", sections: ["reading"] }), T0);
    beginSection(s, test, T0);
    const tasks = currentModule(test, activeSection(s)!)!.tasks;
    gotoTask(s, test, 3);
    gotoTask(s, test, 0); // back to the first text
    const blankId = scoredItems(tasks[0])[0].id;
    saveAnswer(s, test, blankId, { kind: "text", value: "x" }, T0 + 1000); // answers stay editable
    gotoTask(s, test, tasks.length - 1);
    nextTask(s, test, T0 + 2000); // finishing the module moves to Module 2
    const st = activeSection(s)!;
    expect(st.activeModuleId).not.toBe("r-m1");
    expect(() => saveAnswer(s, test, blankId, { kind: "text", value: "y" }, T0 + 3000)).toThrow(/module/);
    expect(st.deadline).toBe(T0 + 2000 + 9 * 60_000);
  });

  it("real-mode Listening: one clock per question (20 s / 30 s), forward-only, auto-submit at 0", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000009", 1, normalizeConfig({ mode: "real", sections: ["listening"] }), T0);
    beginSection(s, test, T0);
    const st = activeSection(s)!;
    expect(st.deadline).toBeNull(); // no module clock: the questions are timed instead
    const tasks = currentModule(test, st)!.tasks;
    const [first, second] = tasks.map((t) => scoredItems(t)[0].id);
    expect(() => saveAnswer(s, test, first, { kind: "mcq", optionId: "a" }, T0)).toThrow(/on screen/); // clock not started

    startQuestion(s, test, first, T0 + 5000); // recording finished after 5 s
    expect(st.question).toEqual({ itemId: first, deadline: T0 + 5000 + (tasks[0].kind === "choose_response" ? 20_000 : 30_000) });
    const opt = (tasks[0] as { questions: McqItem[] }).questions[0].options[0].id;
    saveAnswer(s, test, first, { kind: "mcq", optionId: opt }, T0 + 9000);
    submitQuestion(s, test, first, T0 + 10_000);
    expect(st.taskIndex).toBe(1);
    expect(() => saveAnswer(s, test, first, { kind: "mcq", optionId: opt }, T0 + 11_000)).toThrow(); // cannot go back

    startQuestion(s, test, second, T0 + 15_000);
    timeout(s, test, st.question!.deadline); // time ran out: submitted unanswered, next question
    expect(st.lockedItems).toContain(second);
    expect(st.taskIndex).toBe(2);
    expect(st.question).toBeNull();
  });

  it("timed practice Listening: per-question clocks; Check answer pauses the clock until Next", () => {
    const test = loadTest(1);
    const cfg = normalizeConfig({ mode: "practice", sections: ["listening"], timed: true, instantCorrection: true });
    const s = createSession("00000000-0000-0000-0000-00000000000a", 1, cfg, T0);
    beginSection(s, test, T0);
    const st = activeSection(s)!;
    expect(st.deadline).toBeNull();
    const tasks = currentModule(test, st)!.tasks;
    const first = scoredItems(tasks[0])[0].id;
    expect(() => gotoTask(s, test, 1)).toThrow(/forward-only/); // timed Listening cannot jump around
    startQuestion(s, test, first, T0 + 4000);
    checkItem(s, test, first, T0 + 6000);
    expect(st.question).toMatchObject({ itemId: first, paused: true });
    timeout(s, test, T0 + 120_000); // a paused clock never expires
    expect(st.taskIndex).toBe(0);
    submitQuestion(s, test, first, T0 + 130_000); // Next after reading the feedback
    expect(st.taskIndex).toBe(1);
    expect(st.question).toBeNull();
  });

  it("untimed practice Listening: no clocks, free movement within the block", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-00000000000b", 1, normalizeConfig({ mode: "practice", sections: ["listening"], timed: false }), T0);
    beginSection(s, test, T0);
    const st = activeSection(s)!;
    expect(st.deadline).toBeNull();
    gotoTask(s, test, 2);
    gotoTask(s, test, 0);
    expect(() => startQuestion(s, test, "x", T0)).toThrow(/not individually timed/);
  });

  it("Reading has a clock per module (21 min, then 9 min); Module 2's clock starts when Module 1's ran out", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000004", 1, normalizeConfig({ mode: "real", sections: ["reading"] }), T0);
    beginSection(s, test, T0);
    const d1 = activeSection(s)!.deadline!;
    expect(d1).toBe(T0 + 21 * 60_000);
    expect(() => saveAnswer(s, test, "whatever", { kind: "mcq", optionId: "a" }, d1 + 60_000)).toThrow();

    timeout(s, test, d1);
    const st = activeSection(s)!;
    expect(st.modulePath.length).toBe(2);
    expect(st.deadline).toBe(d1 + 9 * 60_000);

    timeout(s, test, st.deadline!);
    expect(s.status).toBe("completed");
    const r = buildResults(s, test);
    expect(r.sections[0].path.length).toBe(2);
    expect(r.sections[0].stats!.total).toBe(50);
    expect(r.sections[0].endedBy).toBe("timeout");
  });

  it("timed Listening still routes adaptively (strong Module 1 → upper module), without a module clock", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000008", 1, normalizeConfig({ mode: "real", sections: ["listening"] }), T0);
    beginSection(s, test, T0);
    answerModuleCorrectly(s, 1, T0 + 1000);
    const st = activeSection(s)!;
    expect(st.activeModuleId).toBe("l-m2-hard");
    expect(st.deadline).toBeNull();
  });

  it("expire() applies deadlines lazily after the tab was closed", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000005", 1, normalizeConfig({ mode: "real", sections: ["reading", "listening"] }), T0);
    beginSection(s, test, T0);
    expect(expire(s, test, T0 + 31 * 60_000)).toBe(true);
    expect(activeSection(s)!.id).toBe("listening");
    expect(activeSection(s)!.status).toBe("ready");
  });

  it("writing: three timed blocks, essays queued for evaluation once final", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000006", 1, normalizeConfig({ mode: "practice", sections: ["writing"], timed: true }), T0);
    beginSection(s, test, T0);
    const st = activeSection(s)!;
    expect(st.blockDeadline).toBe(T0 + 360_000);
    for (let i = 0; i < 10; i++) nextTask(s, test, T0);
    expect(st.blockIndex).toBe(1);
    expect(st.blockStarted).toBe(false);
    beginBlock(s, test, T0 + 5000);
    expect(st.blockDeadline).toBe(T0 + 5000 + 420_000);
    const email = currentModule(test, st)!.tasks[st.taskIndex];
    saveAnswer(s, test, email.id, { kind: "essay", text: "Dear manager, ..." }, T0 + 6000);
    expect(itemsNeedingEvaluation(s, test)).toEqual([]);
    nextTask(s, test, T0 + 7000);
    expect(itemsNeedingEvaluation(s, test)).toEqual([email.id]);
  });

  it("a full test with an empty section is not scored (ETS rule)", () => {
    const test = loadTest(1);
    const s = createSession("00000000-0000-0000-0000-000000000009", 1, normalizeConfig({ mode: "practice", sections: ["reading", "listening", "writing", "speaking"], timed: false }), T0);
    for (let guard = 0; guard < 40 && s.status === "active"; guard++) {
      const st = activeSection(s)!;
      if (st.status === "ready") beginSection(s, test, T0);
      else if (!st.blockStarted) beginBlock(s, test, T0);
      else {
        if (st.id === "reading" && !Object.keys(s.answers).length) answerModuleCorrectly(s, 0.5, T0);
        else endBlockEarly(s, test, T0);
      }
    }
    expect(s.status).toBe("completed");
    const r = buildResults(s, test);
    expect(r.overall.status).toBe("not_scored");
    expect(r.overall.band).toBeNull();
    expect(r.overall.emptySections).toEqual(["Listening", "Writing", "Speaking"]);
  });

  it("the client view never contains answers, transcripts or rubrics", () => {
    const test = loadTest(1);
    for (const section of ["reading", "listening", "writing", "speaking"] as const) {
      const s = createSession("00000000-0000-0000-0000-000000000007", 1, normalizeConfig({ mode: "real", sections: [section] }), T0);
      beginSection(s, test, T0);
      const json = JSON.stringify(buildView(s, test, T0));
      expect(json).not.toMatch(/correctOptionId|"correct"|explanation|transcript|correctOrder|acceptedOrders|correctSentence|fullWord|rubric|"sentence"/);
      const mod = currentModule(test, activeSection(s)!)!;
      const firstMcq = mod.tasks.flatMap((t) => ("questions" in t ? (t.questions as McqItem[]) : []))[0];
      if (firstMcq) expect(json).toContain(firstMcq.stem.slice(0, 20).replace(/"/g, '\\"'));
    }
  });
});
