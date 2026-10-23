/**
 * /admin content management: list, add, edit and delete the exercise items in content/exercises (and the items
 * generated from the learner's own mistakes, which live in the mistake memory).
 *
 * Items keep their id for life, even when moved to another level; a new item gets a number never used before
 * for its kind and level. Changing what an item asks resets its progress and drops its pre-generated audio
 * (it is synthesized again the next time it is played).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EngineError } from "@/engine/errors";
import { CONTENT_DIR, exerciseBank, invalidateExerciseBank, parsePassage, passageSource } from "@/engine/exercises/bank";
import { learnerMemory, type LearnerMemory } from "@/engine/exercises/store";
import {
  type Cefr, CEFR_LEVELS, GRAMMAR_CATEGORIES, type GrammarQuestion, type MasteryStatus, SPEAKING_TOPICS, type SpeakingTopic,
  type SpellingItem, type WritingPrompt,
} from "@/engine/exercises/types";
import { KeyedMutex, writeAtomic } from "@/engine/fsutil";
import { type AudioKind, audioFile, PRACTICE_AUDIO_DIR, PRACTICE_AUDIO_WRITE_DIR } from "../tts/practiceAudio";

export const ADMIN_KINDS = ["reading", "spelling", "grammar", "writing", "interaction", "repeat"] as const;
export type AdminKind = (typeof ADMIN_KINDS)[number];

export function adminKind(kind: string): AdminKind {
  if (!ADMIN_KINDS.includes(kind as AdminKind)) throw new EngineError("not_found", "Unknown content type.", 404);
  return kind as AdminKind;
}

type Origin = "bank" | "generated";
interface Base {
  id: string;
  level: Cefr;
  origin: Origin;
  /** Mastery of right/wrong items (reading, spelling, grammar, repeat). */
  status: MasteryStatus | null;
  attempts: number;
}
export type AdminItem =
  | (Base & { kind: "reading"; title: string; text: string })
  | (Base & { kind: "spelling"; type: "word" | "sentence"; text: string; learnedFrom: string | null })
  | (Base & { kind: "grammar"; stem: string; options: string[]; answer: number; explanation: string; category: string })
  | (Base & { kind: "writing"; type: "email"; situation: string; to: string; tasks: string[] })
  | (Base & { kind: "writing"; type: "discussion"; professor: { name: string; text: string }; students: { name: string; text: string }[] })
  | (Base & { kind: "writing"; type: "essay"; prompt: string })
  | (Base & { kind: "interaction"; topic: SpeakingTopic; text: string })
  | (Base & { kind: "repeat"; text: string });

/* ---------- validation ---------- */

const level = z.enum(CEFR_LEVELS);
const text = (max: number) => z.string().trim().min(1, "Required").max(max);
const person = z.object({ name: text(40), text: text(1200) });

export const inputSchemas = {
  reading: z.object({ level, title: text(80), text: text(2000) }),
  spelling: z.object({ level, type: z.enum(["word", "sentence"]), text: text(300) }),
  grammar: z.object({
    level,
    stem: text(300),
    options: z.array(text(80)).length(4),
    answer: z.number().int().min(0).max(3),
    explanation: text(600),
    category: z.enum(GRAMMAR_CATEGORIES),
  }),
  writing: z.discriminatedUnion("type", [
    z.object({ level, type: z.literal("email"), situation: text(1500), to: text(80), tasks: z.array(text(300)).min(1).max(5) }),
    z.object({ level, type: z.literal("discussion"), professor: person, students: z.array(person).min(1).max(3) }),
    z.object({ level, type: z.literal("essay"), prompt: text(1500) }),
  ]),
  interaction: z.object({ level, topic: z.enum(SPEAKING_TOPICS), text: text(400) }),
  repeat: z.object({ level, text: text(300) }),
} as const;
type Input<K extends AdminKind> = z.infer<(typeof inputSchemas)[K]>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Rules a valid item must follow beyond its shape (the same rules the content tests check). */
function check(kind: AdminKind, x: Input<AdminKind>): Input<AdminKind> {
  const fail = (message: string): never => {
    throw new EngineError("invalid_item", message);
  };
  if (kind === "reading") {
    const r = x as Input<"reading">;
    const p = parsePassage("check", r.level, r.title, r.text);
    if (p.blanks.length !== 10) fail(`Mark exactly 10 words with {braces} (found ${p.blanks.length}), as in the test.`);
    if (!/[.!?]\s/.test(p.segments[0])) fail("The first sentence must stay complete: put the first {word} after it.");
    const bad = p.blanks.find((b) => b.fullWord.length < 3);
    if (bad) fail(`"${bad.fullWord}" is too short: completed words need at least 3 letters.`);
  } else if (kind === "spelling") {
    const s = x as Input<"spelling">;
    if (s.type === "word" && !/^[a-z][a-z'-]*$/.test(s.text)) fail("A word is one lowercase word (letters, hyphen or apostrophe).");
    if (s.type === "sentence" && (!/[.!?]$/.test(s.text) || /\d/.test(s.text))) fail("A sentence ends with . ! or ? and has no digits (they are dictated).");
  } else if (kind === "grammar") {
    const g = x as Input<"grammar">;
    if ((g.stem.match(/_{3,}/g) ?? []).length !== 1) fail('The sentence needs exactly one blank, written "_____".');
    g.stem = g.stem.replace(/_{3,}/g, "_____");
    if (new Set(g.options.map(norm)).size !== 4) fail("The four options must all be different.");
  } else if (kind === "repeat") {
    if (/\d/.test((x as Input<"repeat">).text)) fail("Write numbers as words: sentences are compared word by word.");
  } else if (kind === "interaction") {
    if (!/[?.]$/.test((x as Input<"interaction">).text)) fail("End the question with ? or .");
  }
  return x;
}

export function parseInput(kind: AdminKind, body: unknown) {
  const r = inputSchemas[kind].safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new EngineError("invalid_item", `${issue.path.join(".") || "item"}: ${issue.message}`);
  }
  return check(kind, r.data as Input<AdminKind>);
}

/* ---------- listing ---------- */

function statusOf(m: LearnerMemory, key: string) {
  const r = m.records[key];
  return { status: r && r.attempts > 0 ? r.status : null, attempts: r?.attempts ?? 0 };
}

export async function listItems(kind: AdminKind): Promise<AdminItem[]> {
  const bank = exerciseBank();
  const m = await learnerMemory.get();
  switch (kind) {
    case "reading":
      return bank.reading.map((p) => ({ kind, id: p.id, level: p.level, origin: "bank", ...statusOf(m, `reading:${p.id}`), title: p.title, text: passageSource(p) }));
    case "spelling":
      return [...bank.spelling, ...m.generated.spelling].map((s) => ({
        kind, id: s.id, level: s.level, origin: s.source === "bank" ? "bank" : "generated", ...statusOf(m, `spelling:${s.id}`),
        type: s.type, text: s.text, learnedFrom: s.source === "bank" ? null : s.source,
      }));
    case "grammar":
      return [...bank.grammar, ...m.generated.grammar].map((g) => ({
        kind, id: g.id, level: g.level, origin: g.source === "bank" ? "bank" : "generated", ...statusOf(m, `grammar:${g.id}`),
        stem: g.stem, options: g.options, answer: g.answer, explanation: g.explanation, category: g.category,
      }));
    case "writing":
      return bank.writing.map((w) => {
        const base = { kind, id: w.id, level: w.level, origin: "bank" as const, status: null, attempts: m.seen[w.id] ?? 0 };
        if (w.type === "email") return { ...base, type: "email", situation: w.situation, to: w.to, tasks: w.tasks };
        if (w.type === "discussion") return { ...base, type: "discussion", professor: w.professor, students: w.students };
        return { ...base, type: "essay", prompt: w.prompt };
      });
    case "interaction":
      return bank.interaction.map((q) => ({ kind, id: q.id, level: q.level, origin: "bank", status: null, attempts: m.seen[q.id] ?? 0, topic: q.topic, text: q.text }));
    case "repeat":
      return bank.repeat.map((r) => ({ kind, id: r.id, level: r.level, origin: "bank", ...statusOf(m, `speaking-repeat:${r.id}`), text: r.text }));
  }
}

/* ---------- content files ---------- */

/** Where an item lives: a JSON file, and the key of its list when the file is an object. */
interface Slot {
  file: string;
  key: string | null;
}

function slotFor(kind: AdminKind, x: { level: Cefr; type?: string; topic?: string }): Slot {
  const f = (...p: string[]) => path.join(CONTENT_DIR, ...p);
  switch (kind) {
    case "reading": return { file: f("reading", `${x.level}.json`), key: null };
    case "spelling": return { file: f("spelling", `${x.level}.json`), key: x.type === "sentence" ? "sentences" : "words" };
    case "grammar": return { file: f("grammar", `${x.level}.json`), key: null };
    case "writing": return { file: f("writing", x.type!, `${x.level}.json`), key: null };
    case "interaction": return { file: f("speaking", "interaction", `${x.topic}.json`), key: x.level };
    case "repeat": return { file: f("speaking", "repeat", `${x.level}.json`), key: null };
  }
}

/** The stored form of an item (what the content file contains). */
function stored(kind: AdminKind, id: string, x: Input<AdminKind>): Record<string, unknown> {
  switch (kind) {
    case "reading": { const r = x as Input<"reading">; return { id, title: r.title, text: r.text }; }
    case "spelling": return { id, text: (x as Input<"spelling">).text };
    case "grammar": {
      const g = x as Input<"grammar">;
      return { id, stem: g.stem, options: g.options, answer: g.answer, explanation: g.explanation, category: g.category, difficulty: CEFR_LEVELS.indexOf(g.level) + 1, tags: [] };
    }
    case "writing": {
      const w = x as Input<"writing">;
      if (w.type === "email") return { id, situation: w.situation, to: w.to, tasks: w.tasks };
      if (w.type === "discussion") return { id, professor: w.professor, students: w.students };
      return { id, prompt: w.prompt };
    }
    case "interaction": return { id, text: (x as Input<"interaction">).text };
    case "repeat": return { id, text: (x as Input<"repeat">).text };
  }
}

/** One-line JSON with a space after "," and ":" (the style of the authored files). */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).filter(([, e]) => e !== undefined).map(([k, e]) => `${JSON.stringify(k)}: ${inline(e)}`).join(", ")}}`;
  return JSON.stringify(v);
}

/** Same layout as the authored files: one item per line, so diffs stay readable. */
function format(v: unknown, expand: number, depth = 0, ind = 0): string {
  if (depth >= expand || v === null || typeof v !== "object" || (Array.isArray(v) ? !v.length : !Object.keys(v).length)) return inline(v);
  const sp = "  ".repeat(ind + 1);
  const close = "  ".repeat(ind);
  if (Array.isArray(v)) return `[\n${v.map((e) => sp + format(e, expand, depth + 1, ind + 1)).join(",\n")}\n${close}]`;
  return `{\n${Object.entries(v).map(([k, e]) => `${sp}${JSON.stringify(k)}: ${format(e, expand, depth + 1, ind + 1)}`).join(",\n")}\n${close}}`;
}

type Doc = Record<string, unknown>[] | Record<string, Record<string, unknown>[]>;
async function readDoc(slot: Slot): Promise<Doc> {
  try {
    return JSON.parse(await fs.readFile(slot.file, "utf8")) as Doc;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return slot.key ? {} : [];
    throw e;
  }
}
const listOf = (doc: Doc, slot: Slot): Record<string, unknown>[] =>
  slot.key ? ((doc as Record<string, Record<string, unknown>[]>)[slot.key] ??= []) : (doc as Record<string, unknown>[]);

async function writeDoc(slot: Slot, doc: Doc) {
  try {
    const lists = Array.isArray(doc) ? [doc] : Object.values(doc);
    if (lists.every((l) => !l.length)) return void (await fs.rm(slot.file, { force: true })); // last item deleted
    await fs.mkdir(path.dirname(slot.file), { recursive: true });
    await writeAtomic(slot.file, format(doc, slot.key ? 2 : 1) + "\n");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      throw new EngineError("content_read_only", "The exercise content is read-only here (installed app). Edit it in the project with npm run dev, then rebuild the installer.", 409);
    }
    throw e;
  }
}

const g = globalThis as unknown as { __toeflContentMutex?: KeyedMutex };
const mutex = (g.__toeflContentMutex ??= new KeyedMutex());

/* ---------- ids ---------- */

const ID_PREFIX: Record<AdminKind, (x: { level: Cefr; type?: string; topic?: string }) => string> = {
  reading: (x) => `rd-${x.level.toLowerCase()}-`,
  spelling: (x) => `sp-${x.level.toLowerCase()}-${x.type === "sentence" ? "s" : "w"}`,
  grammar: (x) => `gr-${x.level.toLowerCase()}-`,
  writing: (x) => `wr-${x.level.toLowerCase()}-${x.type === "email" ? "e" : x.type === "discussion" ? "d" : "g"}`,
  interaction: (x) => `si-${x.topic}-${x.level.toLowerCase()}-`,
  repeat: (x) => `lr-${x.level.toLowerCase()}-`,
};

/** Next number for the prefix that no item, past answer or audio file has ever used. */
function newId(prefix: string, m: LearnerMemory): string {
  const bank = exerciseBank();
  const used = [
    ...Object.values(bank).flatMap((list) => (list as { id: string }[]).map((i) => i.id)),
    ...Object.values(m.records).map((r) => r.itemId),
    ...Object.keys(m.seen),
  ];
  const re = new RegExp(`^${prefix.replace(/[-]/g, "\\-")}(\\d+)$`);
  const max = Math.max(0, ...used.map((id) => Number(re.exec(id)?.[1] ?? 0)));
  return prefix + String(max + 1).padStart(2, "0");
}

/* ---------- side effects ---------- */

const TRACKED: Partial<Record<AdminKind, string>> = { reading: "reading", spelling: "spelling", grammar: "grammar", repeat: "speaking-repeat" };
const AUDIO: Partial<Record<AdminKind, AudioKind>> = { spelling: "spelling", repeat: "repeat", interaction: "speaking" };

async function dropAudio(kind: AdminKind, id: string) {
  const a = AUDIO[kind];
  if (!a) return;
  for (const root of new Set([PRACTICE_AUDIO_DIR, PRACTICE_AUDIO_WRITE_DIR])) {
    for (const format of ["mp3", "wav"] as const) await fs.rm(audioFile(a, id, root, format), { force: true }).catch(() => undefined);
  }
}

/** The item's content changed or it was deleted: its progress no longer applies. */
async function resetProgress(kind: AdminKind, id: string, deleted: boolean) {
  await learnerMemory.update((m) => {
    const t = TRACKED[kind];
    if (t) delete m.records[`${t}:${id}`];
    if (deleted) delete m.seen[id];
  });
}

/* ---------- create / update / delete ---------- */

function findBank(kind: AdminKind, id: string) {
  const bank = exerciseBank();
  const list: { id: string; level: Cefr; type?: string; topic?: string }[] =
    kind === "repeat" ? bank.repeat : kind === "interaction" ? bank.interaction : kind === "writing" ? bank.writing : bank[kind];
  return list.find((i) => i.id === id) ?? null;
}

/** Id of another item of the kind that already says the same thing (bank or generated), if any. */
async function duplicateOf(kind: AdminKind, x: Input<AdminKind>, exceptId: string | null): Promise<string | null> {
  const key = (v: AdminItem | Input<AdminKind>) =>
    norm("stem" in v ? v.stem : "text" in v ? v.text : "prompt" in v ? v.prompt : "situation" in v ? v.situation : v.professor.text);
  const k = key(x);
  return (await listItems(kind)).find((i) => i.id !== exceptId && key(i) === k)?.id ?? null;
}

export async function createItem(kind: AdminKind, body: unknown): Promise<AdminItem> {
  const x = parseInput(kind, body);
  const dup = await duplicateOf(kind, x, null);
  if (dup) throw new EngineError("duplicate", `This already exists (${dup}).`, 409);
  const id = await mutex.run("content", async () => {
    const slot = slotFor(kind, x as { level: Cefr; type?: string; topic?: string });
    const id = newId(ID_PREFIX[kind](x as { level: Cefr; type?: string; topic?: string }), await learnerMemory.get());
    const doc = await readDoc(slot);
    listOf(doc, slot).push(stored(kind, id, x));
    await writeDoc(slot, doc);
    invalidateExerciseBank();
    return id;
  });
  return (await listItems(kind)).find((i) => i.id === id)!;
}

/** Items generated from the learner's mistakes are edited in the mistake memory, not in the content files. */
async function updateGenerated(kind: AdminKind, id: string, x: Input<AdminKind> | null): Promise<boolean> {
  if (kind !== "grammar" && kind !== "spelling") return false;
  const { result } = await learnerMemory.update((m) => {
    if (kind === "grammar") {
      const i = m.generated.grammar.findIndex((q) => q.id === id);
      if (i < 0) return false;
      if (!x) m.generated.grammar.splice(i, 1);
      else {
        const g = x as Input<"grammar">;
        const before = m.generated.grammar[i];
        m.generated.grammar[i] = { ...before, level: g.level, stem: g.stem, options: g.options, answer: g.answer, explanation: g.explanation, category: g.category } satisfies GrammarQuestion;
        if (before.stem === g.stem && before.answer === g.answer && before.options.join("|") === g.options.join("|")) return true;
      }
    } else {
      const i = m.generated.spelling.findIndex((s) => s.id === id);
      if (i < 0) return false;
      if (!x) m.generated.spelling.splice(i, 1);
      else {
        const s = x as Input<"spelling">;
        const before = m.generated.spelling[i];
        m.generated.spelling[i] = { ...before, level: s.level, type: s.type, text: s.text } satisfies SpellingItem;
        if (before.text === s.text) return true;
      }
    }
    delete m.records[`${kind}:${id}`];
    return true;
  });
  if (result && kind === "spelling") await dropAudio(kind, id);
  return result;
}

export async function updateItem(kind: AdminKind, id: string, body: unknown): Promise<AdminItem> {
  const x = parseInput(kind, body);
  const dup = await duplicateOf(kind, x, id);
  if (dup) throw new EngineError("duplicate", `Another item already says this (${dup}).`, 409);
  if (!(await updateGenerated(kind, id, x))) {
    const current = findBank(kind, id);
    if (!current) throw new EngineError("item_not_found", "This item no longer exists.", 404);
    if (kind === "writing" && (current as WritingPrompt).type !== (x as Input<"writing">).type) {
      throw new EngineError("invalid_item", "The writing task type cannot be changed; add a new prompt instead.");
    }
    const changed = await mutex.run("content", async () => {
      const from = slotFor(kind, current);
      const to = slotFor(kind, x as { level: Cefr; type?: string; topic?: string });
      const doc = await readDoc(from);
      const list = listOf(doc, from);
      const i = list.findIndex((e) => e.id === id);
      if (i < 0) throw new EngineError("item_not_found", "This item no longer exists.", 404);
      const next = stored(kind, id, x);
      const changed = JSON.stringify({ ...list[i], tags: undefined, difficulty: undefined }) !== JSON.stringify({ ...next, tags: undefined, difficulty: undefined });
      if (from.file === to.file && from.key === to.key) {
        list[i] = { ...list[i], ...next };
        await writeDoc(from, doc);
      } else {
        // Moved to another level, word/sentence list or topic: same id, new place.
        const [old] = list.splice(i, 1);
        const target = await readDoc(to);
        listOf(target, to).push({ ...old, ...next });
        await writeDoc(to, target);
        await writeDoc(from, doc);
      }
      invalidateExerciseBank();
      return changed;
    });
    if (changed) {
      await dropAudio(kind, id);
      await resetProgress(kind, id, false);
    }
  }
  const item = (await listItems(kind)).find((i) => i.id === id);
  if (!item) throw new EngineError("item_not_found", "This item no longer exists.", 404);
  return item;
}

export async function deleteItem(kind: AdminKind, id: string): Promise<void> {
  if (await updateGenerated(kind, id, null)) return;
  const current = findBank(kind, id);
  if (!current) throw new EngineError("item_not_found", "This item no longer exists.", 404);
  await mutex.run("content", async () => {
    const slot = slotFor(kind, current);
    const doc = await readDoc(slot);
    const list = listOf(doc, slot);
    const i = list.findIndex((e) => e.id === id);
    if (i >= 0) list.splice(i, 1);
    await writeDoc(slot, doc);
    invalidateExerciseBank();
  });
  await dropAudio(kind, id);
  await resetProgress(kind, id, true);
}

export async function contentCounts(): Promise<Record<AdminKind, number>> {
  const bank = exerciseBank();
  const m = await learnerMemory.get();
  return {
    reading: bank.reading.length,
    spelling: bank.spelling.length + m.generated.spelling.length,
    grammar: bank.grammar.length + m.generated.grammar.length,
    writing: bank.writing.length,
    interaction: bank.interaction.length,
    repeat: bank.repeat.length,
  };
}
