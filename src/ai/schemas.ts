import { z } from "zod";

const criterion = z.object({
  score: z.number().min(0).max(5),
  comment: z.string(),
});

const correction = z.object({
  original: z.string(),
  suggestion: z.string(),
  explanation: z.string(),
  type: z.enum(["grammar", "vocabulary", "spelling", "punctuation", "word order", "register", "clarity"]),
});

export const writingLlmSchema = z.object({
  score: z.number().min(0).max(5),
  summary: z.string(),
  criteria: z.object({
    taskFulfillment: criterion,
    organization: criterion,
    development: criterion,
    coherence: criterion,
    languageUse: criterion,
    grammar: criterion,
    vocabulary: criterion,
    sentenceStructure: criterion,
  }),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  corrections: z.array(correction),
  howToImprove: z.array(z.string()),
});

export const interviewLlmSchema = z.object({
  score: z.number().min(0).max(5),
  summary: z.string(),
  criteria: z.object({
    relevance: criterion,
    development: criterion,
    languageUse: criterion,
    grammar: criterion,
    vocabulary: criterion,
    delivery: criterion,
  }),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  corrections: z.array(correction),
  improvement: z.array(z.string()),
});

export const CRITERION_LABELS: Record<string, string> = {
  taskFulfillment: "Task fulfillment",
  organization: "Organization",
  development: "Development",
  coherence: "Coherence",
  languageUse: "Language use",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  sentenceStructure: "Sentence structure",
  relevance: "Relevance to the question",
  delivery: "Delivery (indirect indicators)",
};
