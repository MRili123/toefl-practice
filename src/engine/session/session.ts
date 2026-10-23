import type { BankTest, Module, SectionId, Task } from "../bank/types";
import { SECTION_ORDER } from "../bank/types";
import { getModule, type ItemRef, itemIndex } from "../bank/loader";
import { scoredItems } from "../bank/items";
import { isAdaptive, routeAfterStage1, type RoutingDecision } from "../adaptive/router";
import { TOEFL_2026, timeScale } from "../config/toefl2026";
import { EngineError } from "../errors";
import { gradeItem } from "../evaluation/grade";
import type { Answer } from "../evaluation/objective";
import type { SectionState, Session, SessionConfig } from "./types";

export interface Block {
  start: number;
  end: number;
  seconds: number | null;
  label: string;
}

const EARLY_TIMEOUT_TOLERANCE_MS = 3000;

/** Timing groups inside a module. Writing has three separately-timed tasks; other sections use one block. */
export function blocksOf(sectionId: SectionId, mod: Module): Block[] {
  if (sectionId !== "writing") {
    const label = sectionId === "speaking" ? "Speaking" : mod.stage === 1 ? "Module 1" : "Module 2";
    return [{ start: 0, end: mod.tasks.length, seconds: null, label }];
  }
  const w = TOEFL_2026.timing.writing;
  const groupOf = (t: Task) => t.kind;
  const blocks: Block[] = [];
  mod.tasks.forEach((t, i) => {
    const last = blocks[blocks.length - 1];
    if (last && groupOf(mod.tasks[last.start]) === groupOf(t)) {
      last.end = i + 1;
      return;
    }
    const seconds = t.kind === "build_a_sentence" ? w.buildASentenceBlock : t.kind === "write_email" ? w.email : w.discussion;
    const label = t.kind === "build_a_sentence" ? "Build a Sentence" : t.kind === "write_email" ? "Write an Email" : "Write for an Academic Discussion";
    blocks.push({ start: i, end: i + 1, seconds, label });
  });
  return blocks;
}

export function normalizeConfig(input: Partial<SessionConfig>): SessionConfig {
  const mode = input.mode === "practice" ? "practice" : "real";
  const sections = SECTION_ORDER.filter((s) => input.sections?.includes(s));
  if (sections.length === 0) throw new EngineError("no_sections", "Select at least one section.");
  return {
    mode,
    sections,
    instantCorrection: mode === "practice" && !!input.instantCorrection,
    timed: mode === "real" ? true : input.timed !== false,
  };
}

export function createSession(id: string, testNumber: number, config: SessionConfig, now: number): Session {
  return {
    id,
    testNumber,
    createdAt: now,
    updatedAt: now,
    status: "active",
    config,
    sectionIndex: 0,
    sections: config.sections.map((sid, i) => ({
      id: sid,
      status: i === 0 ? "ready" : "pending",
      modulePath: [],
      activeModuleId: null,
      blockIndex: 0,
      blockStarted: false,
      taskIndex: 0,
      lockedTasks: [],
      lockedItems: [],
      startedAt: null,
      deadline: null,
      blockDeadline: null,
      routing: null,
      completedAt: null,
      endedBy: null,
    })),
    answers: {},
    notes: {},
    evaluations: {},
    completedAt: null,
  };
}

/* ---------- helpers ---------- */

export function activeSection(s: Session): SectionState | null {
  return s.status === "active" ? s.sections[s.sectionIndex] ?? null : null;
}

function requireActive(s: Session): SectionState {
  const st = activeSection(s);
  if (!st) throw new EngineError("session_completed", "This test session is complete.", 409);
  return st;
}

function requireRunning(s: Session): SectionState {
  const st = requireActive(s);
  if (st.status !== "active") throw new EngineError("section_not_started", "The section has not started.", 409);
  if (!st.blockStarted) throw new EngineError("block_not_started", "The task has not started.", 409);
  return st;
}

export function currentModule(test: BankTest, st: SectionState): Module | null {
  return st.activeModuleId ? getModule(test, st.id, st.activeModuleId) : null;
}

export function currentBlock(test: BankTest, st: SectionState): Block | null {
  const m = currentModule(test, st);
  return m ? blocksOf(st.id, m)[st.blockIndex] ?? null : null;
}

function scaledMs(seconds: number): number {
  return Math.round(seconds * 1000 * timeScale());
}

function startBlock(s: Session, test: BankTest, st: SectionState, now: number) {
  const block = currentBlock(test, st)!;
  st.blockStarted = true;
  st.blockDeadline = s.config.timed && block.seconds ? now + scaledMs(block.seconds) : null;
}

/**
 * 2026 TOEFL navigation in Real Test Conditions: Reading lets you move freely inside the current module (one
 * clock per module, no return to Module 1); Listening, Writing and Speaking are forward-only.
 * Practice mode can move within the current block, except Speaking and timed Listening (questions are timed).
 */
function forwardOnly(s: Session, st: SectionState): boolean {
  return (s.config.mode === "real" && st.id !== "reading") || st.id === "speaking" || questionTimed(s, st);
}

/** Timed Listening (real or practice): every question has its own clock instead of a module clock. */
export function questionTimed(s: Session, st: SectionState): boolean {
  return s.config.timed && st.id === "listening";
}

const clockRunning = (st: SectionState) => !!st.question && !st.question.paused;

function questionSeconds(task: Task): number {
  const q = TOEFL_2026.timing.listeningQuestionSeconds;
  return task.kind === "choose_response" ? q.choose_response : q.other;
}

function locateTask(test: BankTest, st: SectionState, taskId: string) {
  const mod = currentModule(test, st)!;
  const index = mod.tasks.findIndex((t) => t.id === taskId);
  const block = currentBlock(test, st)!;
  if (index < block.start || index >= block.end) {
    throw new EngineError("task_not_current", "That task is not part of the current block.", 409);
  }
  return { mod, index, task: mod.tasks[index] };
}

function checkTime(st: SectionState, now: number) {
  const grace = TOEFL_2026.timing.graceMs;
  if (
    (st.deadline !== null && now > st.deadline + grace) ||
    (st.blockDeadline !== null && now > st.blockDeadline + grace) ||
    (clockRunning(st) && now > st.question!.deadline + grace)
  ) {
    throw new EngineError("time_expired", "Time has expired for this part of the test.", 409);
  }
}

function moduleStats(s: Session, test: BankTest, sectionId: SectionId, moduleId: string) {
  const idx = itemIndex(s.testNumber);
  const mod = getModule(test, sectionId, moduleId);
  let correct = 0;
  let total = 0;
  for (const it of mod.tasks.flatMap(scoredItems)) {
    const g = gradeItem(idx.get(it.id)!, s.answers[it.id]);
    if (g === null) continue;
    total++;
    if (g === "correct") correct++;
  }
  return { moduleId, correct, total };
}

function route(s: Session, test: BankTest, st: SectionState): RoutingDecision {
  const section = test.sections[st.id];
  const decision = routeAfterStage1(section, moduleStats(s, test, st.id, st.activeModuleId!));
  st.routing = decision;
  st.modulePath.push(decision.nextModuleId);
  st.activeModuleId = decision.nextModuleId;
  st.blockIndex = 0;
  st.taskIndex = 0;
  return decision;
}

function finishSection(s: Session, st: SectionState, reason: "submit" | "timeout", now: number) {
  st.status = "completed";
  st.completedAt = now;
  st.endedBy = reason;
  st.blockStarted = false;
  st.blockDeadline = null;
  s.sectionIndex++;
  const next = s.sections[s.sectionIndex];
  if (next) next.status = "ready";
  else {
    s.status = "completed";
    s.completedAt = now;
  }
}

/** Reading/Listening modules each have their own clock (ETS: router module, then lower/upper module). */
function moduleDeadline(s: Session, sectionId: SectionId, mod: Module, start: number): number | null {
  const cfg = TOEFL_2026.timing.moduleSeconds[sectionId];
  if (!s.config.timed || !cfg) return null;
  const seconds = mod.stage === 1 ? cfg.stage1 : mod.difficulty === "hard" ? cfg.hard : cfg.easy;
  return start + scaledMs(seconds);
}

/** `start` is when Module 2's clock begins: now, or the moment Module 1's clock ran out. */
function finishModule(s: Session, test: BankTest, st: SectionState, reason: "submit" | "timeout", now: number, start = now) {
  const mod = currentModule(test, st)!;
  if (mod.stage === 1 && isAdaptive(test.sections[st.id])) {
    route(s, test, st);
    st.deadline = moduleDeadline(s, st.id, currentModule(test, st)!, start);
    startBlock(s, test, st, now);
    return;
  }
  finishSection(s, st, reason, now);
}

function finishBlock(s: Session, test: BankTest, st: SectionState, reason: "submit" | "timeout", now: number) {
  st.question = null;
  const mod = currentModule(test, st)!;
  const blocks = blocksOf(st.id, mod);
  if (st.blockIndex < blocks.length - 1) {
    st.blockIndex++;
    st.taskIndex = blocks[st.blockIndex].start;
    // Writing tasks each open on a directions screen; their clock starts on "Begin".
    st.blockStarted = false;
    st.blockDeadline = null;
    return;
  }
  finishModule(s, test, st, reason, now);
}

/** A module clock ran out: Module 1 routes to Module 2 (whose clock starts when Module 1's ended); Module 2 ends the section. */
function moduleTimeout(s: Session, test: BankTest, st: SectionState, now: number) {
  finishModule(s, test, st, "timeout", now, Math.min(now, st.deadline ?? now));
}

/* ---------- public transitions ---------- */

/** Applies any deadlines that passed while no request was in flight (e.g. the tab was closed). */
export function expire(s: Session, test: BankTest, now: number): boolean {
  const grace = TOEFL_2026.timing.graceMs;
  let changed = false;
  for (let guard = 0; guard < 20; guard++) {
    const st = activeSection(s);
    if (!st || st.status !== "active") break;
    if (st.deadline !== null && now > st.deadline + grace) {
      moduleTimeout(s, test, st, now);
    } else if (st.blockStarted && st.blockDeadline !== null && now > st.blockDeadline + grace) {
      finishBlock(s, test, st, "timeout", now);
    } else if (st.blockStarted && clockRunning(st) && now > st.question!.deadline + grace) {
      closeQuestion(s, test, st, now);
    } else break;
    changed = true;
  }
  return changed;
}

export function beginSection(s: Session, test: BankTest, now: number) {
  const st = requireActive(s);
  if (st.status !== "ready") return;
  const first = test.sections[st.id].modules.find((m) => m.stage === 1)!;
  st.status = "active";
  st.startedAt = now;
  st.activeModuleId = first.id;
  st.modulePath = [first.id];
  st.blockIndex = 0;
  st.taskIndex = 0;
  st.deadline = moduleDeadline(s, st.id, first, now);
  startBlock(s, test, st, now);
}

export function beginBlock(s: Session, test: BankTest, now: number) {
  const st = requireActive(s);
  if (st.status !== "active" || st.blockStarted) return;
  startBlock(s, test, st, now);
}

export function saveAnswer(s: Session, test: BankTest, itemId: string, answer: Answer, now: number) {
  const st = requireRunning(s);
  const ref = itemIndex(s.testNumber).get(itemId);
  if (!ref || ref.sectionId !== st.id || ref.moduleId !== st.activeModuleId) {
    throw new EngineError("item_not_current", "That question is not part of the current module.", 409);
  }
  const { index, task } = locateTask(test, st, ref.task.id);
  if (forwardOnly(s, st) && index !== st.taskIndex) {
    throw new EngineError("task_not_current", "You can only answer the current question.", 409);
  }
  if (questionTimed(s, st) && st.question?.itemId !== itemId) {
    throw new EngineError("question_not_current", "You can only answer the question on screen.", 409);
  }
  if (st.lockedTasks.includes(task.id) || st.lockedItems.includes(itemId)) {
    throw new EngineError("task_locked", "This question has already been submitted.", 409);
  }
  checkTime(st, now);
  validateAnswer(ref.scored.kind, ref, answer);
  s.answers[itemId] = { ...answer, at: now };
}

function validateAnswer(kind: string, ref: ItemRef, answer: Answer) {
  const bad = () => {
    throw new EngineError("invalid_answer", "Invalid answer for this question type.");
  };
  switch (kind) {
    case "mcq":
      if (answer.kind !== "mcq" || !ref.mcq!.options.some((o) => o.id === answer.optionId)) bad();
      return;
    case "ctw":
      if (answer.kind !== "text" || answer.value.length > 40) bad();
      return;
    case "bas": {
      if (answer.kind !== "order" || ref.task.kind !== "build_a_sentence") return bad();
      const pool = [...ref.task.chunks];
      for (const c of answer.chunks) {
        const i = pool.indexOf(c);
        if (i < 0) bad();
        pool.splice(i, 1);
      }
      return;
    }
    case "essay":
      if (answer.kind !== "essay" || answer.text.length > 20000) bad();
      return;
    case "speech":
      if (answer.kind !== "recording") bad();
      return;
  }
}

export function gotoTask(s: Session, test: BankTest, taskIndex: number) {
  const st = requireRunning(s);
  if (forwardOnly(s, st)) throw new EngineError("navigation_locked", "Navigation is forward-only in this mode.", 409);
  const block = currentBlock(test, st)!;
  if (!Number.isInteger(taskIndex) || taskIndex < block.start || taskIndex >= block.end) {
    throw new EngineError("task_not_current", "That task is outside the current block.", 409);
  }
  st.taskIndex = taskIndex;
}

/** Practice-mode "Next": moves within the block, or ends the block from its last task. */
export function nextTask(s: Session, test: BankTest, now: number) {
  const st = requireRunning(s);
  if (forwardOnly(s, st)) throw new EngineError("navigation_locked", "Submit the current question to continue.", 409);
  const block = currentBlock(test, st)!;
  if (st.taskIndex < block.end - 1) st.taskIndex++;
  else finishBlock(s, test, st, "submit", now);
}

/** Locks a task. Real mode (and speaking) always advances; practice lets the client show feedback first. */
export function submitTask(s: Session, test: BankTest, taskId: string, advance: boolean, now: number) {
  const st = requireRunning(s);
  const { index, task } = locateTask(test, st, taskId);
  const fwd = forwardOnly(s, st);
  if (fwd && index !== st.taskIndex) throw new EngineError("task_not_current", "You can only submit the current question.", 409);
  if (!st.lockedTasks.includes(task.id)) {
    checkTime(st, now);
    st.lockedTasks.push(task.id);
  }
  if (fwd || advance) {
    st.taskIndex = index;
    nextAfterLock(s, test, st, now);
  }
}

/** Practice + Instant Correction: check one multiple-choice question without locking its whole set. */
export function checkItem(s: Session, test: BankTest, itemId: string, now: number) {
  const st = requireRunning(s);
  if (!s.config.instantCorrection) throw new EngineError("not_allowed", "Instant correction is off for this session.", 409);
  const ref = itemIndex(s.testNumber).get(itemId);
  if (!ref || ref.scored.kind !== "mcq" || ref.moduleId !== st.activeModuleId) {
    throw new EngineError("item_not_current", "That question is not part of the current module.", 409);
  }
  locateTask(test, st, ref.task.id);
  if (questionTimed(s, st)) {
    if (st.question?.itemId !== itemId) throw new EngineError("question_not_current", "That question is not the current one.", 409);
    checkTime(st, now);
    st.question.paused = true; // feedback is shown; Next moves on
  } else checkTime(st, now);
  if (!st.lockedItems.includes(itemId)) st.lockedItems.push(itemId);
}

function nextAfterLock(s: Session, test: BankTest, st: SectionState, now: number) {
  st.question = null;
  const block = currentBlock(test, st)!;
  if (st.taskIndex < block.end - 1) st.taskIndex++;
  else finishBlock(s, test, st, "submit", now);
}

/* ---------- Timed Listening: one clock per question ---------- */

/** Starts the clock of a listening question when it appears (after its recording). Idempotent per question. */
export function startQuestion(s: Session, test: BankTest, itemId: string, now: number) {
  const st = requireRunning(s);
  if (!questionTimed(s, st)) throw new EngineError("not_allowed", "Questions are not individually timed here.", 409);
  const mod = currentModule(test, st)!;
  const task = mod.tasks[st.taskIndex];
  const items = scoredItems(task).map((i) => i.id);
  const pos = items.indexOf(itemId);
  if (pos < 0 || st.lockedTasks.includes(task.id) || st.lockedItems.includes(itemId)) {
    throw new EngineError("question_not_current", "That question is not the current one.", 409);
  }
  if (items.slice(0, pos).some((id) => !st.lockedItems.includes(id))) {
    throw new EngineError("question_not_current", "Answer the questions in order.", 409);
  }
  if (st.question?.itemId === itemId) return; // already running (e.g. the page was reloaded)
  if (st.question) throw new EngineError("question_running", "Finish the current question first.", 409);
  st.question = { itemId, deadline: now + scaledMs(questionSeconds(task)) };
}

/** Locks the running listening question (Next, or its clock ran out) and moves on. */
function closeQuestion(s: Session, test: BankTest, st: SectionState, now: number) {
  const mod = currentModule(test, st)!;
  const task = mod.tasks[st.taskIndex];
  const current = st.question?.itemId;
  if (current && !st.lockedItems.includes(current)) st.lockedItems.push(current);
  st.question = null;
  if (scoredItems(task).every((i) => st.lockedItems.includes(i.id))) {
    if (!st.lockedTasks.includes(task.id)) st.lockedTasks.push(task.id);
    nextAfterLock(s, test, st, now);
  }
}

export function submitQuestion(s: Session, test: BankTest, itemId: string, now: number) {
  const st = requireRunning(s);
  if (!questionTimed(s, st)) throw new EngineError("not_allowed", "Questions are not individually timed here.", 409);
  if (st.question?.itemId !== itemId) throw new EngineError("question_not_current", "That question is not the current one.", 409);
  if (!st.question.paused) checkTime(st, now);
  closeQuestion(s, test, st, now);
}

export function endBlockEarly(s: Session, test: BankTest, now: number) {
  const st = requireRunning(s);
  finishBlock(s, test, st, "submit", now);
}

export function timeout(s: Session, test: BankTest, now: number) {
  const st = requireActive(s);
  if (st.status !== "active") return;
  if (st.deadline !== null && now >= st.deadline - EARLY_TIMEOUT_TOLERANCE_MS) moduleTimeout(s, test, st, now);
  else if (st.blockStarted && st.blockDeadline !== null && now >= st.blockDeadline - EARLY_TIMEOUT_TOLERANCE_MS) {
    finishBlock(s, test, st, "timeout", now);
  } else if (st.blockStarted && clockRunning(st) && now >= st.question!.deadline - EARLY_TIMEOUT_TOLERANCE_MS) {
    closeQuestion(s, test, st, now);
  }
}

export function saveNotes(s: Session, text: string) {
  const st = requireActive(s);
  s.notes[st.id] = text.slice(0, 10000);
}

/** Essay/speech items whose task is final and answered, with no evaluation yet. */
export function itemsNeedingEvaluation(s: Session, test: BankTest): string[] {
  const out: string[] = [];
  for (const st of s.sections) {
    for (const moduleId of st.modulePath) {
      const mod = getModule(test, st.id, moduleId);
      const active = st.status !== "completed" && moduleId === st.activeModuleId;
      const finalBefore = active ? currentBlock(test, st)!.start : mod.tasks.length;
      mod.tasks.forEach((task, i) => {
        if (active && i >= finalBefore && !st.lockedTasks.includes(task.id)) return;
        for (const it of scoredItems(task)) {
          if (it.kind !== "essay" && it.kind !== "speech") continue;
          if (s.evaluations[it.id]) continue;
          const a = s.answers[it.id];
          const answered = a && ((a.kind === "essay" && a.text.trim().length > 0) || a.kind === "recording");
          if (answered) out.push(it.id);
        }
      });
    }
  }
  return out;
}
