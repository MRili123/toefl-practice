/**
 * Authored exercise content (content/exercises, tracked in git, editable in /admin). Every item carries a stable
 * id, e.g. rd-b1-07 (reading passage), sp-b2-w07 (spelling word), gr-c1-12, si-environment-b1-33, lr-a2-05,
 * wr-b2-d14. Ids never change when items are added, moved to another level or deleted, so progress and
 * pre-generated audio stay attached to the right item. (Older files with plain strings get position-based ids.)
 */
import fs from "node:fs";
import path from "node:path";
import {
  type Cefr, CEFR_LEVELS, type DiscussionPrompt, type EmailPrompt, type EssayPrompt, type GrammarCategory,
  type GrammarQuestion, type ReadingPassage, type RepeatSentence, SPEAKING_TOPICS, type SpeakingQuestion, type SpeakingTopic,
  type SpellingItem, type WritingPrompt,
} from "./types";

export const CONTENT_DIR = path.resolve(process.env.TOEFL_CONTENT_DIR ?? path.join(process.cwd(), "content", "exercises"));

const pad = (n: number) => String(n + 1).padStart(2, "0");
const lc = (l: Cefr) => l.toLowerCase();

function read<T>(...parts: string[]): T | null {
  const file = path.join(CONTENT_DIR, ...parts);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/** A content entry: an object with its id, or (older files) a plain string whose id comes from its position. */
type Entry<T> = (T & { id?: string }) | string;
function entries<T extends object>(list: Entry<T>[] | null | undefined, key: string, idAt: (i: number) => string): (T & { id: string })[] {
  return (list ?? []).map((e, i) => (typeof e === "string" ? ({ [key]: e, id: idAt(i) } as T & { id: string }) : { ...e, id: e.id ?? idAt(i) }));
}

type RawGrammar = Omit<GrammarQuestion, "id" | "level" | "source">;
type RawEmail = { situation: string; to: string; tasks: string[] };
type RawDiscussion = { professor: { name: string; text: string }; students: { name: string; text: string }[] };

/**
 * Reading passages are written with the completed words in braces ("These {colorful} formations…").
 * As on the test, the second half of each marked word is removed: "colo" + "rful".
 */
export function parsePassage(id: string, level: Cefr, title: string, text: string): ReadingPassage {
  const parts = text.split(/\{([A-Za-z]+)\}/);
  const segments: string[] = [];
  const blanks: ReadingPassage["blanks"] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) return void segments.push(part);
    const keep = Math.max(1, Math.floor(part.length / 2));
    blanks.push({ id: `${id}-w${blanks.length + 1}`, prefix: part.slice(0, keep), answer: part.slice(keep), fullWord: part });
  });
  return { id, level, title, segments, blanks };
}

/** The authored text of a passage, with the completed words back in braces (for editing). */
export const passageSource = (p: ReadingPassage) => p.segments.map((s, i) => s + (p.blanks[i] ? `{${p.blanks[i].fullWord}}` : "")).join("");

export interface ExerciseBank {
  reading: ReadingPassage[];
  spelling: SpellingItem[];
  grammar: GrammarQuestion[];
  interaction: SpeakingQuestion[];
  repeat: RepeatSentence[];
  writing: WritingPrompt[];
}

function load(): ExerciseBank {
  const bank: ExerciseBank = { reading: [], spelling: [], grammar: [], interaction: [], repeat: [], writing: [] };
  for (const level of CEFR_LEVELS) {
    const l = lc(level);
    for (const p of entries(read<Entry<{ title: string; text: string }>[]>("reading", `${level}.json`), "text", (i) => `rd-${l}-${pad(i)}`)) {
      bank.reading.push(parsePassage(p.id, level, p.title, p.text));
    }

    const sp = read<{ words?: Entry<{ text: string }>[]; sentences?: Entry<{ text: string }>[] }>("spelling", `${level}.json`);
    for (const w of entries(sp?.words, "text", (i) => `sp-${l}-w${pad(i)}`)) bank.spelling.push({ id: w.id, level, type: "word", text: w.text, source: "bank" });
    for (const w of entries(sp?.sentences, "text", (i) => `sp-${l}-s${pad(i)}`)) bank.spelling.push({ id: w.id, level, type: "sentence", text: w.text, source: "bank" });

    for (const g of entries(read<Entry<RawGrammar>[]>("grammar", `${level}.json`), "stem", (i) => `gr-${l}-${pad(i)}`)) {
      bank.grammar.push({ ...g, level, source: "bank" });
    }

    for (const r of entries(read<Entry<{ text: string }>[]>("speaking", "repeat", `${level}.json`), "text", (i) => `lr-${l}-${pad(i)}`)) {
      bank.repeat.push({ id: r.id, level, text: r.text });
    }

    for (const e of entries(read<Entry<RawEmail>[]>("writing", "email", `${level}.json`), "situation", (i) => `wr-${l}-e${pad(i)}`)) {
      bank.writing.push({ ...e, level, type: "email" } satisfies EmailPrompt);
    }
    for (const d of entries(read<Entry<RawDiscussion>[]>("writing", "discussion", `${level}.json`), "professor", (i) => `wr-${l}-d${pad(i)}`)) {
      bank.writing.push({ ...d, level, type: "discussion" } satisfies DiscussionPrompt);
    }
    for (const g of entries(read<Entry<{ prompt: string }>[]>("writing", "essay", `${level}.json`), "prompt", (i) => `wr-${l}-g${pad(i)}`)) {
      bank.writing.push({ id: g.id, level, type: "essay", prompt: g.prompt } satisfies EssayPrompt);
    }
  }
  for (const topic of SPEAKING_TOPICS) {
    const t = read<Partial<Record<Cefr, Entry<{ text: string }>[]>>>("speaking", "interaction", `${topic}.json`);
    for (const level of CEFR_LEVELS) {
      for (const q of entries(t?.[level], "text", (i) => `si-${topic}-${lc(level)}-${pad(i)}`)) {
        bank.interaction.push({ id: q.id, level, topic: topic as SpeakingTopic, text: q.text });
      }
    }
  }
  return bank;
}

let cache: { bank: ExerciseBank; index: Map<string, unknown>; at: number } | null = null;

/** Content is cached per process; in development it is re-read every few seconds so edits show up. */
export function exerciseBank(): ExerciseBank {
  const stale = cache && process.env.NODE_ENV === "development" && Date.now() - cache.at > 5000;
  if (!cache || stale) {
    const bank = load();
    const index = new Map<string, unknown>();
    for (const list of Object.values(bank)) for (const item of list as { id: string }[]) index.set(item.id, item);
    cache = { bank, index, at: Date.now() };
  }
  return cache.bank;
}

/** Forces the next read to reload the content files (after an edit in /admin). */
export function invalidateExerciseBank() {
  cache = null;
}

export function bankItem<T>(id: string): T | null {
  exerciseBank();
  return (cache!.index.get(id) as T) ?? null;
}

export function grammarCategoriesInBank(): Set<GrammarCategory> {
  return new Set(exerciseBank().grammar.map((g) => g.category));
}
