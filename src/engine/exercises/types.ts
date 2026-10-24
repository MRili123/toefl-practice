/** Exercise system types. Client-safe: no Node imports. */

import type { Transcription } from "../session/types";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

/** CEFR ↔ 2026 TOEFL band alignment used for level targets (A1 = 1 … C2 = 6). */
export const CEFR_BAND: Record<Cefr, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

export const shiftLevel = (level: Cefr, by: number): Cefr =>
  CEFR_LEVELS[Math.max(0, Math.min(CEFR_LEVELS.length - 1, CEFR_LEVELS.indexOf(level) + by))];

export type ExerciseKind = "reading" | "spelling" | "grammar" | "writing" | "speaking-interaction" | "speaking-repeat";
/** The exercise areas shown in the hub and the profile. */
export type ExerciseArea = "reading" | "spelling" | "grammar" | "writing" | "speaking";
export const EXERCISE_AREAS: ExerciseArea[] = ["reading", "spelling", "grammar", "writing", "speaking"];
export const areaOf = (k: ExerciseKind): ExerciseArea => (k.startsWith("speaking") ? "speaking" : (k as ExerciseArea));

export const KIND_LABEL: Record<ExerciseKind, string> = {
  reading: "Reading · Complete the Words",
  spelling: "Spelling",
  grammar: "Grammar",
  writing: "Writing",
  "speaking-interaction": "Speaking · Interaction",
  "speaking-repeat": "Speaking · Listen & Repeat",
};

export const GRAMMAR_CATEGORIES = [
  "subject-verb-agreement",
  "verb-tenses",
  "articles",
  "prepositions",
  "pronouns",
  "modal-verbs",
  "conditionals",
  "passive-voice",
  "relative-clauses",
  "conjunctions",
  "sentence-structure",
  "word-order",
  "gerunds",
  "infinitives",
  "countable-uncountable",
  "comparatives",
  "complex-sentences",
  "academic-grammar",
  "parallel-structure",
  "advanced-clauses",
  "word-forms",
] as const;
export type GrammarCategory = (typeof GRAMMAR_CATEGORIES)[number];

export const GRAMMAR_CATEGORY_LABEL: Record<GrammarCategory, string> = {
  "subject-verb-agreement": "Subject–verb agreement",
  "verb-tenses": "Verb tenses",
  articles: "Articles",
  prepositions: "Prepositions",
  pronouns: "Pronouns",
  "modal-verbs": "Modal verbs",
  conditionals: "Conditionals",
  "passive-voice": "Passive voice",
  "relative-clauses": "Relative clauses",
  conjunctions: "Conjunctions",
  "sentence-structure": "Sentence structure",
  "word-order": "Word order",
  gerunds: "Gerunds",
  infinitives: "Infinitives",
  "countable-uncountable": "Countable & uncountable nouns",
  comparatives: "Comparatives",
  "complex-sentences": "Complex sentences",
  "academic-grammar": "Academic grammar",
  "parallel-structure": "Parallel structure",
  "advanced-clauses": "Advanced clause structures",
  "word-forms": "Word forms (noun, adjective, adverb)",
};

export const SPEAKING_TOPICS = [
  "nature", "environment", "education", "technology", "university-life", "science", "health", "society",
  "culture", "transportation", "work", "innovation", "cities", "media", "communication",
] as const;
export type SpeakingTopic = (typeof SPEAKING_TOPICS)[number];
export const TOPIC_LABEL: Record<SpeakingTopic, string> = {
  nature: "Nature",
  environment: "Environment",
  education: "Education",
  technology: "Technology",
  "university-life": "University Life",
  science: "Science",
  health: "Health",
  society: "Society",
  culture: "Culture",
  transportation: "Transportation",
  work: "Work",
  innovation: "Innovation",
  cities: "Cities",
  media: "Media",
  communication: "Communication",
};

/* ---------- content items ---------- */

export type ItemSource = "bank" | "writing" | "speaking" | "reading" | "generated";

export interface SpellingItem {
  id: string;
  level: Cefr;
  type: "word" | "sentence";
  text: string;
  source: ItemSource;
}

export interface GrammarQuestion {
  id: string;
  level: Cefr;
  stem: string;
  options: string[];
  answer: number;
  explanation: string;
  category: GrammarCategory;
  difficulty: number;
  tags: string[];
  source: ItemSource;
}

/** A "Complete the Words" paragraph: first sentence intact, then 10 words with their second half missing. */
export interface ReadingPassage {
  id: string;
  level: Cefr;
  title: string;
  /** Text around the blanks: segments.length === blanks.length + 1. */
  segments: string[];
  blanks: { id: string; prefix: string; answer: string; fullWord: string }[];
}

/** Per-passage time options (seconds) for Reading practice. */
export const READING_TIME_OPTIONS = [60, 90, 120, 180, 300] as const;

export interface SpeakingQuestion {
  id: string;
  level: Cefr;
  topic: SpeakingTopic;
  text: string;
}

export interface RepeatSentence {
  id: string;
  level: Cefr;
  text: string;
}

export type WritingType = "email" | "discussion" | "essay";
export const WRITING_TYPE_LABEL: Record<WritingType, string> = {
  email: "Write an Email",
  discussion: "Write for an Academic Discussion",
  essay: "General Writing",
};
/**
 * Minimum words to aim for in Writing practice, by task and level. ETS states a minimum only for the Academic
 * Discussion (at least 100 words), kept from B1 up; the other targets are practice guidance for each level.
 */
export const WRITING_MIN_WORDS: Record<WritingType, Record<Cefr, number>> = {
  email: { A1: 30, A2: 50, B1: 80, B2: 100, C1: 120, C2: 150 },
  discussion: { A1: 40, A2: 60, B1: 100, B2: 100, C1: 120, C2: 150 },
  essay: { A1: 40, A2: 60, B1: 120, B2: 180, C1: 250, C2: 300 },
};

/** Official 2026 task times for TOEFL-style timing; essays are custom practice. */
export const TOEFL_WRITING_SECONDS: Partial<Record<WritingType, number>> = { email: 7 * 60, discussion: 10 * 60 };

export interface EmailPrompt {
  id: string;
  level: Cefr;
  type: "email";
  situation: string;
  to: string;
  tasks: string[];
}
export interface DiscussionPrompt {
  id: string;
  level: Cefr;
  type: "discussion";
  professor: { name: string; text: string };
  students: { name: string; text: string }[];
}
export interface EssayPrompt {
  id: string;
  level: Cefr;
  type: "essay";
  prompt: string;
}
export type WritingPrompt = EmailPrompt | DiscussionPrompt | EssayPrompt;

/* ---------- mastery ---------- */

export type MasteryStatus = "new" | "learning" | "weak" | "improving" | "strong" | "mastered";
export const MASTERY_LABEL: Record<MasteryStatus, string> = {
  new: "New",
  learning: "Learning",
  weak: "Weak",
  improving: "Improving",
  strong: "Strong",
  mastered: "Mastered",
};

/** Item kinds that are right/wrong and therefore tracked item by item. */
export type TrackedKind = "reading" | "spelling" | "grammar" | "speaking-repeat";

export interface MasteryRecord {
  /** `${kind}:${itemId}` */
  key: string;
  kind: TrackedKind;
  itemId: string;
  level: Cefr;
  /** What the learner practised (word, sentence or question stem). */
  text: string;
  correctAnswer: string;
  lastUserAnswer: string | null;
  errorType: string | null;
  category: string | null;
  source: ItemSource;
  attempts: number;
  correct: number;
  incorrect: number;
  /** Consecutive correct answers. */
  streak: number;
  everWrong: boolean;
  status: MasteryStatus;
  firstSeenAt: number;
  lastAttemptAt: number;
  nextReviewAt: number;
}

/** Recurring error categories found in writing/speaking (and grammar mistakes), used to generate practice. */
export interface WeaknessRecord {
  key: string;
  area: "grammar" | "spelling" | "vocabulary" | "sentence-structure";
  category: string;
  count: number;
  examples: { original: string; correction: string; at: number }[];
  lastAt: number;
  /** Count at the time the last practice question was generated for it. */
  generatedAtCount: number;
}

/* ---------- mistakes (admin "Non-mastered") ---------- */

/** Where a spelling or grammar mistake was made. */
export type MistakeSource = "series-reading" | "series-writing" | "spelling-exercise" | "reading-exercise" | "writing-exercise";
export const MISTAKE_SOURCE_LABEL: Record<MistakeSource, string> = {
  "series-reading": "Series · Reading",
  "series-writing": "Series · Writing",
  "spelling-exercise": "Spelling practice",
  "reading-exercise": "Reading practice",
  "writing-exercise": "Writing practice",
};

/** What the app did with one mistake (stored in the mistake memory, keyed by the mistake's id). */
export interface MistakeLink {
  /**
   * The AI's check: spelling or grammar, and the CEFR level of the word (spelling) or of the rule (grammar).
   * Spelling practice mistakes are spelling by nature and are not checked.
   */
  verdict?: { type: "spelling" | "grammar"; level: Cefr; category: string | null };
  check?: { stage: "queued" | "running" | "error"; error: string | null };
  /** Spelling practice item the word was added to (null: nothing that can be practised as a word). */
  spellingItemId?: string | null;
  /** Grammar question generated for this mistake (in generated.grammar). */
  questionId?: string;
  category?: string;
  generation?: { stage: "queued" | "running" | "error"; error: string | null };
  at: number;
}

/* ---------- sessions ---------- */

export interface ExerciseConfig {
  kind: ExerciseKind;
  level: Cefr;
  count: number;
  spellingType?: "word" | "sentence" | "mixed";
  /** Spelling: your non-mastered mistakes open each level ("first") or are mixed in at random ("mixed", the default). */
  mistakeOrder?: "first" | "mixed";
  topic?: SpeakingTopic;
  progressive?: boolean;
  writingType?: WritingType;
  /** Seconds (writing: per response; reading: per passage); null = untimed. */
  timeLimit?: number | null;
  /** Grammar: practise one weak category (opened from Weak Areas). */
  focus?: GrammarCategory;
}

/** "review": the recording was transcribed and waits for the learner to check (and correct) the transcript. */
export type AiStage = "queued" | "transcribing" | "review" | "evaluating" | "done" | "error";

export interface SpellingFeedback {
  kind: "spelling";
  expected: string;
  given: string;
  /** Character/word diff segments of the learner's answer against the expected text. */
  diff: { text: string; op: "same" | "add" | "del" }[];
  explanation: string | null;
  wrongWords: { given: string; expected: string }[];
}

export interface ReadingFeedback {
  kind: "reading";
  blanks: { id: string; prefix: string; answer: string; fullWord: string; given: string; correct: boolean }[];
  correct: number;
  total: number;
  /** The passage was submitted automatically when its time ran out. */
  timedOut: boolean;
}

export interface GrammarFeedback {
  kind: "grammar";
  answer: number;
  chosen: number;
  explanation: string;
  category: GrammarCategory;
}

export interface ExerciseCorrection {
  original: string;
  correction: string;
  reason: string;
  type: "grammar" | "spelling" | "vocabulary" | "punctuation" | "capitalization" | "sentence-structure";
  category: string | null;
  start: number | null;
  end: number | null;
}

export type Rating = "Strong" | "Good" | "Fair" | "Needs work";

export interface WritingExerciseFeedback {
  kind: "writing";
  score: number;
  summary: string;
  wordCount: number;
  grammarCount: number;
  spellingCount: number;
  vocabulary: { rating: Rating; comment: string };
  organization: { rating: Rating; comment: string };
  task: { rating: Rating; comment: string };
  strengths: string[];
  improve: string[];
  tips: string[];
  corrections: ExerciseCorrection[];
  improvedVersion: string;
  recommendedWords: string[];
}

export interface SpeakingExerciseFeedback {
  kind: "speaking";
  score: number;
  summary: string;
  strengths: string[];
  errors: ExerciseCorrection[];
  suggestions: string[];
  delivery: string[];
  transcript: string;
}

export interface RepeatExerciseFeedback {
  kind: "repeat";
  target: string;
  transcript: string;
  accuracy: number;
  matched: string[];
  missing: string[];
  added: string[];
  changed: { said: string; expected: string }[];
  notes: string[];
}

export type AttemptFeedback = ReadingFeedback | SpellingFeedback | GrammarFeedback | WritingExerciseFeedback | SpeakingExerciseFeedback | RepeatExerciseFeedback;

export interface ExerciseAttempt {
  itemId: string;
  level: Cefr;
  /** Text answer, chosen option index, essay text, or recording file name. */
  answer: string | null;
  /** null while an AI evaluation is pending (and always for writing). */
  correct: boolean | null;
  heartLost: boolean;
  feedback: AttemptFeedback | null;
  ai: { stage: AiStage; error: string | null } | null;
  /** Email subject line (writing). */
  subject?: string;
  durationMs?: number;
  /** Speaking: what the speech-to-text service heard. */
  stt?: Transcription | null;
  /** Speaking: the transcript the learner validated (the evaluation uses this text). */
  transcript?: string | null;
  /** Speaking: the learner corrected the transcript before validating it. */
  transcriptEdited?: boolean;
  /** True once hearts/progress were applied (exactly once, even if an evaluation is retried). */
  settled?: boolean;
  /** Writing: the CEFR level of the AI's improved version, and that text rewritten at other levels (on request). */
  levels?: WritingLevels;
  at: number;
}

/** One change made to reach another level: the words before and after, and why it reads at that level. */
export interface LevelChange {
  before: string;
  after: string;
  why: string;
}

export interface WritingLevels {
  /** The level of the improved version (null until the AI has rated it). */
  estimated: Cefr | null;
  reason: string | null;
  /** The improved version rewritten at a level, with the main changes. */
  versions: Partial<Record<Cefr, { text: string; changes: LevelChange[] }>>;
}

export type ExerciseStatus = "active" | "completed" | "failed" | "abandoned";

export interface ExerciseSession {
  id: string;
  kind: ExerciseKind;
  config: ExerciseConfig;
  /** Planned items (writing appends one prompt at a time). */
  items: { itemId: string; level: Cefr }[];
  index: number;
  /** null = no hearts (writing). */
  hearts: number | null;
  attempts: ExerciseAttempt[];
  status: ExerciseStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export const MAX_HEARTS = 5;
