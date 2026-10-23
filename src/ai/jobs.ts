import path from "node:path";
import type { BankTest } from "@/engine/bank/types";
import { itemIndex, loadTest } from "@/engine/bank/loader";
import { RECORDINGS_DIR } from "@/engine/paths";
import { itemsNeedingEvaluation } from "@/engine/session/session";
import { sessions } from "@/engine/session/store";
import type { Session } from "@/engine/session/types";
import { evaluateInterview, evaluateRepeat, evaluateWriting } from "./evaluators";
import { transcribe } from "./stt";

interface Job {
  sessionId: string;
  itemId: string;
}

/** Marks newly final essay/speech items as queued inside a session update; returns their ids. */
export function markNewEvaluations(s: Session, test: BankTest, now: number): string[] {
  const ids = itemsNeedingEvaluation(s, test);
  for (const itemId of ids) {
    const kind = s.answers[itemId]?.kind === "recording" ? "speaking" : "writing";
    s.evaluations[itemId] = {
      itemId, kind, status: "queued", stage: null, score: null, transcript: null,
      feedback: null, error: null, model: null, updatedAt: now,
    };
  }
  return ids;
}

/**
 * Two lanes: speech-to-text (fast, separate service) and AI evaluation (slow, local model), so a new recording
 * is transcribed right away even while earlier answers are being scored. A spoken answer stops after
 * transcription ("review") until the learner validates its transcript (`confirmTranscript`).
 */
interface QueueState {
  stt: Job[];
  evals: Job[];
  running: { stt: boolean; evals: boolean };
  recovered: boolean;
}
// Only the state is process-wide, so code changes apply after a hot reload without losing queued work.
const g = globalThis as unknown as { __toeflEvalState?: QueueState };
const state: QueueState = (g.__toeflEvalState ??= { stt: [], evals: [], running: { stt: false, evals: false }, recovered: false });

class EvaluationQueue {
  private get stt() {
    return state.stt;
  }
  private get evals() {
    return state.evals;
  }

  enqueue(sessionId: string, itemIds: string[]) {
    for (const itemId of itemIds) {
      if (!this.stt.some((j) => j.sessionId === sessionId && j.itemId === itemId)) this.stt.push({ sessionId, itemId });
    }
    void this.pump("stt");
  }

  /** After a restart, pick up evaluations that were queued or interrupted (not those waiting for review). */
  async recover() {
    if (state.recovered) return;
    state.recovered = true;
    for (const s of await sessions.list()) {
      const ids = Object.values(s.evaluations).filter((e) => e.status === "queued" || e.status === "running").map((e) => e.itemId);
      if (ids.length) this.enqueue(s.id, ids);
    }
  }

  private async pump(lane: "stt" | "evals") {
    if (state.running[lane]) return;
    state.running[lane] = true;
    const queue = lane === "stt" ? this.stt : this.evals;
    try {
      while (queue.length) {
        const job = queue.shift()!;
        await (lane === "stt" ? this.transcribeStep(job) : this.evaluateStep(job)).catch((e) => console.error("[eval] unexpected failure", e));
      }
    } finally {
      state.running[lane] = false;
    }
  }

  private patch(sessionId: string, itemId: string, fn: (rec: Session["evaluations"][string]) => void) {
    return sessions.update(sessionId, (s) => {
      const rec = s.evaluations[itemId];
      if (rec) {
        fn(rec);
        rec.updatedAt = Date.now();
      }
    });
  }

  /** Spoken answers without a transcript are transcribed and wait for review; everything else goes to the AI lane. */
  private async transcribeStep({ sessionId, itemId }: Job) {
    const session = await sessions.get(sessionId);
    const rec = session?.evaluations[itemId];
    const answer = session?.answers[itemId];
    if (!session || !rec || rec.status === "done" || rec.status === "review") return;
    if (answer?.kind !== "recording" || rec.stt) {
      this.evals.push({ sessionId, itemId });
      return void this.pump("evals");
    }
    try {
      await this.patch(sessionId, itemId, (r) => Object.assign(r, { status: "running", stage: "transcribing", error: null }));
      const task = itemIndex(session.testNumber).get(itemId)!.task;
      const stt = await transcribe(path.join(RECORDINGS_DIR, answer.file), task.kind === "listen_and_repeat" ? task.sentence : undefined);
      await this.patch(sessionId, itemId, (r) => Object.assign(r, { status: "review", stage: null, stt, transcript: stt.text, edited: false }));
    } catch (e) {
      console.error(`[eval] ${sessionId}/${itemId}:`, (e as Error).message);
      await this.patch(sessionId, itemId, (r) => Object.assign(r, { status: "error", stage: null, error: (e as Error).message }));
    }
  }

  private async evaluateStep({ sessionId, itemId }: Job) {
    const { session, result: go } = await sessions.update(sessionId, (s) => {
      const rec = s.evaluations[itemId];
      if (!rec || rec.status === "done" || rec.status === "review") return false;
      rec.status = "running";
      rec.stage = "evaluating";
      rec.error = null;
      rec.updatedAt = Date.now();
      return true;
    });
    if (!go) return;
    const patch = (fn: (rec: Session["evaluations"][string]) => void) => this.patch(sessionId, itemId, fn);

    try {
      const test = loadTest(session.testNumber);
      const ref = itemIndex(session.testNumber).get(itemId)!;
      const answer = session.answers[itemId];
      const rec = session.evaluations[itemId];
      const task = ref.task;

      if (answer?.kind === "essay" && (task.kind === "write_email" || task.kind === "academic_discussion")) {
        const out = await evaluateWriting(task, answer.text);
        await patch((r) => Object.assign(r, { status: "done", stage: null, score: out.score, feedback: out.feedback, model: out.model }));
        // Its spelling and grammar mistakes feed spelling practice and the generated grammar questions.
        void import("@/server/admin/mistakes").then((x) => x.requestMistakeSync());
        return;
      }
      if (answer?.kind === "recording" && rec.stt && (task.kind === "listen_and_repeat" || task.kind === "interview")) {
        // Scored on the transcript the learner validated; timing and confidence still come from the recording.
        const stt = { ...rec.stt, text: rec.transcript ?? rec.stt.text };
        const out =
          task.kind === "listen_and_repeat"
            ? evaluateRepeat(task, stt)
            : await evaluateInterview(task, test.sections.speaking.speaking!, stt);
        await patch((r) => Object.assign(r, { status: "done", stage: null, score: out.score, feedback: out.feedback, model: out.model }));
        return;
      }
      throw new Error("Nothing to evaluate for this item.");
    } catch (e) {
      console.error(`[eval] ${sessionId}/${itemId}:`, (e as Error).message);
      await patch((r) => Object.assign(r, { status: "error", stage: null, error: (e as Error).message }));
    }
  }
}

/** The learner checked a spoken answer's transcript (correcting it if needed): score it with that text. */
export async function confirmTranscript(sessionId: string, itemId: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 4000);
  const { result } = await sessions.update(sessionId, (s) => {
    const rec = s.evaluations[itemId];
    if (!rec || rec.status !== "review" || !rec.stt) return false;
    rec.transcript = clean;
    rec.edited = clean !== rec.stt.text.replace(/\s+/g, " ").trim();
    rec.status = "queued";
    rec.updatedAt = Date.now();
    return true;
  });
  if (result) evaluationQueue.enqueue(sessionId, [itemId]);
  return result;
}

export const evaluationQueue = new EvaluationQueue();
