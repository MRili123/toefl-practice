/**
 * The learner's spelling and grammar mistakes, gathered from where they were made:
 * - series tests: Reading "Complete the Words" blanks and the AI corrections of Writing (email, academic discussion);
 * - exercises: Spelling, Reading (Complete the Words) and Writing practice.
 *
 * The list is rebuilt from the sessions themselves (deleting a session removes its mistakes). The mistake memory
 * only remembers what was done with each mistake (`LearnerMemory.mistakes`, by mistake id).
 *
 * The AI first checks every mistake (except dictation answers, which are spelling by nature): is it a spelling
 * or a grammar mistake, and at which CEFR level?
 * - spelling: the word joins Spelling practice at the word's level, once; a word already there (built-in or
 *   added before) is never added again;
 * - grammar: the mistake gets its own AI-generated question with options, at the rule's level, in Grammar
 *   practice. Mistakes made before this existed are imported without generating automatically: their question
 *   is generated on request.
 */
import { createHash } from "node:crypto";
import { generateGrammarQuestion, verifyMistake } from "@/ai/exercises/evaluate";
import { levenshtein } from "@/ai/spelling";
import type { WritingFeedback } from "@/ai/feedbackTypes";
import { itemIndex, loadTest } from "@/engine/bank/loader";
import type { CompleteTheWordsTask } from "@/engine/bank/types";
import { exerciseBank } from "@/engine/exercises/bank";
import { exampleAround, isPlausibleFix, mistakeFocus } from "@/engine/exercises/corrections";
import { rememberSpellingWord } from "@/engine/exercises/memory";
import { checkedWordLevel } from "@/engine/exercises/wordLevel";
import { exerciseSessions, learnerMemory, type LearnerMemory } from "@/engine/exercises/store";
import {
  type Cefr, CEFR_LEVELS, GRAMMAR_CATEGORIES, type GrammarCategory, type GrammarQuestion, type MasteryStatus,
  type MistakeLink, type MistakeSource, type ReadingPassage, SPEAKING_TOPICS, TOPIC_LABEL,
} from "@/engine/exercises/types";
import { gradeCtw } from "@/engine/evaluation/objective";
import { EngineError } from "@/engine/errors";
import { buildResults } from "@/engine/results/results";
import { sessions } from "@/engine/session/store";
import { bankWords } from "../exerciseItems";
import { exerciseQueue } from "../exerciseQueue";


/** Mistakes made before this date were imported from history: their grammar questions are generated on request. */
const AUTO_GENERATE_SINCE = Date.UTC(2026, 9, 2, 16, 30);

export interface Mistake {
  id: string;
  type: "spelling" | "grammar";
  source: MistakeSource;
  /** What the learner wrote (word, typed blank, or phrase) and the correct form. */
  original: string;
  correction: string;
  /** The sentence it appeared in, when known. */
  context: string | null;
  explanation: string | null;
  category: string | null;
  level: Cefr;
  at: number;
  where: { label: string; href: string };
  /** The practice item that brings it back (spelling word, reading passage, generated grammar question). */
  practiceKey: string | null;
  status: MasteryStatus | null;
  mastered: boolean;
  /** The AI check (spelling or grammar?); not needed for dictation mistakes. */
  check: "none" | "pending" | "done" | "error";
  checkError: string | null;
  /** Grammar mistakes (as checked by the AI): the AI-generated question made from it. */
  question: { state: "none" | "queued" | "running" | "done" | "error"; error: string | null; item: GrammarQuestion | null } | null;
}

type Raw = Omit<Mistake, "practiceKey" | "status" | "mastered" | "question" | "check" | "checkError"> & {
  /** Practice item already known from the session (spelling/reading exercise). */
  itemKey: string | null;
  /** The context sentence with the mistake fixed (for generating a question). */
  contextFixed: string | null;
};

const hash = (...parts: (string | number | null)[]) => createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
const bandLevel = (band: number | null | undefined): Cefr | null =>
  band == null ? null : CEFR_LEVELS[Math.max(0, Math.min(5, Math.round(band) - 1))];
const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The sentence of a Complete the Words paragraph that contains blank `index`, with the blank shown as typed and as fixed. */
function ctwSentence(task: CompleteTheWordsTask, index: number, typed: string): { wrong: string; fixed: string } {
  const build = (fill: (i: number) => string) => task.segments.map((s, i) => s + (task.blanks[i] ? fill(i) : "")).join("");
  const mark = "\u0000";
  const marked = build((i) => (i === index ? mark : task.blanks[i].fullWord));
  const at = marked.indexOf(mark);
  let s = at;
  while (s > 0 && !/[.!?]/.test(marked[s - 1])) s--;
  let e = at;
  while (e < marked.length && !/[.!?]/.test(marked[e])) e++;
  const sentence = marked.slice(s, Math.min(marked.length, e + 1)).trim();
  const blank = task.blanks[index];
  return { wrong: sentence.replace(mark, blank.prefix + typed), fixed: sentence.replace(mark, blank.fullWord) };
}

/** Writing corrections worth remembering: spelling and grammar fixes (the AI later checks which one each really is). */
function writingMistakes(
  corrections: { original: string; correction: string; type: string; explanation: string | null; category: string | null; start: number | null; end: number | null }[],
  text: string,
) {
  const out: { type: "spelling" | "grammar"; original: string; correction: string; explanation: string | null; category: string | null; context: string | null; contextFixed: string | null; key: string }[] = [];
  corrections.forEach((c, i) => {
    const type = c.type === "spelling" ? "spelling" : c.type === "grammar" || c.type === "word order" || c.type === "sentence-structure" ? "grammar" : null;
    if (!type || !c.original.trim() || !c.correction.trim()) return;
    if (!isPlausibleFix({ original: c.original, correction: c.correction, type: type === "spelling" ? "spelling" : "grammar" })) return;
    if (c.original.trim().toLowerCase() === c.correction.trim().toLowerCase()) return; // capitalization only
    const ex = c.start !== null && c.end !== null ? exampleAround(text, c.start, c.end, c.correction) : null;
    out.push({ type, original: c.original, correction: c.correction, explanation: c.explanation, category: c.category, context: ex?.original ?? null, contextFixed: ex?.correction ?? null, key: `${c.start ?? i}` });
  });
  return out;
}

/* ---------- collect ---------- */

export async function collect(): Promise<Raw[]> {
  const out: Raw[] = [];

  // Series tests
  for (const s of await sessions.list()) {
    let test;
    try {
      test = loadTest(s.testNumber);
    } catch {
      continue;
    }
    const idx = itemIndex(s.testNumber);
    const results = buildResults(s, test);
    const reading = results.sections.find((x) => x.id === "reading");
    const writing = results.sections.find((x) => x.id === "writing");
    const href = `/results/${s.id}`;

    if (reading?.completed) {
      for (const [itemId, answer] of Object.entries(s.answers)) {
        const ref = idx.get(itemId);
        if (!ref?.blank || ref.task.kind !== "complete_the_words" || answer.kind !== "text") continue;
        if (gradeCtw(ref.blank, answer) !== "incorrect") continue;
        const typed = answer.value.trim();
        const task = ref.task;
        const ctx = ctwSentence(task, task.blanks.findIndex((b) => b.id === ref.blank!.id), typed);
        const moduleLevel = ref.moduleId.includes("hard") ? "C1" : ref.moduleId.includes("easy") ? "A2" : "B1";
        out.push({
          id: hash("series-reading", s.id, itemId, typed), type: "spelling", source: "series-reading",
          original: ref.blank.prefix + typed, correction: ref.blank.fullWord, context: ctx.wrong, contextFixed: ctx.fixed,
          explanation: null, category: null, level: bandLevel(reading.score?.band) ?? (moduleLevel as Cefr),
          at: s.completedAt ?? s.updatedAt, where: { label: `Test ${s.testNumber} · Reading · Complete the Words`, href }, itemKey: null,
        });
      }
    }

    for (const [itemId, ev] of Object.entries(s.evaluations)) {
      if (ev.kind !== "writing" || ev.status !== "done") continue;
      const fb = ev.feedback as WritingFeedback | null;
      const answer = s.answers[itemId];
      const ref = idx.get(itemId);
      if (fb?.kind !== "writing" || answer?.kind !== "essay" || !ref) continue;
      const task = ref.task.kind === "write_email" ? "Email" : "Academic Discussion";
      const level = bandLevel(writing?.score?.band) ?? bandLevel(ev.score !== null ? ev.score + 1 : null) ?? "B1";
      const list = writingMistakes(
        fb.corrections.map((c) => ({ original: c.original, correction: c.suggestion, type: c.type, explanation: c.explanation || null, category: c.category ?? null, start: c.start ?? null, end: c.end ?? null })),
        answer.text,
      );
      for (const w of list) {
        out.push({
          id: hash("series-writing", s.id, itemId, w.key, w.original, w.correction), type: w.type, source: "series-writing",
          original: w.original, correction: w.correction, context: w.context, contextFixed: w.contextFixed, explanation: w.explanation,
          category: w.category, level, at: ev.updatedAt, where: { label: `Test ${s.testNumber} · Writing · ${task}`, href }, itemKey: null,
        });
      }
    }
  }

  // Exercises
  const bank = exerciseBank();
  for (const s of await exerciseSessions.list()) {
    const href = `/profile/exercises/${s.id}`;
    s.attempts.forEach((a, n) => {
      const fb = a.feedback;
      if (s.kind === "spelling" && a.correct === false && fb?.kind === "spelling") {
        out.push({
          id: hash("spelling-exercise", s.id, n, a.itemId), type: "spelling", source: "spelling-exercise",
          original: fb.given || "(no answer)", correction: fb.expected, context: null, contextFixed: null, explanation: fb.explanation,
          category: null, level: a.level, at: a.at, where: { label: `Spelling practice · ${fmtDate(a.at)}`, href }, itemKey: `spelling:${a.itemId}`,
        });
      }
      if (s.kind === "reading" && fb?.kind === "reading") {
        const passage = bank.reading.find((p) => p.id === a.itemId) as ReadingPassage | undefined;
        fb.blanks.forEach((b, i) => {
          if (b.correct || !b.given) return;
          const ctx = passage ? ctwSentence({ kind: "complete_the_words", id: passage.id, segments: passage.segments, blanks: passage.blanks }, i, b.given) : null;
          out.push({
            id: hash("reading-exercise", s.id, n, b.id), type: "spelling", source: "reading-exercise",
            original: b.prefix + b.given, correction: b.fullWord, context: ctx?.wrong ?? null, contextFixed: ctx?.fixed ?? null, explanation: null,
            category: null, level: a.level, at: a.at, where: { label: `Reading practice · ${passage?.title ?? a.itemId}`, href }, itemKey: `reading:${a.itemId}`,
          });
        });
      }
      if (s.kind === "writing" && fb?.kind === "writing" && a.answer) {
        for (const w of writingMistakes(fb.corrections.map((c) => ({ ...c, explanation: c.reason || null })), a.answer)) {
          out.push({
            id: hash("writing-exercise", s.id, n, w.key, w.original, w.correction), type: w.type, source: "writing-exercise",
            original: w.original, correction: w.correction, context: w.context, contextFixed: w.contextFixed, explanation: w.explanation,
            category: w.category, level: a.level, at: a.at, where: { label: `Writing practice · ${fmtDate(a.at)}`, href }, itemKey: null,
          });
        }
      }
    });
  }
  return out;
}

/** Spelling practice mistakes are dictation answers: spelling by nature, no AI check needed. */
const needsCheck = (x: Pick<Raw, "source">) => x.source !== "spelling-exercise";

/** Spelling or grammar: the AI's verdict once checked, otherwise what the source reported. */
const typeOf = (x: Pick<Raw, "type">, link: MistakeLink | undefined) => link?.verdict?.type ?? x.type;

/** Mistakes that get a generated grammar question: every mistake the AI found to be grammar. */
const generates = (x: Pick<Raw, "source">, link: MistakeLink | undefined) => needsCheck(x) && link?.verdict?.type === "grammar";

/**
 * The words to practise from a spelling mistake: each word of the correction that the learner misspelled, i.e.
 * a new word close to something they wrote ("shelths" → "shelter", "a nother" → "another"). Words they did not
 * attempt (a rewritten greeting) and names are left out; a word capitalized only because it starts the
 * sentence is kept lowercase.
 */
function practiceWords(x: Pick<Raw, "correction" | "original" | "context">): string[] {
  const tokens = x.original.split(/[^A-Za-z'-]+/).filter(Boolean);
  const written = new Set(tokens.map((t) => t.toLowerCase()));
  const joined = tokens.join("").toLowerCase();
  const sentenceStart = (x.context ?? "").trimStart().replace(/^[^A-Za-z]+/, "");
  // One word written for one word (a completed blank, a misspelled word): that word is what must be learned.
  const oneForOne = tokens.length === 1 && /^[A-Za-z][A-Za-z'-]*$/.test(x.correction.trim());
  const out: string[] = [];
  x.correction.split(/[^A-Za-z'-]+/).forEach((w, i) => {
    if (w.length < 3 || written.has(w.toLowerCase())) return;
    const capitalized = /^[A-Z][a-z'-]+$/.test(w);
    const starts = i === 0 && (sentenceStart.startsWith(x.original.trim()) || sentenceStart.startsWith(w) || !x.context);
    if (capitalized && !starts) return; // a name
    const target = w.toLowerCase();
    const near = [...tokens.map((t) => t.toLowerCase()), joined].some((t) => levenshtein(t, target) <= Math.max(2, Math.ceil(target.length / 3)));
    if (near || oneForOne) out.push(capitalized && starts ? target : w);
  });
  return out;
}

/* ---------- sync ---------- */

const g = globalThis as unknown as {
  __toeflMistakeGen?: Set<string>;
  __toeflMistakeCheck?: Set<string>;
  __toeflMistakeTimer?: ReturnType<typeof setTimeout> | null;
};
/** Mistake ids whose question is being generated / which the AI is checking, in this process. */
const active = (g.__toeflMistakeGen ??= new Set());
const checking = (g.__toeflMistakeCheck ??= new Set());

/**
 * Sends every mistake not checked yet to the AI (spelling or grammar?) and resumes interrupted checks and
 * generations. What happens after the check is in `applyVerdict`.
 */
export async function syncMistakes(found?: Raw[]): Promise<Raw[]> {
  const all = found ?? (await collect());
  const now = Date.now();
  const toCheck: Raw[] = [];
  const resume: Raw[] = [];
  await learnerMemory.update((m) => {
    for (const x of all) {
      const link: MistakeLink = (m.mistakes[x.id] ??= { at: now });
      if (needsCheck(x) && !link.verdict && !checking.has(x.id)) {
        link.check = { stage: "queued", error: null };
        toCheck.push(x);
      }
      if (link.verdict && link.generation && link.generation.stage !== "error" && !link.questionId && !active.has(x.id)) {
        link.generation = { stage: "queued", error: null };
        resume.push(x);
      }
    }
  });
  for (const x of toCheck) enqueueCheck(x);
  for (const x of resume) enqueue(x);
  return all;
}

/** Debounced background sync (after an evaluation finishes, a Reading section ends or a Reading passage is checked). */
export function requestMistakeSync() {
  if (g.__toeflMistakeTimer) clearTimeout(g.__toeflMistakeTimer);
  g.__toeflMistakeTimer = setTimeout(() => {
    g.__toeflMistakeTimer = null;
    syncMistakes().catch((e) => console.error("[mistakes]", (e as Error).message));
  }, 2000);
}

/* ---------- AI check ---------- */

function friendly(e: Error, what = "The question could not be generated."): string {
  if (/Ollama|11434|fetch failed|ECONNREFUSED/i.test(e.message)) return "The local AI model (Ollama) is not reachable. Start Ollama and try again.";
  if (/timeout|aborted/i.test(e.message)) return "The AI took too long. Try again when the computer is less busy.";
  if (/reliable/i.test(e.message)) return e.message;
  return `${what} Try again.`;
}

async function setLink(id: string, fn: (l: MistakeLink, m: LearnerMemory) => void) {
  await learnerMemory.update((m) => {
    const l = (m.mistakes[id] ??= { at: Date.now() });
    fn(l, m);
  });
}

/**
 * Applies the AI's verdict (inside a memory update). Returns true when a question should be generated now.
 * - spelling: each word joins Spelling practice at the word's own level, once: a word already in practice
 *   (built-in or added before) is reused, never added again;
 * - grammar: a word this mistake added to Spelling practice before it was checked is taken back out, and the
 *   mistake gets its own generated question at the rule's level (automatically for new mistakes).
 */
function applyVerdict(m: LearnerMemory, x: Raw, link: MistakeLink, now: number): boolean {
  const v = link.verdict!;
  if (v.type === "spelling") {
    if (link.spellingItemId === undefined) {
      const source = x.source === "series-writing" || x.source === "writing-exercise" ? "writing" : "reading";
      const ids = practiceWords(x).map((w) => {
        const existing = bankWords().get(w.toLowerCase()) ?? m.generated.spelling.find((s) => s.text.toLowerCase() === w.toLowerCase());
        const r = existing ? m.records[`spelling:${existing.id}`] : undefined;
        // Already being practised after an earlier mistake: link it without counting the same mistake twice.
        if (existing && r && r.incorrect > 0 && r.status !== "mastered" && r.status !== "strong") return existing.id;
        return rememberSpellingWord(m, w, checkedWordLevel(w, v.level), source, x.original, now, bankWords());
      });
      link.spellingItemId = ids.find(Boolean) ?? null;
    }
    // A word added from mistakes takes the AI's level for the word, checked against its frequency (built-in
    // words keep theirs).
    const added = m.generated.spelling.find((s) => s.id === link.spellingItemId);
    if (added) {
      added.level = checkedWordLevel(added.text, v.level);
      const r = m.records[`spelling:${added.id}`];
      if (r) r.level = added.level;
    }
    return false;
  }
  const wordId = link.spellingItemId;
  if (wordId && m.generated.spelling.some((s) => s.id === wordId)) {
    const stillUsed = Object.entries(m.mistakes).some(([id, l]) => id !== x.id && l.spellingItemId === wordId && l.verdict?.type !== "grammar");
    if (!stillUsed) {
      m.generated.spelling = m.generated.spelling.filter((s) => s.id !== wordId);
      delete m.records[`spelling:${wordId}`];
    }
  }
  link.spellingItemId = null;
  if (v.category) link.category = v.category;
  const auto = x.at >= AUTO_GENERATE_SINCE && !link.questionId && !link.generation;
  if (auto) link.generation = { stage: "queued", error: null };
  return auto;
}

function enqueueCheck(x: Raw) {
  checking.add(x.id);
  exerciseQueue.task(`check:${x.id}`, async () => {
    try {
      await setLink(x.id, (l) => void (l.check = { stage: "running", error: null }));
      const verdict = await verifyMistake(x.original, x.correction, x.context, x.explanation);
      let generate = false;
      await setLink(x.id, (l, m) => {
        l.verdict = verdict;
        delete l.check;
        generate = applyVerdict(m, x, l, Date.now());
      });
      if (generate) enqueue(x);
    } catch (e) {
      console.error(`[mistakes] check ${x.id}:`, (e as Error).message);
      await setLink(x.id, (l) => void (l.check = { stage: "error", error: friendly(e as Error, "The AI could not check this mistake.") }));
    } finally {
      checking.delete(x.id);
    }
  });
}

/* ---------- question generation ---------- */

function enqueue(x: Raw) {
  active.add(x.id);
  exerciseQueue.task(`mistake:${x.id}`, async () => {
    try {
      await setLink(x.id, (l) => void (l.generation = { stage: "running", error: null }));
      const m = await learnerMemory.get();
      const link = m.mistakes[x.id];
      const known = link?.verdict?.category ?? link?.category ?? x.category;
      const category: GrammarCategory = GRAMMAR_CATEGORIES.includes(known as GrammarCategory) ? (known as GrammarCategory) : "sentence-structure";
      const level = link?.verdict?.level ?? x.level;
      const avoid = [...exerciseBank().grammar, ...m.generated.grammar].filter((q) => q.category === category).map((q) => q.stem);
      const used = new Set(m.generated.grammar.map((q) => q.id));
      let n = m.generated.grammar.length + 1;
      while (used.has(`gr-gen-${n}`)) n++;
      const topic = TOPIC_LABEL[SPEAKING_TOPICS[Math.floor(Math.random() * SPEAKING_TOPICS.length)]].toLowerCase();
      const example = `${x.context ?? x.original} → ${x.contextFixed ?? x.correction}`;
      const focus = mistakeFocus(x.original, x.correction) ?? undefined;
      const q = await generateGrammarQuestion(category, level, topic, [example], avoid, `gr-gen-${n}`, { attempts: 6, focus });
      if (!q) throw new Error("The AI could not write a reliable question for this mistake. Try again.");
      await setLink(x.id, (l, mm) => {
        mm.generated.grammar.push({ ...q, tags: [...q.tags, `mistake:${x.id}`] });
        l.questionId = q.id;
        l.category = category;
        delete l.generation;
      });
    } catch (e) {
      console.error(`[mistakes] ${x.id}:`, (e as Error).message);
      await setLink(x.id, (l) => void (l.generation = { stage: "error", error: friendly(e as Error) }));
    } finally {
      active.delete(x.id);
    }
  });
}

/** "Show AI-generated question" on a grammar mistake whose question does not exist yet (or failed): generate it now. */
export async function requestMistakeQuestion(id: string): Promise<Mistake> {
  const all = await collect();
  const x = all.find((r) => r.id === id);
  if (!x) throw new EngineError("mistake_not_found", "This mistake no longer exists.", 404);
  const m = await learnerMemory.get();
  const l = m.mistakes[id];
  if (!l?.verdict) throw new EngineError("not_checked", "The AI has not checked this mistake yet. Wait a moment and try again.", 409);
  if (!generates(x, l)) throw new EngineError("invalid_action", "The AI found this is a spelling mistake: the word is practised in Spelling.", 400);
  const hasQuestion = !!l.questionId && m.generated.grammar.some((q) => q.id === l.questionId);
  if (!hasQuestion && !active.has(id)) {
    await setLink(id, (link) => {
      delete link.questionId;
      link.generation = { stage: "queued", error: null };
    });
    enqueue(x);
  }
  return (await viewMistakes([x])).find((v) => v.id === id)!;
}

/* ---------- views ---------- */

async function viewMistakes(all: Raw[]): Promise<Mistake[]> {
  const m = await learnerMemory.get();
  const words = bankWords();
  const generatedWords = new Map(m.generated.spelling.map((s) => [s.text.toLowerCase(), s.id]));
  const questions = new Map(m.generated.grammar.map((q) => [q.id, q]));
  return all
    .map(({ itemKey, contextFixed, ...x }) => {
      void contextFixed; // only needed to generate questions
      const link = m.mistakes[x.id];
      const type = typeOf(x, link);
      let practiceKey = itemKey;
      let question: Mistake["question"] = null;
      // A spelling mistake is mastered with its word in Spelling practice (else its passage/dictation item).
      if (type === "spelling" && needsCheck(x) && link?.verdict) {
        const word = practiceWords(x)[0]?.toLowerCase() ?? "";
        const wordId = link.spellingItemId ?? words.get(word)?.id ?? generatedWords.get(word);
        if (wordId) practiceKey = `spelling:${wordId}`;
      }
      const existing = link?.questionId ? questions.get(link.questionId) ?? null : null;
      if (generates(x, link) || existing) {
        const item = existing;
        // A grammar mistake is mastered with its question; a spelling one keeps its word (and may also have one).
        if (item && type === "grammar") practiceKey = `grammar:${item.id}`;
        question = item
          ? { state: "done", error: null, item }
          : link?.generation
            ? { state: active.has(x.id) || link.generation.stage === "error" ? link.generation.stage : "queued", error: link.generation.error, item: null }
            : { state: "none", error: null, item: null };
      }
      const r = practiceKey ? m.records[practiceKey] : undefined;
      const status = r && r.attempts > 0 ? r.status : null;
      const check: Mistake["check"] = !needsCheck(x) ? "none" : link?.verdict ? "done" : link?.check?.stage === "error" ? "error" : "pending";
      return {
        ...x,
        type,
        level: link?.verdict?.level ?? x.level,
        category: type === "grammar" ? (link?.verdict?.category ?? link?.category ?? x.category) : null,
        practiceKey,
        status,
        mastered: status === "mastered",
        question,
        check,
        checkError: link?.check?.error ?? null,
      };
    })
    .sort((a, b) => b.at - a.at);
}

export async function listMistakes(): Promise<Mistake[]> {
  return viewMistakes(await syncMistakes());
}
