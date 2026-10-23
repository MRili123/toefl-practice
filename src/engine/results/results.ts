import type { BankTest, Difficulty, SectionId, Skill, Task } from "../bank/types";
import { getModule, itemIndex } from "../bank/loader";
import { scoredItems } from "../bank/items";
import type { RoutingDecision, Route } from "../adaptive/router";
import { type Band, TOEFL_2026 } from "../config/toefl2026";
import { answerText, correctAnswerText, explanationOf, gradeItem, optionLabel } from "../evaluation/grade";
import type { Correctness } from "../evaluation/objective";
import { cefr, comparable120, overallBand } from "../scoring/concordance";
import { objectiveSectionScore, type SectionScore, speakingSectionScore, writingSectionScore } from "../scoring/section";
import type { EvaluationRecord, SectionState, Session } from "../session/types";

export interface ItemReview {
  number: number;
  itemId: string;
  taskId: string;
  taskKind: Task["kind"];
  moduleStage: 1 | 2;
  moduleDifficulty: Difficulty;
  correctness: Correctness;
  question: string;
  options: string[] | null;
  context: { title: string | null; text: string | null; audio: string | null };
  yourAnswer: string | null;
  correctAnswer: string | null;
  explanation: string | null;
  skill: Skill | null;
}

export interface AiTaskReview {
  number: number;
  itemId: string;
  kind: "write_email" | "academic_discussion" | "listen_and_repeat" | "interview";
  title: string;
  prompt: string;
  details: string[];
  target: string | null;
  response: { text: string | null; recordingUrl: string | null; durationMs: number | null };
  answered: boolean;
  evaluation: EvaluationRecord | null;
}

export interface SectionResult {
  id: SectionId;
  label: string;
  score: SectionScore | null;
  completed: boolean;
  endedBy: SectionState["endedBy"];
  routing: RoutingDecision | null;
  path: { id: string; stage: 1 | 2; difficulty: Difficulty }[];
  stats: { correct: number; incorrect: number; unanswered: number; total: number } | null;
  skills: { skill: Skill; correct: number; total: number }[];
  items: ItemReview[];
  tasks: AiTaskReview[];
}

export interface ResultsView {
  sessionId: string;
  testNumber: number;
  status: Session["status"];
  mode: Session["config"]["mode"];
  createdAt: number;
  completedAt: number | null;
  overall: {
    status: "final" | "pending" | "incomplete" | "not_scored";
    /** Sections with no answered question or task (ETS: the test is then not scored). */
    emptySections: string[];
    band: Band | null;
    sectionsCounted: number;
    allFourSections: boolean;
    comparable120: { score: number; min: number; max: number } | null;
    cefr: string | null;
  };
  sections: SectionResult[];
}

const snippet = (s: string, n: number, fromEnd: boolean) => {
  const t = s.replace(/\s+/g, " ");
  if (t.length <= n) return t;
  return fromEnd ? "…" + t.slice(t.length - n).replace(/^\S*\s/, "") : t.slice(0, n).replace(/\s\S*$/, "") + "…";
};

function taskContext(task: Task): ItemReview["context"] {
  switch (task.kind) {
    case "daily_life":
      return {
        title: task.email?.subject ?? task.title,
        text: task.email?.body ?? task.text ?? task.messages?.map((m) => `${m.sender}: ${m.text}`).join("\n") ?? null,
        audio: null,
      };
    case "academic_passage":
      return { title: task.title, text: task.paragraphs.join("\n\n"), audio: null };
    case "choose_response":
      return { title: "Listen and Choose a Response", text: task.transcript, audio: task.audio };
    case "conversation":
    case "announcement":
    case "academic_talk":
      return { title: task.title, text: task.transcript, audio: task.audio };
    default:
      return { title: null, text: null, audio: null };
  }
}

function evalScore(s: Session, itemId: string, answered: boolean, unansweredScore: number): number | null {
  if (!answered) return unansweredScore;
  const e = s.evaluations[itemId];
  return e?.status === "done" && e.score !== null ? e.score : null;
}

function isAnswered(s: Session, itemId: string): boolean {
  const a = s.answers[itemId];
  return !!a && ((a.kind === "essay" && a.text.trim().length > 0) || a.kind === "recording");
}

export function buildResults(s: Session, test: BankTest): ResultsView {
  const idx = itemIndex(s.testNumber);
  const results: SectionResult[] = s.sections.map((st) => {
    const completed = st.status === "completed";
    const path = st.modulePath.map((id) => getModule(test, st.id, id));
    const items: ItemReview[] = [];
    const tasks: AiTaskReview[] = [];
    const skills = new Map<Skill, { correct: number; total: number }>();
    let n = 1;

    for (const mod of path) {
      for (const task of mod.tasks) {
        for (const it of scoredItems(task)) {
          const number = n++;
          const ref = idx.get(it.id)!;
          const answer = s.answers[it.id];
          const correctness = gradeItem(ref, answer);
          if (correctness !== null) {
            let question = ref.mcq?.stem ?? "";
            if (ref.blank && task.kind === "complete_the_words") {
              // Rebuild the paragraph (other blanks filled in) so the context around this blank reads naturally.
              const i = task.blanks.findIndex((b) => b.id === it.id);
              const before = task.segments.slice(0, i + 1).map((seg, k) => (k < i ? seg + task.blanks[k].fullWord : seg)).join("");
              const after = task.segments.slice(i + 1).map((seg, k) => seg + (task.blanks[i + 1 + k]?.fullWord ?? "")).join("");
              question = `${snippet(before, 70, true)}${ref.blank.prefix}____${snippet(after, 45, false)}`;
            }
            if (task.kind === "build_a_sentence") question = `${task.speakerName}: “${task.speakerLine}”`;
            items.push({
              number,
              itemId: it.id,
              taskId: task.id,
              taskKind: task.kind,
              moduleStage: mod.stage,
              moduleDifficulty: mod.difficulty,
              correctness,
              question,
              options: ref.mcq ? ref.mcq.options.map((o) => optionLabel(ref, o.id)) : null,
              context: taskContext(task),
              yourAnswer: answerText(ref, answer),
              correctAnswer: correctAnswerText(ref),
              explanation: explanationOf(ref),
              skill: it.skill,
            });
            if (it.skill) {
              const agg = skills.get(it.skill) ?? { correct: 0, total: 0 };
              agg.total++;
              if (correctness === "correct") agg.correct++;
              skills.set(it.skill, agg);
            }
            continue;
          }
          const answered = isAnswered(s, it.id);
          const rec = answer?.kind === "recording" ? answer : null;
          const base = {
            number,
            itemId: it.id,
            answered,
            evaluation: s.evaluations[it.id] ?? null,
            response: {
              text: answer?.kind === "essay" ? answer.text : null,
              recordingUrl: rec ? `/api/recordings/${s.id}/${encodeURIComponent(it.id)}` : null,
              durationMs: rec ? rec.durationMs : null,
            },
          };
          if (task.kind === "write_email") {
            tasks.push({
              ...base, kind: task.kind, title: "Write an Email", prompt: task.situation,
              details: [`To: ${task.recipient}`, `Subject: ${task.subject}`, ...task.requiredPoints], target: null,
            });
          } else if (task.kind === "academic_discussion") {
            tasks.push({
              ...base, kind: task.kind, title: "Write for an Academic Discussion", prompt: task.professor.text,
              details: task.students.map((x) => `${x.name}: ${x.text}`), target: null,
            });
          } else if (task.kind === "listen_and_repeat") {
            tasks.push({ ...base, kind: task.kind, title: "Listen and Repeat", prompt: "Repeat the sentence you heard.", details: [], target: task.sentence });
          } else if (task.kind === "interview") {
            tasks.push({ ...base, kind: task.kind, title: "Take an Interview", prompt: task.prompt, details: [], target: null });
          }
        }
      }
    }

    let score: SectionScore | null = null;
    let stats: SectionResult["stats"] = null;
    if (items.length > 0) {
      const correct = items.filter((i) => i.correctness === "correct").length;
      const unanswered = items.filter((i) => i.correctness === "unanswered").length;
      stats = { correct, unanswered, incorrect: items.length - correct - unanswered, total: items.length };
    }
    if (completed) {
      if (st.id === "reading" || st.id === "listening") {
        const route: Route = st.routing?.route ?? "easy";
        score = objectiveSectionScore(st.id, stats?.correct ?? 0, stats?.total ?? 0, route);
      } else if (st.id === "writing") {
        const find = (k: string) => tasks.find((t) => t.kind === k);
        const email = find("write_email");
        const disc = find("academic_discussion");
        score = writingSectionScore({
          basCorrect: stats?.correct ?? 0,
          basTotal: stats?.total ?? 0,
          email: email ? evalScore(s, email.itemId, email.answered, 0) : 0,
          discussion: disc ? evalScore(s, disc.itemId, disc.answered, 0) : 0,
        });
      } else {
        score = speakingSectionScore({
          listenAndRepeat: tasks.filter((t) => t.kind === "listen_and_repeat").map((t) => evalScore(s, t.itemId, t.answered, 0)),
          interview: tasks.filter((t) => t.kind === "interview").map((t) => evalScore(s, t.itemId, t.answered, 0)),
        });
      }
    }

    return {
      id: st.id,
      label: TOEFL_2026.sectionLabels[st.id],
      score,
      completed,
      endedBy: st.endedBy,
      routing: st.routing,
      path: path.map((m) => ({ id: m.id, stage: m.stage, difficulty: m.difficulty })),
      stats,
      skills: [...skills.entries()].map(([skill, v]) => ({ skill, ...v })).sort((a, b) => b.total - a.total),
      items,
      tasks,
    };
  });

  const scores = results.map((r) => r.score);
  const pending = scores.some((x) => x?.status === "pending");
  const incomplete = s.status !== "completed" || scores.some((x) => x === null);
  const allFour = s.config.sections.length === 4;
  // ETS: without at least one Reading question, one Listening question, one Speaking task and one
  // Writing task, the test is not scored.
  const emptySections = results.filter(
    (r) => !r.items.some((i) => i.correctness !== "unanswered") && !r.tasks.some((t) => t.answered),
  );
  const notScored = allFour && !incomplete && emptySections.length > 0;
  const bands = scores.filter((x): x is SectionScore => !!x && x.band !== null).map((x) => x.band!);
  const band = pending || incomplete || notScored ? null : overallBand(bands);

  return {
    sessionId: s.id,
    testNumber: s.testNumber,
    status: s.status,
    mode: s.config.mode,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    overall: {
      status: incomplete ? "incomplete" : notScored ? "not_scored" : pending ? "pending" : "final",
      band,
      sectionsCounted: bands.length,
      allFourSections: allFour,
      comparable120: band !== null && allFour ? comparable120(band) : null,
      cefr: band !== null ? cefr(band) : null,
      emptySections: notScored ? emptySections.map((r) => r.label) : [],
    },
    sections: results,
  };
}
