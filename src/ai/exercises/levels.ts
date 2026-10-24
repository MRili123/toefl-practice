/**
 * CEFR levels of a written text: the level of the AI's improved version of the learner's writing, and that text
 * rewritten at another level with the main changes explained. Plain text only (never rendered as HTML).
 */
import { z } from "zod";
import { wordRank } from "@/engine/exercises/wordLevel";
import { CEFR_LEVELS, type Cefr, type LevelChange, type WritingType } from "@/engine/exercises/types";
import { ollamaJson } from "../ollama";

const cefr = z.enum(CEFR_LEVELS as unknown as [Cefr, ...Cefr[]]);

const levelSchema = z.object({ level: cefr, reason: z.string() });
const rewriteSchema = z.object({
  text: z.string(),
  changes: z.array(z.object({ before: z.string(), after: z.string(), why: z.string() })),
});

const DESCRIPTORS: Record<Cefr, string> = {
  A1: "very short, simple sentences; basic everyday words; mostly present tense; ideas joined with 'and' or 'but'",
  A2: "simple sentences joined with 'and', 'but', 'because'; everyday vocabulary; simple past and future",
  B1: "connected text with common linking words (however, so, for example); clear opinions with reasons; some complex sentences",
  B2: "clear, detailed text; varied linking words; relative clauses and conditionals; topic vocabulary; a confident, organized argument",
  C1: "well-structured text; wide, precise vocabulary and collocations; varied complex structures; nuanced, well-supported points",
  C2: "sophisticated, natural and precise style; idiomatic, subtle word choice; elegant cohesion; effortless complex structures",
};

/** What the text is: a written task, or the transcript of a spoken answer ("speaking"). */
export type LevelTextType = WritingType | "speaking";

const TYPE_LABEL: Record<LevelTextType, string> = {
  email: "an email",
  discussion: "a post for an academic discussion",
  essay: "an essay",
  speaking: "a spoken answer to an interview question (a transcript of speech)",
};

const SPOKEN_STYLE = `This is SPEECH, not writing: the new text must sound natural when said aloud, like a strong speaker answering an interviewer. Use spoken style (contractions like I'm and it's; spoken linking like Well, Actually, The thing is, For example; sentences of speakable length), with no headings, lists or written-only phrases. Do not add filler sounds (um, uh).`;

/** Measurable features that keep the model's judgement grounded (a 7B model over-rates simple texts). */
function features(text: string): string {
  const sentences = text.split(/[.!?]+(?:\s|$)/).map((s) => s.trim()).filter(Boolean);
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const ranks = words.map((w) => wordRank(w)).filter((r): r is number => r !== null);
  const lessCommon = ranks.length ? Math.round((ranks.filter((r) => r > 3000).length / ranks.length) * 100) : null;
  const avg = sentences.length ? Math.round((words.length / sentences.length) * 10) / 10 : 0;
  return [
    `Words: ${words.length}; sentences: ${sentences.length}; average sentence length: ${avg} words.`,
    lessCommon === null ? "" : `Less common words (outside the 3,000 most frequent): ${lessCommon}%.`,
  ].filter(Boolean).join("\n");
}

const LEVEL_SYSTEM = `You are an experienced CEFR examiner for English writing. You rate the level of a text from A1 to C2 by its language only (range and accuracy of grammar and vocabulary, sentence complexity, cohesion), not by its ideas.
Level descriptors:
${CEFR_LEVELS.map((l) => `${l}: ${DESCRIPTORS[l]}`).join("\n")}
Return JSON: {"level": one of A1..C2, "reason": one short sentence in simple English explaining the level}.`;

/** The CEFR level of a text (the AI's estimate). A spoken answer is judged as speech: no penalty for spoken style. */
export async function levelOfText(text: string, type?: LevelTextType): Promise<{ level: Cefr; reason: string }> {
  const kind = type === "speaking"
    ? "This is the transcript of a SPOKEN answer: judge it as speech (contractions and spoken linking are normal; punctuation comes from the transcription).\n\n"
    : "";
  const r = await ollamaJson(levelSchema, LEVEL_SYSTEM, `${kind}${features(text)}\n\nTEXT:\n"""\n${text}\n"""`, { temperature: 0 });
  return { level: r.level, reason: r.reason.trim().slice(0, 240) };
}

const REWRITE_SYSTEM = `You are an English writing teacher. You rewrite a learner's text at a requested CEFR level so they can see how the same message is written at that level.
Rules:
- Keep the same message, ideas, facts and names. Add no new facts or examples. Keep the text type (an email keeps its greeting and sign-off).
- Write at the requested level: use the grammar, vocabulary and linking typical of that level, no higher and no lower.
- Keep about the same length (A1/A2 may be shorter; C1/C2 may be a little longer). Keep paragraph breaks.
- List the most important changes (at most 8). "before" is copied exactly from the original text, "after" exactly from your new text, and "why" says in at most 15 simple words which language point changed (e.g. "a precise academic verb instead of a general one").
Return JSON: {"text": the rewritten text, "changes": [{"before", "after", "why"}]}.`;

/** The text rewritten at `target`, with the main changes (only changes that can be found in the new text). */
export async function rewriteAtLevel(
  text: string,
  from: Cefr,
  target: Cefr,
  type: LevelTextType,
): Promise<{ text: string; changes: LevelChange[] }> {
  const direction = CEFR_LEVELS.indexOf(target) > CEFR_LEVELS.indexOf(from) ? "higher" : "lower";
  const user = [
    `This is ${TYPE_LABEL[type]} written at about ${from} level. Rewrite it at ${target} level (${direction}).`,
    `${target} means: ${DESCRIPTORS[target]}.`,
    ...(type === "speaking" ? [SPOKEN_STYLE] : []),
    `ORIGINAL TEXT:\n"""\n${text}\n"""`,
  ].join("\n\n");
  const r = await ollamaJson(rewriteSchema, REWRITE_SYSTEM, user, { temperature: 0.3 });
  const out = r.text.trim();
  if (!out) throw new Error("The AI returned an empty text. Try again.");
  const lower = out.toLowerCase();
  const changes: LevelChange[] = [];
  for (const raw of r.changes) {
    const c = { before: raw.before.trim(), after: raw.after.trim(), why: raw.why.trim().slice(0, 160) };
    if (!c.after || c.before.toLowerCase() === c.after.toLowerCase() || !lower.includes(c.after.toLowerCase())) continue;
    // The model often lists a part of a change it already listed: keep only the first, larger one.
    const inside = (part: string, whole: string) => !!part && whole.toLowerCase().includes(part.toLowerCase());
    if (changes.some((k) => (inside(c.before, k.before) || !c.before) && inside(c.after, k.after))) continue;
    changes.push(c);
    if (changes.length === 8) break;
  }
  return { text: out, changes };
}
