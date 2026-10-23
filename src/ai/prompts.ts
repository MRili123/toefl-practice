import type { DiscussionTask, EmailTask, InterviewTask, Rubric } from "@/engine/bank/types";
import type { SpeakingMeta } from "@/engine/bank/types";
import type { DeliveryMetrics } from "./feedbackTypes";

const rubricText = (r: Rubric) =>
  Object.entries(r)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

/** ETS scoring guides (Updated TOEFL iBT Test Overview, 2026), condensed. */
const ETS_EMAIL_GUIDE: Rubric = {
  5: "Fully successful: effective, clearly expressed, consistent facility. Elaboration effectively supports the communicative purpose; effective syntactic variety and precise, idiomatic word choice; consistent appropriate social conventions (politeness, register, organization, requests); almost no lexical or grammatical errors beyond common typos.",
  4: "Generally successful: mostly effective and easily understood; adequate elaboration; syntactic variety and appropriate word choice; mostly appropriate social conventions; few lexical or grammatical errors.",
  3: "Partially successful: generally accomplishes the task, but language limitations may make parts unclear; elaboration partially supports the purpose; moderate range of syntax and vocabulary; some noticeable errors in structure, word forms, idiomatic language and/or social conventions.",
  2: "Mostly unsuccessful: attempts the task but mostly ineffective; limited or irrelevant elaboration; limited range of syntax and vocabulary; accumulation of errors.",
  1: "Unsuccessful: ineffective attempt; very little elaboration; telegraphic language; serious and frequent errors; mostly language borrowed from the prompt.",
  0: "Blank, rejects the topic, not in English, copied from the prompt, unconnected to the prompt, or arbitrary keystrokes.",
};

const ETS_DISCUSSION_GUIDE: Rubric = {
  5: "Fully successful: relevant, very clearly expressed contribution with consistent facility; relevant and well-elaborated explanations, examples and/or details; effective variety of syntactic structures and precise, idiomatic word choice; almost no lexical or grammatical errors beyond common typos.",
  4: "Generally successful: relevant contribution whose ideas are easily understood; adequately elaborated explanations/examples/details; variety of syntactic structures and appropriate word choice; few lexical or grammatical errors.",
  3: "Partially successful: mostly relevant and understandable; part of an explanation, example or detail may be missing, unclear or irrelevant; some syntactic variety and range of vocabulary; some noticeable lexical and grammatical errors.",
  2: "Mostly unsuccessful: attempts to contribute but ideas are hard to follow; poorly elaborated or partially relevant ideas; limited range of structures and vocabulary; accumulation of errors.",
  1: "Unsuccessful: words and phrases that attempt the task with few or no coherent ideas; severely limited range; serious and frequent errors; mostly language borrowed from the prompt.",
  0: "Blank, rejects the topic, not in English, copied from the prompt, unconnected to the prompt, or arbitrary keystrokes.",
};

const ETS_INTERVIEW_GUIDE: Rubric = {
  5: "Fully successful: fully addresses the question, clear and fluent; on topic and well elaborated; good conversational pace with natural pauses; easily intelligible, rhythm and intonation convey meaning; range of accurate grammar and vocabulary expresses precise meanings.",
  4: "Generally successful: addresses the question and is reasonably clear; on topic and elaborated but may lack effective connectors; good pace with some pausing; intelligible with occasional minor effort; grammar and vocabulary adequate for general meanings.",
  3: "Partially successful: addresses the question with limited elaboration and/or clarity; frequent or lengthy pauses, choppy pace, frequent fillers; intelligibility sometimes affected; limited range and accuracy of grammar and vocabulary.",
  2: "Mostly unsuccessful: minimally connected to the question, little or no relevant elaboration or mainly language from the question; intelligibility limited; very limited grammar and vocabulary.",
  1: "Unsuccessful: only vaguely connected to the question; mostly unintelligible; mainly isolated words or phrases.",
  0: "No response, entirely unintelligible, no English, entirely unconnected to the prompt, or only phrases such as \"I don't know\".",
};

const SHARED_RULES = `Rules:
- Give an ESTIMATED practice score on the task's 0–5 rubric, in 0.5 steps. You are not ETS; never call the score official.
- Each correction fixes ONE error. Its "original" is a short span (at most 10 words) copied VERBATIM from the learner's text; "suggestion" is that span corrected. Two errors in one sentence are two corrections. Only real errors.
- List EVERY grammar error (verb tense and form, agreement, articles, prepositions, plurals, word order, missing words), not just a sample, plus important vocabulary/punctuation/register problems. At most 25 corrections.
- Never rewrite the whole response.
- Strengths and issues: 2–4 each, specific to this response.
- Criterion scores 0–5, each with one concise sentence.
- If the response is empty, off-topic, or copied from the prompt, the score is 0.`;

export const WRITING_SYSTEM = `You are an experienced rater for the TOEFL iBT Writing section (2026 format: Build a Sentence, Write an Email, Write for an Academic Discussion).
Evaluate the learner's response strictly against the task and rubric provided, the way a trained TOEFL rater would — not as a generic grammar checker.
${SHARED_RULES}
- A dictionary spell checker also runs on the text; still report misspelled words you notice, with type "spelling".
- howToImprove: 2–4 concrete actions for the next attempt.`;

export function emailPrompt(task: EmailTask, text: string, wordCount: number): string {
  return `TASK: Write an Email (7 minutes). The test taker was told: "Write as much as you can and in complete sentences." (No fixed word count.)
Situation: ${task.situation}
${task.taskInstructions}
${task.requiredPoints.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}
Recipient: ${task.recipient} | Subject: ${task.subject}

Key criteria: all three points addressed, clear purpose, appropriate greeting/closing and polite register, organization, grammar, vocabulary, sentence variety.

ETS SCORING GUIDE (0–5):
${rubricText(ETS_EMAIL_GUIDE)}

LEARNER'S EMAIL (${wordCount} words):
"""
${text}
"""`;
}

export function discussionPrompt(task: DiscussionTask, text: string, wordCount: number): string {
  return `TASK: Write for an Academic Discussion (10 minutes). Minimum ${task.targetWords.min} words.
${task.topicIntro}

Professor ${task.professor.name}: ${task.professor.text}
${task.students.map((s) => `Student ${s.name}: ${s.text}`).join("\n")}

Key criteria: a clear opinion that answers the professor's question, relevant reasons and specific examples, a contribution beyond repeating the other students, coherence, grammar, vocabulary, sentence variety.

ETS SCORING GUIDE (0–5):
${rubricText(ETS_DISCUSSION_GUIDE)}

LEARNER'S POST (${wordCount} words):
"""
${text}
"""`;
}

export const INTERVIEW_SYSTEM = `You are an experienced rater for the TOEFL iBT Speaking section (2026 format), task "Take an Interview": the test taker answers an interviewer's question in about 45 seconds with no preparation.
You receive an automatic speech-to-text TRANSCRIPT, not audio. It may contain recognition errors: do not penalize spelling or punctuation, and be cautious about errors that could be transcription artifacts.
Delivery can only be judged from the measured indicators provided (speech rate, pauses, recognition confidence). Say so; do not claim to hear pronunciation, accent, or intonation.
Rate relevance, development (reasons, details, examples), language use, grammar and vocabulary against the rubric.
${SHARED_RULES}
- improvement: 2–4 concrete actions for the next attempt.`;

export function interviewPrompt(task: InterviewTask, meta: SpeakingMeta, transcript: string, d: DeliveryMetrics): string {
  return `INTERVIEW: ${meta.interview.scenario}
Topic: ${meta.interview.topic}
Question (${task.questionType.replace(/_/g, " ")}): ${task.prompt}
Response time: ${task.responseSeconds} seconds.

ETS SCORING GUIDE (0–5):
${rubricText(ETS_INTERVIEW_GUIDE)}

MEASURED DELIVERY INDICATORS:
- Speaking time: ${d.speechSeconds}s of ${task.responseSeconds}s, ${d.wordCount} words, ${d.wordsPerMinute} words/minute (fluent speech is roughly 110–160)
- Pauses longer than 0.8s: ${d.longPauses} (longest ${d.longestPauseSeconds}s)
- Mean recognition confidence: ${d.meanConfidence} (low values can indicate unclear articulation)
- Low-confidence words: ${d.lowConfidenceWords.join(", ") || "none"}

TRANSCRIPT:
"""
${transcript}
"""`;
}
