import type { InterviewFeedback, WritingFeedback } from "@/ai/feedbackTypes";
import { type LevelTextType, levelOfText, rewriteAtLevel } from "@/ai/exercises/levels";
import { EngineError } from "@/engine/errors";
import { itemIndex } from "@/engine/bank/loader";
import { CEFR_LEVELS, type Cefr, type WritingLevels } from "@/engine/exercises/types";
import { sessions } from "@/engine/session/store";
import { correctedText } from "@/lib/corrections";

const jobs = new Map<string, Promise<WritingLevels>>();

/**
 * Series writing: the CEFR level of the corrected version of the response (the response with the AI's corrections
 * applied) and, with `level`, that text rewritten at another level. Each result is generated once and kept with
 * the evaluation; the same request in flight is shared.
 */
export function seriesWritingLevels(sessionId: string, itemId: string, level?: Cefr): Promise<WritingLevels> {
  if (level && !CEFR_LEVELS.includes(level)) throw new EngineError("invalid_level", "Unknown level.", 400);
  const key = `${sessionId}:${itemId}:${level ?? "rate"}`;
  const running = jobs.get(key);
  if (running) return running;
  const job = build(sessionId, itemId, level).finally(() => jobs.delete(key));
  jobs.set(key, job);
  return job;
}

async function build(sessionId: string, itemId: string, level?: Cefr): Promise<WritingLevels> {
  const s = await sessions.get(sessionId);
  if (!s) throw new EngineError("session_not_found", "Session not found", 404);
  const ev = s.evaluations[itemId];
  const answer = s.answers[itemId];
  if (!ev || ev.status !== "done") throw new EngineError("not_evaluated", "This answer has not been evaluated yet.", 409);
  const kind = itemIndex(s.testNumber).get(itemId)?.task.kind;
  // Writing: the response with its corrections applied. Interview: the validated transcript, corrected the same way.
  let base = "";
  let type: LevelTextType;
  if (ev.kind === "writing" && answer?.kind === "essay") {
    base = correctedText(answer.text, (ev.feedback as WritingFeedback).corrections).trim();
    type = kind === "academic_discussion" ? "discussion" : "email";
  } else if (ev.kind === "speaking" && (ev.feedback as InterviewFeedback | null)?.kind === "interview" && ev.transcript) {
    base = correctedText(ev.transcript, (ev.feedback as InterviewFeedback).corrections).trim();
    type = "speaking";
  } else {
    throw new EngineError("not_rated", "Only writing and interview answers have a level.", 409);
  }
  if (!base) throw new EngineError("no_text", "There is no text to rate.", 409);

  let levels: WritingLevels = ev.levels ?? { estimated: null, reason: null, versions: {} };
  const save = async (patch: (l: WritingLevels) => void) => {
    const { session } = await sessions.update(sessionId, (ss) => {
      const e = ss.evaluations[itemId];
      if (!e) return;
      e.levels ??= { estimated: null, reason: null, versions: {} };
      patch(e.levels);
    });
    levels = session.evaluations[itemId]?.levels ?? levels;
  };
  if (!levels.estimated) {
    const r = await levelOfText(base, type);
    await save((l) => {
      l.estimated = r.level;
      l.reason = r.reason;
    });
  }
  if (level && level !== levels.estimated && !levels.versions[level]) {
    const v = await rewriteAtLevel(base, levels.estimated!, level, type);
    await save((l) => void (l.versions[level] = v));
  }
  return levels;
}
