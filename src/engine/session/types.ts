import type { SectionId } from "../bank/types";
import type { WritingLevels } from "../exercises/types";
import type { RoutingDecision } from "../adaptive/router";
import type { Answer } from "../evaluation/objective";

export type SessionMode = "real" | "practice";

export interface SessionConfig {
  mode: SessionMode;
  sections: SectionId[];
  instantCorrection: boolean;
  timed: boolean;
}

export type SectionStatus = "pending" | "ready" | "active" | "completed";

export interface SectionState {
  id: SectionId;
  status: SectionStatus;
  /** Module ids taken, in order (adaptive path). */
  modulePath: string[];
  activeModuleId: string | null;
  blockIndex: number;
  /** A block waits for "Begin" (directions screen) before its clock starts. */
  blockStarted: boolean;
  taskIndex: number;
  lockedTasks: string[];
  /** Practice + Instant Correction: individual questions checked inside a multi-question task. */
  lockedItems: string[];
  startedAt: number | null;
  /** Clock of the current Reading/Listening module. */
  deadline: number | null;
  blockDeadline: number | null;
  /** Timed Listening: the question on screen and its own clock (paused once checked in practice). */
  question?: { itemId: string; deadline: number; paused?: boolean } | null;
  routing: RoutingDecision | null;
  completedAt: number | null;
  endedBy: "submit" | "timeout" | null;
}

export type StoredAnswer = Answer & { at: number };

/** What the speech-to-text service heard (same shape as its response), kept so the learner can check it. */
export interface Transcription {
  text: string;
  language: string;
  duration: number;
  words: { w: string; start: number; end: number; p: number }[];
}

/** Stored by the engine, produced by the AI layer (feedback shape is owned there). */
export interface EvaluationRecord {
  itemId: string;
  kind: "speaking" | "writing";
  /**
   * "review": a spoken answer was transcribed and waits for the learner to check (and correct) the transcript;
   * it is evaluated once they validate it.
   */
  status: "queued" | "running" | "review" | "done" | "error";
  stage: "transcribing" | "evaluating" | null;
  score: number | null;
  /** The transcript used for scoring: the speech-to-text result, or the learner's corrected version. */
  transcript: string | null;
  /** Speaking: the raw speech-to-text result (absent on evaluations made before the transcript check existed). */
  stt?: Transcription | null;
  /** Speaking: the learner changed the transcript before validating it. */
  edited?: boolean;
  feedback: unknown;
  /** Writing: the CEFR level of the corrected version of the response, and it rewritten at other levels (on request). */
  levels?: WritingLevels;
  error: string | null;
  model: string | null;
  updatedAt: number;
}

export interface Session {
  id: string;
  testNumber: number;
  createdAt: number;
  updatedAt: number;
  status: "active" | "completed";
  config: SessionConfig;
  sectionIndex: number;
  sections: SectionState[];
  answers: Record<string, StoredAnswer>;
  notes: Partial<Record<SectionId, string>>;
  evaluations: Record<string, EvaluationRecord>;
  completedAt: number | null;
}
