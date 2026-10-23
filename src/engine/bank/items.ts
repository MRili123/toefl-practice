import type { Module, Skill, Task } from "./types";

export type ScoredKind = "mcq" | "ctw" | "bas" | "essay" | "speech";

export interface ScoredItem {
  id: string;
  taskId: string;
  kind: ScoredKind;
  skill: Skill | null;
}

export function scoredItems(task: Task): ScoredItem[] {
  switch (task.kind) {
    case "complete_the_words":
      return task.blanks.map((b) => ({ id: b.id, taskId: task.id, kind: "ctw", skill: "Vocabulary" }));
    case "daily_life":
    case "academic_passage":
    case "choose_response":
    case "conversation":
    case "announcement":
    case "academic_talk":
      return task.questions.map((q) => ({ id: q.id, taskId: task.id, kind: "mcq", skill: q.skill }));
    case "build_a_sentence":
      return [{ id: task.id, taskId: task.id, kind: "bas", skill: null }];
    case "write_email":
    case "academic_discussion":
      return [{ id: task.id, taskId: task.id, kind: "essay", skill: null }];
    case "listen_and_repeat":
    case "interview":
      return [{ id: task.id, taskId: task.id, kind: "speech", skill: null }];
  }
}

export function moduleItems(mod: Module): ScoredItem[] {
  return mod.tasks.flatMap(scoredItems);
}
