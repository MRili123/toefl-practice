/** Shapes stored in EvaluationRecord.feedback and rendered by the results UI. */

export interface Correction {
  original: string;
  suggestion: string;
  explanation: string;
  type: string;
  /** Character offsets of `original` in the learner's text (absent on older evaluations). */
  start?: number;
  end?: number;
  source?: "spellcheck" | "model";
  /** Grammar category (exercises' mistake memory). */
  category?: string;
}

export interface Criterion {
  key: string;
  label: string;
  score: number;
  comment: string;
}

/** Measured from Whisper word timestamps/confidences — indirect delivery indicators, not a pronunciation score. */
export interface DeliveryMetrics {
  speechSeconds: number;
  wordCount: number;
  wordsPerMinute: number;
  longPauses: number;
  longestPauseSeconds: number;
  meanConfidence: number;
  lowConfidenceWords: string[];
}

export interface WritingFeedback {
  kind: "writing";
  summary: string;
  wordCount: number;
  criteria: Criterion[];
  strengths: string[];
  issues: string[];
  corrections: Correction[];
  howToImprove: string[];
}

export interface InterviewFeedback {
  kind: "interview";
  summary: string;
  criteria: Criterion[];
  strengths: string[];
  issues: string[];
  corrections: Correction[];
  improvement: string[];
  delivery: DeliveryMetrics;
}

export type AlignOp = { op: "match" | "sub"; target: string; spoken: string } | { op: "del"; target: string } | { op: "ins"; spoken: string };

export interface RepeatFeedback {
  kind: "repeat";
  target: string;
  alignment: AlignOp[];
  accuracy: number;
  errors: number;
  notes: string[];
  delivery: DeliveryMetrics;
}

export type Feedback = WritingFeedback | InterviewFeedback | RepeatFeedback;
