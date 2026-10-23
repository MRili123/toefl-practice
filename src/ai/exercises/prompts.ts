import {
  type Cefr, GRAMMAR_CATEGORIES, GRAMMAR_CATEGORY_LABEL, type GrammarCategory, type WritingPrompt,
} from "@/engine/exercises/types";

const CATEGORY_LIST = GRAMMAR_CATEGORIES.map((c) => `${c} (${GRAMMAR_CATEGORY_LABEL[c]})`).join(", ");

const SCALE = `ESTIMATED PRACTICE SCORE (1–6, in 0.5 steps), aligned with CEFR:
  6 ≈ C2: precise, natural, sophisticated; virtually error-free.
  5 ≈ C1: clear, well developed, varied structures; occasional minor slips.
  4 ≈ B2: clear and relevant with adequate development; some errors that rarely block meaning.
  3 ≈ B1: understandable, simple structures; noticeable errors; limited development.
  2 ≈ A2: short, basic sentences; frequent errors; meaning sometimes unclear.
  1 ≈ A1: isolated words and memorized phrases; or empty, off-topic, not English, or copied from the prompt.
This is an estimate for practice, never an official TOEFL/ETS score.`;

export const WRITING_EXERCISE_SYSTEM = `You are an expert English writing teacher preparing a learner for the TOEFL iBT (2026 format).
Evaluate ONLY the learner's submitted text against the prompt. Be accurate and fair.
Rules:
- Never invent errors. Every error you report must exist VERBATIM in the learner's text: "original" is a short span (max 10 words) copied exactly, "correction" is that span fixed, "reason" is one short sentence a learner understands.
- One error per entry. Report EVERY real grammar error (agreement, tense, articles, prepositions, plurals, word form, word order, missing words, fragments, run-ons) with the best matching category from: ${CATEGORY_LIST}; use "other" only if none fits.
- spelling_errors: every misspelled word (original = the misspelled word, correction = the correct word).
- vocabulary_feedback.issues: wrong word choice, collocation or register problems (not spelling).
- Ratings: "Strong", "Good", "Fair" or "Needs work".
- strengths, weaknesses, tips: 2–4 each, specific to THIS text.
- corrected_version: the learner's text with all errors fixed and phrasing polished, keeping their ideas, structure and length. Plain text, no markup.
- recommended_words: 3–6 useful words or phrases for this topic at the learner's level or one step above.
- grammar_weaknesses: the categories of grammar errors that occur in this text (may be empty).
- Plain text only in every field; no HTML or Markdown.
${SCALE}`;

function describePrompt(p: WritingPrompt): string {
  if (p.type === "email") {
    return `TASK TYPE: Write an Email (TOEFL-style).
Situation: ${p.situation}
Write to: ${p.to}
In the email, do the following:
${p.tasks.map((t) => `  - ${t}`).join("\n")}
Criteria: all points addressed, clear purpose, appropriate greeting/closing and polite register, organization, language accuracy and range.`;
  }
  if (p.type === "discussion") {
    return `TASK TYPE: Write for an Academic Discussion (TOEFL-style).
Professor ${p.professor.name}: ${p.professor.text}
${p.students.map((s) => `${s.name}: ${s.text}`).join("\n")}
Criteria: clear opinion answering the professor, relevant reasons and specific examples, a contribution beyond repeating the students, coherence, language accuracy and range.`;
  }
  return `TASK TYPE: General writing practice (custom, not an official TOEFL task).
Prompt: ${p.prompt}
Criteria: clear position or main idea, relevant development with examples, organization, language accuracy and range.`;
}

export function writingExercisePrompt(p: WritingPrompt, level: Cefr, text: string, words: number, subject?: string): string {
  return `${describePrompt(p)}
The learner chose level ${level}; judge the text on the 1–6 scale as it is, not relative to the chosen level.

LEARNER'S TEXT (${words} words)${subject ? `\nSubject line: ${subject}` : ""}:
"""
${text}
"""`;
}

export const SPEAKING_EXERCISE_SYSTEM = `You are an expert English speaking coach preparing a learner for the TOEFL iBT (2026 format).
You receive an automatic speech-to-text TRANSCRIPT of the learner's spoken answer, not audio. It may contain recognition errors: do not penalize spelling or punctuation, and do not report errors that could be transcription artifacts.
Evaluate relevance, development (reasons, examples), coherence, grammar, vocabulary, sentence structure and repetition.
Delivery (fluency, pronunciation) can only be judged from the measured indicators provided; base delivery_observations on those numbers only and never claim to hear accent or intonation.
Rules:
- Never invent errors. "original" must be copied VERBATIM from the transcript (max 10 words); "correction" fixes it; "reason" is one short sentence. Category from: ${CATEGORY_LIST}, or "other".
- strengths and suggestions: 2–4 each, specific to THIS answer.
- grammar_weaknesses: categories of grammar errors that occur (may be empty).
- Plain text only.
${SCALE}`;

export function speakingExercisePrompt(question: string, level: Cefr, transcript: string, indicators: string[]): string {
  return `QUESTION (level ${level}): ${question}
The learner had 15 seconds to prepare and 45 seconds to answer. Judge on the 1–6 scale as it is.

MEASURED DELIVERY INDICATORS:
${indicators.map((i) => `- ${i}`).join("\n")}

TRANSCRIPT:
"""
${transcript}
"""`;
}

const LEVEL_GUIDE: Record<Cefr, string> = {
  A1: "very short sentences, everyday words, present simple/continuous",
  A2: "simple sentences about familiar topics, past simple, basic comparatives",
  B1: "everyday and study situations, present perfect, first/second conditionals, common phrasal verbs",
  B2: "academic and campus contexts, passive, relative clauses, reported speech, mixed tenses",
  C1: "academic prose, complex clauses, inversion, nuanced modals, advanced linking",
  C2: "sophisticated academic prose, subtle distinctions, advanced clause structures",
};

export const GRAMMAR_GENERATOR_SYSTEM = `You write high-quality multiple-choice grammar questions for adult learners preparing for the TOEFL iBT.
Requirements:
- Exactly ONE blank written as "_____" in the stem. The stem is one natural sentence in an academic, campus or everyday-study context; no specialist knowledge needed.
- The blank must test ONLY the target skill. Do not introduce other grammar challenges (for example, do not write a conditional sentence unless conditionals are the target skill).
- Exactly four options. Exactly ONE is grammatically correct in standard English. The other three must each make the sentence clearly ungrammatical because they break the target rule — not merely awkward, informal or less likely.
- No two options may be identical; no option may be acceptable in informal usage if it is marked wrong.
- explanation: one or two short sentences explaining why the answer is correct.
- Plain text only.`;

/** Extra constraints for skills a small model tends to drift away from. */
const CATEGORY_RULE: Partial<Record<GrammarCategory, string>> = {
  "word-forms":
    "The four options must be four different forms of ONE word family (for example: success, succeed, successful, successfully). Exactly one form (noun, verb, adjective or adverb) fits the grammar of the sentence. Do not test comparatives or tenses.",
};

/** The exact words of one learner mistake: what they wrote and what was correct (e.g. swim → swam). */
export interface MistakeFocus {
  wrong: string;
  right: string;
}

export function grammarGeneratorPrompt(
  category: GrammarCategory,
  level: Cefr,
  topic: string,
  examples: string[],
  avoid: string[],
  focus?: MistakeFocus,
): string {
  const rule = focus
    ? `This question practises the learner's exact mistake: they wrote "${focus.wrong}" where "${focus.right}" was correct.
Write a NEW sentence (not the learner's) in which the blank can only be filled by "${focus.right}".
The four options must be "${focus.right}", "${focus.wrong}" and two other forms of the same word (other tenses, participles, -ing forms, singular/plural or word forms) that are each wrong in your sentence.`
    : CATEGORY_RULE[category];
  return `Target skill: ${GRAMMAR_CATEGORY_LABEL[category]}.${rule ? `
${rule}` : ""}
Level: ${level} — ${LEVEL_GUIDE[level]}.
Context topic: ${topic}.
${examples.length ? `The learner recently made these mistakes with this skill (test the same underlying rule in a NEW sentence; do not reuse these sentences):\n${examples.map((e) => `- ${e}`).join("\n")}` : ""}
${avoid.length ? `Do NOT write any of these existing questions or close paraphrases:\n${avoid.map((a) => `- ${a}`).join("\n")}` : ""}
Write one new question.`;
}

export const GRAMMATICAL_SYSTEM = `You are a strict English grammar examiner. Decide whether the given sentence is fully grammatical, natural standard English (formal or academic register is fine). Answer grammatical=false if it contains ANY grammatical error, unnatural collocation or wrong verb form, even a small one.`;

export const grammaticalPrompt = (sentence: string) => `Sentence: ${sentence}`;

export const MISTAKE_VERDICT_SYSTEM = `You check one mistake made by an English learner and decide what kind of error it is.
- type "spelling": the learner meant the right word but wrote its letters wrong (missing, extra, swapped or wrong letters, a word split or joined, a typo, text-speak like "u" for "you").
- type "grammar": the learner used a wrong form or structure: verb tense or form, agreement, articles, prepositions, plurals, pronouns, word form (e.g. adjective instead of noun), word order, a missing or extra word.
- level: for spelling, the CEFR level (A1-C2) of the CORRECT word itself (how common and difficult the word is); for grammar, the CEFR level at which the rule is normally taught.
- category: for grammar, the one skill whose rule was broken, from: ${CATEGORY_LIST}. For spelling, "none".`;

export const mistakeVerdictPrompt = (original: string, correction: string, context: string | null, note: string | null, fact: string | null = null) =>
  [
    `Learner wrote: ${original}`,
    `Correct form: ${correction}`,
    context ? `In the sentence: ${context}` : "",
    note ? `Teacher's note: ${note}` : "",
    fact ? `Fact: ${fact}` : "",
  ].filter(Boolean).join("\n");

export const ANSWER_KEY_SYSTEM = `You are an English grammar teacher checking a multiple-choice question. Exactly one option is correct in standard written English. Give its index (0-3) and explain in one or two short sentences why it is correct.`;

export const answerKeyPrompt = (stem: string, options: string[]) =>
  [`Question: ${stem}`, "Options:", ...options.map((o, i) => `${i}. ${o}`)].join("\n");

export const EXPLAIN_SYSTEM = `You are an English grammar teacher. The correct option is shown in [brackets] in the sentence. In one or two short, simple sentences, explain why it fits there and why the learner's wrong form does not. Say what kind of word is needed next to which word (for example: "a pronoun after the verb meet", "the past tense because of last week", "an adjective before the noun improvement"). Do not use terms such as direct object, indirect object or complement. Plain text only.`;

export const explainPrompt = (sentence: string, right: string, wrong: string) =>
  [`Sentence: ${sentence}`, `Correct option: ${right}`, `The learner's mistake: ${wrong}`].join("\n");
