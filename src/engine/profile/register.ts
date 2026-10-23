import type { BankTest, Module, SectionId, Task, TaskKind } from "../bank/types";
import { itemIndex } from "../bank/loader";
import { scoredItems } from "../bank/items";
import { EngineError } from "../errors";
import { type AiTaskReview, buildResults, type ItemReview } from "../results/results";
import type { Session } from "../session/types";
import type { SavedQuestion } from "./store";

export interface QuestionRef {
  section: SectionId;
  taskKind: TaskKind;
  numberLabel: string;
  /** Safe to show while the test is still running: no answers, transcripts or sentences to repeat. */
  preview: string;
}

const clip = (s: string, n = 140) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n).replace(/\s\S*$/, "") + "…" : t;
};

function firstNumberOf(section: { modules: Module[] }, mod: Module): number {
  return mod.stage === 2 ? section.modules.find((m) => m.stage === 1)!.tasks.flatMap(scoredItems).length + 1 : 1;
}

/** Finds a bookmarkable question (a scored item, or a Complete-the-Words passage by task id). */
export function describeQuestion(test: BankTest, key: string): QuestionRef & { task: Task } {
  for (const section of Object.values(test.sections)) {
    for (const mod of section.modules) {
      let n = firstNumberOf(section, mod);
      for (const task of mod.tasks) {
        const items = scoredItems(task);
        if (task.id === key && task.kind === "complete_the_words") {
          return {
            task, section: section.id, taskKind: task.kind,
            numberLabel: `Questions ${n}–${n + items.length - 1}`,
            preview: clip(`Complete the Words: ${task.segments.map((s, i) => s + (task.blanks[i] ? task.blanks[i].prefix + "___" : "")).join("")}`),
          };
        }
        const idx = items.findIndex((it) => it.id === key);
        if (idx >= 0) {
          const number = `Question ${n + idx}`;
          const base = { task, section: section.id, taskKind: task.kind, numberLabel: number };
          const mcq = itemIndex(test.meta.number).get(key)?.mcq;
          if (mcq) return { ...base, preview: clip(mcq.stem === "Choose the best response." ? "Listen and Choose a Response" : mcq.stem) };
          switch (task.kind) {
            case "build_a_sentence":
              return { ...base, preview: clip(`Build a Sentence — “${task.speakerLine}”`) };
            case "write_email":
              return { ...base, preview: clip(`Write an Email — ${task.situation}`) };
            case "academic_discussion":
              return { ...base, preview: clip(`Academic Discussion — ${task.professor.text}`) };
            case "listen_and_repeat":
              return { ...base, preview: `Listen and Repeat — sentence ${/(\d+)$/.exec(task.id)?.[1] ?? ""}`.trim() };
            case "interview":
              return { ...base, preview: clip(`Take an Interview — ${task.prompt}`) };
            default:
              return { ...base, preview: number };
          }
        }
        n += items.length;
      }
    }
  }
  throw new EngineError("question_not_found", "Question not found in this test.", 404);
}

export type RegisterStatus = "correct" | "incorrect" | "unanswered" | "partial" | "evaluated" | "pending";

export interface RegisterReview {
  saved: SavedQuestion;
  available: boolean;
  status: RegisterStatus;
  items: ItemReview[];
  task: AiTaskReview | null;
}

/** Full review of a saved question — only once its test is finished (answers are never shown mid-test). */
export function reviewSaved(saved: SavedQuestion, session: Session, test: BankTest): RegisterReview {
  if (session.status !== "completed") return { saved, available: false, status: "pending", items: [], task: null };
  const r = buildResults(session, test);
  const section = r.sections.find((s) => s.id === saved.section);
  const items = section?.items.filter((i) => i.itemId === saved.key || i.taskId === saved.key) ?? [];
  const task = section?.tasks.find((t) => t.itemId === saved.key) ?? null;
  let status: RegisterStatus = "pending";
  if (items.length) {
    const correct = items.filter((i) => i.correctness === "correct").length;
    const unanswered = items.filter((i) => i.correctness === "unanswered").length;
    status = correct === items.length ? "correct" : unanswered === items.length ? "unanswered" : correct > 0 ? "partial" : "incorrect";
  } else if (task) {
    status = !task.answered ? "unanswered" : task.evaluation?.status === "done" ? "evaluated" : "pending";
  }
  return { saved, available: true, status, items, task };
}
