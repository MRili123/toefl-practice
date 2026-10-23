import { z } from "zod";
import { GRAMMAR_CATEGORIES } from "@/engine/exercises/types";

const category = z.enum([...GRAMMAR_CATEGORIES, "other"]);
const rating = z.enum(["Strong", "Good", "Fair", "Needs work"]);
const fix = z.object({ original: z.string(), correction: z.string(), reason: z.string() });

/** Writing exercise evaluation, exactly as the model must return it (validated before use; rendered as text only). */
export const writingExerciseSchema = z.object({
  estimated_score: z.number().min(1).max(6),
  summary: z.string(),
  grammar_errors: z.array(fix.extend({ category })),
  spelling_errors: z.array(fix),
  vocabulary_feedback: z.object({ rating, comment: z.string(), issues: z.array(fix) }),
  organization_feedback: z.object({ rating, comment: z.string() }),
  task_fulfillment: z.object({ rating, comment: z.string() }),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  tips: z.array(z.string()),
  corrected_version: z.string(),
  recommended_words: z.array(z.string()),
  grammar_weaknesses: z.array(category),
});
export type WritingExerciseLlm = z.infer<typeof writingExerciseSchema>;

export const speakingExerciseSchema = z.object({
  estimated_score: z.number().min(1).max(6),
  summary: z.string(),
  strengths: z.array(z.string()),
  errors: z.array(fix.extend({ category })),
  suggestions: z.array(z.string()),
  delivery_observations: z.array(z.string()),
  grammar_weaknesses: z.array(category),
});
export type SpeakingExerciseLlm = z.infer<typeof speakingExerciseSchema>;

export const grammarQuestionSchema = z.object({
  stem: z.string(),
  options: z.array(z.string()).length(4),
  answer_index: z.number().int().min(0).max(3),
  explanation: z.string(),
});
export type GrammarQuestionLlm = z.infer<typeof grammarQuestionSchema>;

export const grammaticalSchema = z.object({ grammatical: z.boolean() });

export const explanationSchema = z.object({ explanation: z.string() });

export const answerKeySchema = z.object({ answer_index: z.number().int().min(0).max(3), explanation: z.string() });

/** The AI's check of one learner mistake: what kind of error it is and the CEFR level of what must be learned. */
export const mistakeVerdictSchema = z.object({
  type: z.enum(["spelling", "grammar"]),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  category: z.enum([...GRAMMAR_CATEGORIES, "none"]),
});
