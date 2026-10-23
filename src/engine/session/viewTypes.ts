/** Browser-facing shapes. Nothing here may carry correct answers, transcripts, or rubrics during a test. */
import type { DailyLifeTask, DiscussionTask, EmailTask, Option, SectionId, SpeakingMeta } from "../bank/types";
import type { Correctness } from "../evaluation/objective";
import type { EvaluationRecord, SectionStatus, SessionConfig } from "./types";

export interface ClientMcq {
  id: string;
  stem: string;
  highlightText: string | null;
  options: Option[];
}

export type ClientTask =
  | { kind: "complete_the_words"; id: string; segments: string[]; blanks: { id: string; prefix: string; letters: number }[] }
  | (Omit<DailyLifeTask, "questions"> & { questions: ClientMcq[] })
  | { kind: "academic_passage"; id: string; title: string; paragraphs: string[]; questions: ClientMcq[] }
  | { kind: "choose_response"; id: string; audio: string; image: string | null; questions: ClientMcq[] }
  | {
      kind: "conversation" | "announcement" | "academic_talk";
      id: string;
      title: string;
      audio: string;
      image: string | null;
      questions: ClientMcq[];
    }
  | {
      kind: "build_a_sentence";
      id: string;
      context: string;
      speakerName: string;
      speakerImage: string | null;
      speakerLine: string;
      respondentName: string;
      respondentImage: string | null;
      answerPrefix: string;
      answerSuffix: string;
      numBlanks: number;
      chunks: string[];
    }
  | Omit<EmailTask, "rubric">
  | Omit<DiscussionTask, "rubric">
  | { kind: "listen_and_repeat"; id: string; audio: string; responseSeconds: number; partIndex: number }
  | {
      kind: "interview";
      id: string;
      video: string;
      prompt: string | null;
      prepSeconds: number;
      responseSeconds: number;
    };

export type ClientAnswer =
  | { kind: "mcq"; optionId: string }
  | { kind: "text"; value: string }
  | { kind: "order"; chunks: string[] }
  | { kind: "essay"; text: string }
  | { kind: "recording"; durationMs: number };

export interface ItemFeedback {
  correctness: Correctness;
  correctOptionId: string | null;
  yourAnswer: string | null;
  correctAnswer: string | null;
  explanation: string | null;
}

export interface BlockView {
  start: number;
  end: number;
  seconds: number | null;
  label: string;
}

export interface SectionIntro {
  title: string;
  minutes: number;
  itemCount: number;
  taskTypes: string[];
  adaptive: boolean;
}

export interface CurrentView {
  section: SectionId;
  status: SectionStatus;
  intro: SectionIntro;
  sectionDeadline: number | null;
  module: {
    id: string;
    stage: 1 | 2;
    stageCount: 1 | 2;
    introAudio: string | null;
    tasks: ClientTask[];
  } | null;
  blocks: BlockView[];
  blockIndex: number;
  blockStarted: boolean;
  blockDeadline: number | null;
  /** Timed Listening: the question on screen and its own clock (paused once checked in practice). */
  question: { itemId: string; deadline: number; paused?: boolean } | null;
  taskIndex: number;
  lockedTasks: string[];
  lockedItems: string[];
  /** 1-based number of the first scored item of each task within the section. */
  itemNumbers: number[];
  sectionItemTotal: number;
  speaking: SpeakingMeta | null;
  answers: Record<string, ClientAnswer>;
  feedback: Record<string, ItemFeedback>;
  evaluations: Record<string, EvaluationRecord>;
  notes: string;
}

export interface SessionView {
  id: string;
  testNumber: number;
  status: "active" | "completed";
  config: SessionConfig;
  serverNow: number;
  sections: { id: SectionId; status: SectionStatus }[];
  current: CurrentView | null;
}
