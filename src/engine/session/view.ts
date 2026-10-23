import type { BankTest, McqItem, Section, SectionId, Task } from "../bank/types";
import { itemIndex } from "../bank/loader";
import { scoredItems } from "../bank/items";
import { isAdaptive } from "../adaptive/router";
import { TOEFL_2026 } from "../config/toefl2026";
import { answerText, correctAnswerText, explanationOf, gradeItem } from "../evaluation/grade";
import { activeSection, blocksOf, currentModule } from "./session";
import type { Session, StoredAnswer } from "./types";
import type { ClientAnswer, ClientMcq, ClientTask, CurrentView, ItemFeedback, SectionIntro, SessionView } from "./viewTypes";

const mcq = (q: McqItem): ClientMcq => ({ id: q.id, stem: q.stem, highlightText: q.highlightText, options: q.options });

export function sanitizeTask(task: Task, showInterviewPrompt: boolean): ClientTask {
  switch (task.kind) {
    case "complete_the_words":
      return {
        kind: task.kind,
        id: task.id,
        segments: task.segments,
        blanks: task.blanks.map((b) => ({ id: b.id, prefix: b.prefix, letters: b.answer.length })),
      };
    case "daily_life":
      return { ...task, questions: task.questions.map(mcq) };
    case "academic_passage":
      return { kind: task.kind, id: task.id, title: task.title, paragraphs: task.paragraphs, questions: task.questions.map(mcq) };
    case "choose_response":
      return { kind: task.kind, id: task.id, audio: task.audio, image: task.image, questions: task.questions.map(mcq) };
    case "conversation":
    case "announcement":
    case "academic_talk":
      return { kind: task.kind, id: task.id, title: task.title, audio: task.audio, image: task.image, questions: task.questions.map(mcq) };
    case "build_a_sentence":
      return {
        kind: task.kind,
        id: task.id,
        context: task.context,
        speakerName: task.speakerName,
        speakerImage: task.speakerImage,
        speakerLine: task.speakerLine,
        respondentName: task.respondentName,
        respondentImage: task.respondentImage,
        answerPrefix: task.answerPrefix,
        answerSuffix: task.answerSuffix,
        numBlanks: task.numBlanks,
        chunks: task.chunks,
      };
    case "write_email":
      return {
        kind: task.kind,
        id: task.id,
        directions: task.directions,
        situation: task.situation,
        taskInstructions: task.taskInstructions,
        requiredPoints: task.requiredPoints,
        recipient: task.recipient,
        subject: task.subject,
        targetWords: task.targetWords,
      };
    case "academic_discussion":
      return {
        kind: task.kind,
        id: task.id,
        topicIntro: task.topicIntro,
        directions: task.directions,
        professor: task.professor,
        students: task.students,
        targetWords: task.targetWords,
      };
    case "listen_and_repeat":
      return { kind: task.kind, id: task.id, audio: task.audio, responseSeconds: task.responseSeconds, partIndex: task.partIndex };
    case "interview":
      return {
        kind: task.kind,
        id: task.id,
        video: task.video,
        prompt: showInterviewPrompt ? task.prompt : null,
        prepSeconds: task.prepSeconds,
        responseSeconds: task.responseSeconds,
      };
  }
}

export function clientAnswer(a: StoredAnswer): ClientAnswer {
  switch (a.kind) {
    case "mcq":
      return { kind: "mcq", optionId: a.optionId };
    case "text":
      return { kind: "text", value: a.value };
    case "order":
      return { kind: "order", chunks: a.chunks };
    case "essay":
      return { kind: "essay", text: a.text };
    case "recording":
      return { kind: "recording", durationMs: a.durationMs };
  }
}

const TASK_TYPES: Record<SectionId, string[]> = {
  reading: ["Complete the Words", "Read in Daily Life", "Read an Academic Passage"],
  listening: ["Listen and Choose a Response", "Listen to a Conversation", "Listen to an Announcement", "Listen to an Academic Talk"],
  writing: ["Build a Sentence", "Write an Email", "Write for an Academic Discussion"],
  speaking: ["Listen and Repeat", "Take an Interview"],
};

export function sectionIntro(section: Section): SectionIntro {
  return {
    title: TOEFL_2026.sectionLabels[section.id],
    minutes: TOEFL_2026.timing.estimatedMinutes[section.id],
    itemCount: TOEFL_2026.itemCounts[section.id],
    taskTypes: TASK_TYPES[section.id],
    adaptive: isAdaptive(section),
  };
}

function sectionItemTotal(section: Section, modulePath: string[]): number {
  const stage1 = section.modules.find((m) => m.stage === 1)!;
  const stage2 = section.modules.find((m) => modulePath.includes(m.id) && m.stage === 2) ?? section.modules.find((m) => m.stage === 2);
  return [stage1, stage2].filter(Boolean).reduce((n, m) => n + m!.tasks.flatMap(scoredItems).length, 0);
}

export function buildView(s: Session, test: BankTest, now: number): SessionView {
  const st = activeSection(s);
  let current: CurrentView | null = null;

  if (st) {
    const section = test.sections[st.id];
    const mod = currentModule(test, st);
    const idx = itemIndex(s.testNumber);
    const answers: Record<string, ClientAnswer> = {};
    const feedback: Record<string, ItemFeedback> = {};
    const evaluations: CurrentView["evaluations"] = {};
    const itemNumbers: number[] = [];

    if (mod) {
      let n = 1;
      if (mod.stage === 2) {
        n += section.modules.find((m) => m.stage === 1)!.tasks.flatMap(scoredItems).length;
      }
      for (const task of mod.tasks) {
        itemNumbers.push(n);
        const items = scoredItems(task);
        n += items.length;
        const locked = st.lockedTasks.includes(task.id);
        for (const it of items) {
          const a = s.answers[it.id];
          if (a) answers[it.id] = clientAnswer(a);
          const checked = locked || st.lockedItems.includes(it.id);
          // Practice-mode speaking shows each answer's transcript for checking right after recording.
          const speakingCheck = s.config.mode !== "real" && st.id === "speaking";
          if (checked && (s.config.instantCorrection || speakingCheck) && s.evaluations[it.id]) evaluations[it.id] = s.evaluations[it.id];
          if (!(checked && s.config.instantCorrection)) continue;
          const ref = idx.get(it.id)!;
          const correctness = gradeItem(ref, a);
          if (correctness) {
            feedback[it.id] = {
              correctness,
              correctOptionId: ref.mcq?.correctOptionId ?? null,
              yourAnswer: answerText(ref, a),
              correctAnswer: correctAnswerText(ref),
              explanation: explanationOf(ref),
            };
          }
        }
      }
    }

    current = {
      section: st.id,
      status: st.status,
      intro: sectionIntro(section),
      sectionDeadline: st.deadline,
      module: mod
        ? {
            id: mod.id,
            stage: mod.stage,
            stageCount: isAdaptive(section) ? 2 : 1,
            introAudio: mod.introAudio,
            tasks: mod.tasks.map((t) => sanitizeTask(t, s.config.mode === "practice")),
          }
        : null,
      blocks: mod ? blocksOf(st.id, mod) : [],
      blockIndex: st.blockIndex,
      blockStarted: st.blockStarted,
      blockDeadline: st.blockDeadline,
      question: st.question ?? null,
      taskIndex: st.taskIndex,
      lockedTasks: st.lockedTasks,
      lockedItems: st.lockedItems,
      itemNumbers,
      sectionItemTotal: sectionItemTotal(section, st.modulePath),
      speaking: section.speaking ?? null,
      answers,
      feedback,
      evaluations,
      notes: s.notes[st.id] ?? "",
    };
  }

  return {
    id: s.id,
    testNumber: s.testNumber,
    status: s.status,
    config: s.config,
    serverNow: now,
    sections: s.sections.map((x) => ({ id: x.id, status: x.status })),
    current,
  };
}
