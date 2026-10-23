import path from "node:path";
import {
  evaluateRepeatExercise, evaluateSpeakingExercise, evaluateWritingExercise, generateGrammarQuestion,
} from "@/ai/exercises/evaluate";
import { transcribe } from "@/ai/stt";
import { exerciseBank } from "@/engine/exercises/bank";
import { exampleAround } from "@/engine/exercises/corrections";
import { passesLevel } from "@/engine/exercises/grading";
import { bumpWeakness, recordResult } from "@/engine/exercises/memory";
import { latestAttempt, resolveAttempt } from "@/engine/exercises/session";
import { EXERCISE_RECORDINGS_DIR, exerciseSessions, learnerMemory } from "@/engine/exercises/store";
import {
  type Cefr, CEFR_BAND, type ExerciseCorrection, type GrammarCategory, type RepeatSentence, SPEAKING_TOPICS,
  type SpeakingQuestion, TOPIC_LABEL, type WritingPrompt,
} from "@/engine/exercises/types";
import { requireItem } from "./exerciseItems";

type Job =
  | { type: "evaluate"; sessionId: string; itemId: string }
  | { type: "generate"; category: GrammarCategory; level: Cefr }
  | { type: "task"; key: string; run: () => Promise<void> };

const REPEAT_PASS = 0.9;

/**
 * Background work for exercises: AI evaluation of writing/speaking and generation of grammar questions from
 * recurring mistakes. Serial; model calls additionally share one lane with the exam evaluations.
 */
interface QueueState {
  queue: Job[];
  running: boolean;
  recovered: boolean;
}
// Only the state is process-wide, so hot reloads pick up code changes without losing queued work.
const g = globalThis as unknown as { __toeflExerciseQueueState?: QueueState };
const state: QueueState = (g.__toeflExerciseQueueState ??= { queue: [], running: false, recovered: false });

class ExerciseQueue {
  private get queue() {
    return state.queue;
  }

  evaluate(sessionId: string, itemId: string) {
    if (!this.queue.some((j) => j.type === "evaluate" && j.sessionId === sessionId && j.itemId === itemId)) {
      this.queue.push({ type: "evaluate", sessionId, itemId });
    }
    void this.pump();
  }

  generate(category: GrammarCategory, level: Cefr) {
    if (!this.queue.some((j) => j.type === "generate" && j.category === category && j.level === level)) {
      this.queue.push({ type: "generate", category, level });
    }
    void this.pump();
  }

  /** Any other background model work (e.g. a grammar question for one mistake), run in the same serial queue. */
  task(key: string, run: () => Promise<void>) {
    if (!this.queue.some((j) => j.type === "task" && j.key === key)) this.queue.push({ type: "task", key, run });
    void this.pump();
  }

  /** After a restart, resume evaluations that were queued or interrupted. */
  async recover() {
    if (state.recovered) return;
    state.recovered = true;
    for (const s of await exerciseSessions.list()) {
      for (const a of s.attempts) {
        if (a.ai && (a.ai.stage === "queued" || a.ai.stage === "transcribing" || a.ai.stage === "evaluating")) this.evaluate(s.id, a.itemId);
      }
    }
  }

  private async pump() {
    if (state.running) return;
    state.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        const work =
          job.type === "evaluate" ? this.runEvaluation(job.sessionId, job.itemId)
          : job.type === "generate" ? this.runGeneration(job.category, job.level)
          : job.run();
        await work.catch((e) =>
          console.error("[exercise-queue]", (e as Error).message),
        );
      }
    } finally {
      state.running = false;
    }
  }

  private async setStage(sessionId: string, itemId: string, stage: "transcribing" | "evaluating") {
    await exerciseSessions.update(sessionId, (s) => {
      const a = latestAttempt(s, itemId);
      if (a?.ai) a.ai = { stage, error: null };
    });
  }

  private async runEvaluation(sessionId: string, itemId: string) {
    const s = await exerciseSessions.get(sessionId);
    const attempt = s && latestAttempt(s, itemId);
    if (!s || !attempt?.ai || attempt.ai.stage === "done" || !attempt.answer) return;
    const memory = await learnerMemory.get();
    const now = () => Date.now();
    const toGenerate: { category: GrammarCategory; level: Cefr }[] = [];

    try {
      if (s.kind === "writing") {
        await this.setStage(sessionId, itemId, "evaluating");
        const prompt = requireItem<WritingPrompt>(itemId, memory);
        const out = await evaluateWritingExercise(prompt, attempt.level, attempt.answer, attempt.subject);
        await exerciseSessions.update(sessionId, (x) =>
          resolveAttempt(x, itemId, { feedback: out.feedback, correct: null, ai: { stage: "done", error: null } }, now()),
        );
        await learnerMemory.update((m) => learnFromCorrections(m, out.feedback.corrections, attempt.answer!, attempt.level, "writing", now(), toGenerate));
      } else {
        if (!attempt.stt) {
          // Step 1: transcribe, then wait for the learner to check (and correct) the transcript.
          await this.setStage(sessionId, itemId, "transcribing");
          const hint = s.kind === "speaking-repeat" ? requireItem<RepeatSentence>(itemId, memory).text : undefined;
          const heard = await transcribe(path.join(EXERCISE_RECORDINGS_DIR, sessionId, attempt.answer), hint).catch((e: Error) => {
            // A network failure means the sidecar is down; anything else is a problem with this recording.
            throw new Error(/fetch failed|ECONNREFUSED|aborted/i.test(e.message) ? "stt-unreachable" : e.message);
          });
          await exerciseSessions.update(sessionId, (x) => {
            const a = latestAttempt(x, itemId);
            if (a) Object.assign(a, { stt: heard, transcript: heard.text, transcriptEdited: false, ai: { stage: "review", error: null } });
          });
          return;
        }
        // Step 2 (after validation): score the validated transcript; timing and confidence come from the recording.
        const stt = { ...attempt.stt, text: attempt.transcript ?? attempt.stt.text };
        await this.setStage(sessionId, itemId, "evaluating");
        if (s.kind === "speaking-repeat") {
          const item = requireItem<RepeatSentence>(itemId, memory);
          const feedback = evaluateRepeatExercise(item.text, stt);
          const correct = feedback.accuracy >= REPEAT_PASS;
          await exerciseSessions.update(sessionId, (x) => resolveAttempt(x, itemId, { feedback, correct, ai: { stage: "done", error: null } }, now()));
          await learnerMemory.update((m) => {
            recordResult(m, { kind: "speaking-repeat", itemId, level: item.level, text: item.text, correctAnswer: item.text }, correct, now(), {
              userAnswer: feedback.transcript,
              errorType: correct ? null : feedback.missing.length ? "missing-words" : "changed-words",
            });
          });
        } else {
          const item = requireItem<SpeakingQuestion>(itemId, memory);
          const out = await evaluateSpeakingExercise(item.text, attempt.level, stt);
          const correct = out.feedback.transcript !== "" && passesLevel(out.feedback.score, CEFR_BAND[attempt.level]);
          await exerciseSessions.update(sessionId, (x) => resolveAttempt(x, itemId, { feedback: out.feedback, correct, ai: { stage: "done", error: null } }, now()));
          await learnerMemory.update((m) => learnFromCorrections(m, out.feedback.errors, out.feedback.transcript, attempt.level, "speaking", now(), toGenerate));
        }
      }
    } catch (e) {
      console.error(`[exercise-eval] ${sessionId}/${itemId}:`, (e as Error).message);
      await exerciseSessions.update(sessionId, (x) =>
        resolveAttempt(x, itemId, { ai: { stage: "error", error: friendly(e as Error) } }, now()),
      );
    }
    for (const g of toGenerate) this.generate(g.category, g.level);
    // New spelling/grammar mistakes from writing: words to practise and one grammar question per mistake.
    if (s.kind === "writing") void import("./admin/mistakes").then((x) => x.requestMistakeSync());
  }

  private async runGeneration(category: GrammarCategory, level: Cefr) {
    const m = await learnerMemory.get();
    const weakness = m.weaknesses[`grammar:${category}`];
    const avoid = [
      ...exerciseBank().grammar.filter((g) => g.category === category).map((g) => g.stem),
      ...m.generated.grammar.filter((g) => g.category === category).map((g) => g.stem),
    ];
    const used = new Set(m.generated.grammar.map((g) => g.id));
    let n = m.generated.grammar.length + 1;
    while (used.has(`gr-gen-${n}`)) n++;
    const topic = TOPIC_LABEL[SPEAKING_TOPICS[Math.floor(Math.random() * SPEAKING_TOPICS.length)]].toLowerCase();
    const examples = (weakness?.examples ?? []).map((e) => `${e.original} → ${e.correction}`);
    const q = await generateGrammarQuestion(category, level, topic, examples, avoid, `gr-gen-${n}`);
    await learnerMemory.update((mm) => {
      const w = mm.weaknesses[`grammar:${category}`];
      if (w) w.generatedAtCount = w.count;
      if (q && !mm.generated.grammar.some((g) => g.stem === q.stem)) mm.generated.grammar.push(q);
    });
  }
}

/** Feeds writing/speaking corrections into the weakness counters (Weak areas). */
function learnFromCorrections(
  m: Parameters<typeof bumpWeakness>[0],
  corrections: ExerciseCorrection[],
  text: string,
  level: Cefr,
  source: "writing" | "speaking",
  now: number,
  toGenerate: { category: GrammarCategory; level: Cefr }[],
) {
  for (const c of corrections) {
    if (c.type === "spelling") {
      // Writing mistakes reach Spelling practice after the AI has checked them (admin/mistakes.ts).
      continue;
    } else if (c.type === "grammar" && c.category) {
      // Keep the whole sentence, so a generated question can test the rule in a realistic context.
      const example = (c.start !== null && c.end !== null ? exampleAround(text, c.start, c.end, c.correction) : null) ?? { original: c.original, correction: c.correction };
      const { generate } = bumpWeakness(m, "grammar", c.category, example, now);
      // Writing mistakes get one generated question each (admin/mistakes.ts); speaking keeps the per-category rule.
      if (generate && source === "speaking") toGenerate.push({ category: c.category as GrammarCategory, level });
    } else if (c.type === "vocabulary") {
      bumpWeakness(m, "vocabulary", "word-choice", { original: c.original, correction: c.correction }, now);
    } else if (c.type === "sentence-structure") {
      bumpWeakness(m, "sentence-structure", "structure", { original: c.original, correction: c.correction }, now);
    }
  }
}

function friendly(e: Error): string {
  const msg = e.message;
  if (msg === "stt-unreachable") return "The speech-to-text service is not running. Start it and retry.";
  if (/Speech-to-text failed/i.test(msg)) return "The recording could not be transcribed. Please retry.";
  if (/Ollama|11434|fetch failed/i.test(msg)) return "The local AI model (Ollama) is not reachable. Start Ollama and retry.";
  if (/timeout|aborted/i.test(msg)) return "The evaluation took too long. Retry when the computer is less busy.";
  return "The evaluation failed. Please retry.";
}

export const exerciseQueue = new ExerciseQueue();
