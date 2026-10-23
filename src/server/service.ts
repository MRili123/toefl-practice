import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { evaluationQueue, markNewEvaluations } from "@/ai/jobs";
import { listTests, loadTest } from "@/engine/bank/loader";
import { SECTION_ORDER, type BankTest, type SectionId } from "@/engine/bank/types";
import { TOEFL_2026 } from "@/engine/config/toefl2026";
import { EngineError } from "@/engine/errors";
import { RECORDINGS_DIR, SESSIONS_DIR } from "@/engine/paths";
import { buildResults, type ResultsView } from "@/engine/results/results";
import { createSession, expire, normalizeConfig } from "@/engine/session/session";
import { sessions } from "@/engine/session/store";
import type { Session, SessionConfig } from "@/engine/session/types";
import { exerciseCounts, type ExerciseCategory, listCourses } from "@/engine/content/library";
import { computeLevels, type Evidence, LEVEL_CONFIG, type LevelSummary } from "@/engine/profile/level";
import { describeQuestion, type RegisterReview, type RegisterStatus, reviewSaved } from "@/engine/profile/register";
import { type Note, NOTE_TAGS, type NoteTag } from "@/engine/profile/notes";
import { profiles, type SavedQuestion } from "@/engine/profile/store";
import { exerciseSessions } from "@/engine/exercises/store";
import { describeExerciseItem, exerciseEvidence, exerciseItemStatus } from "./exercises";
import { requestMistakeSync } from "./admin/mistakes";

function schedule(sessionId: string, ids: string[]) {
  if (ids.length) evaluationQueue.enqueue(sessionId, ids);
}

/** Reads a session, applying any deadlines that passed since the last request. */
export async function readSession(id: string): Promise<{ session: Session; test: BankTest }> {
  void evaluationQueue.recover();
  const s = await sessions.get(id);
  if (!s) throw new EngineError("session_not_found", "Session not found", 404);
  const test = loadTest(s.testNumber);
  const probe = structuredClone(s);
  if (!expire(probe, test, Date.now())) return { session: s, test };
  return { session: await mutateSession(id, () => undefined), test };
}

export async function mutateSession(id: string, fn: (s: Session, test: BankTest, now: number) => void): Promise<Session> {
  void evaluationQueue.recover();
  const { session, result: ids } = await sessions.update(id, (s) => {
    const test = loadTest(s.testNumber);
    const now = Date.now();
    expire(s, test, now);
    fn(s, test, now);
    markNewEvaluations(s, test, now);
    return Object.values(s.evaluations).filter((e) => e.status === "queued").map((e) => e.itemId);
  });
  schedule(id, ids);
  // A finished Reading section's Complete the Words mistakes become spelling practice words.
  if (session.sections.some((st) => st.id === "reading" && st.status === "completed")) requestMistakeSync();
  return session;
}

export async function startSession(testNumber: number, input: Partial<SessionConfig>): Promise<Session> {
  if (!listTests().some((t) => t.number === testNumber)) throw new EngineError("test_not_found", `Test ${testNumber} not found`, 404);
  const s = createSession(randomUUID(), testNumber, normalizeConfig(input), Date.now());
  await sessions.create(s);
  return s;
}

export async function deleteSession(id: string): Promise<void> {
  const s = await sessions.get(id);
  if (!s) throw new EngineError("session_not_found", "Session not found", 404);
  await fs.rm(path.join(SESSIONS_DIR, `${id}.json`), { force: true });
  await fs.rm(path.join(RECORDINGS_DIR, id), { recursive: true, force: true });
  await profiles.update((p) => {
    p.savedQuestions = p.savedQuestions.filter((q) => q.sessionId !== id);
  });
}

export interface AttemptSummary {
  sessionId: string;
  testNumber: number;
  mode: Session["config"]["mode"];
  sections: SectionId[];
  status: Session["status"];
  createdAt: number;
  completedAt: number | null;
  overall: ResultsView["overall"];
  sectionBands: { id: SectionId; band: number | null; status: "final" | "pending" | null }[];
  /** Share of questions/tasks answered across the attempt's sections, 0–100. */
  completion: number;
}

export interface DashboardTest {
  number: number;
  estDifficulty: string;
  readabilityGrade: number;
  sections: SectionId[];
  estimatedMinutes: number;
  inProgress: AttemptSummary | null;
  lastCompleted: AttemptSummary | null;
  attempts: number;
  /** Best final overall band over completed attempts; null if none. */
  bestBand: number | null;
  /** Sections completed in the most recent attempt, 0–100; null without attempts. */
  progress: number | null;
  lastAttemptAt: number | null;
}

function completionOf(r: ResultsView): number {
  let done = 0;
  let total = 0;
  for (const s of r.sections) {
    total += s.items.length + s.tasks.length;
    done += s.items.filter((i) => i.correctness !== "unanswered").length + s.tasks.filter((t) => t.answered).length;
  }
  return total ? Math.round((done / total) * 100) : 0;
}

function summarize(s: Session, r: ResultsView): AttemptSummary {
  return {
    sessionId: s.id,
    testNumber: s.testNumber,
    mode: s.config.mode,
    sections: s.config.sections,
    status: s.status,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    overall: r.overall,
    sectionBands: r.sections.map((x) => ({ id: x.id, band: x.score?.band ?? null, status: x.score?.status ?? null })),
    completion: completionOf(r),
  };
}

async function allAttempts(): Promise<{ session: Session; results: ResultsView; summary: AttemptSummary }[]> {
  void evaluationQueue.recover();
  const all = (await sessions.list()).sort((a, b) => b.createdAt - a.createdAt);
  return all.map((session) => {
    const results = buildResults(session, loadTest(session.testNumber));
    return { session, results, summary: summarize(session, results) };
  });
}

export async function dashboard(): Promise<{ tests: DashboardTest[]; history: AttemptSummary[] }> {
  const attempts = await allAttempts();
  const summaries = attempts.map((a) => a.summary);
  const minutes = SECTION_ORDER.reduce((n, s) => n + TOEFL_2026.timing.estimatedMinutes[s], 0);
  const tests = listTests().map((t) => {
    const mine = attempts.filter((x) => x.session.testNumber === t.number);
    const finals = mine.filter((x) => x.summary.status === "completed" && x.summary.overall.status === "final" && x.summary.overall.band !== null);
    const latest = mine[0];
    return {
      number: t.number,
      estDifficulty: t.estDifficulty,
      readabilityGrade: t.readabilityGrade,
      sections: SECTION_ORDER,
      estimatedMinutes: minutes,
      inProgress: mine.find((x) => x.summary.status === "active")?.summary ?? null,
      lastCompleted: mine.find((x) => x.summary.status === "completed")?.summary ?? null,
      attempts: mine.filter((x) => x.summary.status === "completed").length,
      bestBand: finals.length ? Math.max(...finals.map((x) => x.summary.overall.band!)) : null,
      progress: latest
        ? Math.round((latest.session.sections.filter((st) => st.status === "completed").length / latest.session.sections.length) * 100)
        : null,
      lastAttemptAt: latest ? latest.session.updatedAt : null,
    };
  });
  return { tests, history: summaries.filter((x) => x.status === "completed") };
}

/* ---------- profile ---------- */

function modeReliability(c: SessionConfig): number {
  const r = LEVEL_CONFIG.modeReliability;
  if (c.mode === "real") return r.real;
  return c.timed && !c.instantCorrection ? r.practiceTimed : r.practiceOther;
}

export interface RegisterCard {
  id: string;
  sessionId: string;
  testNumber: number;
  section: SectionId | "spelling" | "grammar";
  origin: "test" | "exercise";
  href: string;
  taskKind: string;
  numberLabel: string;
  preview: string;
  savedAt: number;
  status: RegisterStatus;
}

export interface ProfileData {
  name: string | null;
  level: LevelSummary;
  activity: { testsCompleted: number; exercisesCompleted: number; coursesCompleted: number; questionsSaved: number };
  register: RegisterCard[];
  notes: Note[];
  history: AttemptSummary[];
  courses: { available: number };
  exercises: Record<ExerciseCategory, number>;
}

export async function profileData(): Promise<ProfileData> {
  const [attempts, profile, exerciseList, practice] = await Promise.all([allAttempts(), profiles.get(), exerciseSessions.list(), exerciseEvidence()]);
  const completed = attempts.filter((a) => a.session.status === "completed");

  // Tests are the only evidence source with content today; exercises and course assessments plug in here later.
  const evidence: Evidence[] = [];
  for (const a of completed) {
    if (a.results.overall.status === "not_scored") continue;
    for (const sec of a.results.sections) {
      if (sec.score?.status === "final" && sec.score.band !== null) {
        evidence.push({ skill: sec.id, band: sec.score.band, at: a.session.completedAt ?? a.session.updatedAt, source: "test", reliability: modeReliability(a.session.config) });
      }
    }
  }
  // Writing/Speaking exercises refine a level (weight 0.35) but cannot establish one without a test.
  for (const e of practice) evidence.push({ skill: e.skill, band: e.band, at: e.at, source: "exercise", reliability: 1 });

  const byId = new Map(attempts.map((a) => [a.session.id, a]));
  const exerciseById = new Map(exerciseList.map((s) => [s.id, s]));
  const register = [...profile.savedQuestions]
    .sort((a, b) => b.savedAt - a.savedAt)
    .flatMap((q): RegisterCard[] => {
      if (q.origin === "exercise") {
        const ex = exerciseById.get(q.sessionId);
        if (!ex) return [];
        const n = ex.attempts.findIndex((a) => a.itemId === q.key);
        return [{
          id: q.id, sessionId: q.sessionId, testNumber: 0, section: q.section, taskKind: q.taskKind, numberLabel: q.numberLabel,
          preview: q.preview, savedAt: q.savedAt, status: exerciseItemStatus(ex, q.key), origin: "exercise",
          href: `/profile/exercises/${q.sessionId}${n >= 0 ? `#item-${n + 1}` : ""}`,
        }];
      }
      const a = byId.get(q.sessionId);
      const status = a ? reviewSaved(q, a.session, loadTest(q.testNumber)).status : "pending";
      return [{
        id: q.id, sessionId: q.sessionId, testNumber: q.testNumber, section: q.section, taskKind: q.taskKind, numberLabel: q.numberLabel,
        preview: q.preview, savedAt: q.savedAt, status, origin: "test", href: `/profile/register/${q.id}`,
      }];
    });

  return {
    name: profile.name,
    level: computeLevels(evidence, Date.now()),
    activity: { testsCompleted: completed.length, exercisesCompleted: exerciseList.filter((x) => x.attempts.length > 0 && x.status !== "active").length, coursesCompleted: 0, questionsSaved: register.length },
    register,
    notes: [...profile.notes].sort((a, b) => b.updatedAt - a.updatedAt),
    history: completed.map((a) => a.summary),
    courses: { available: listCourses().length },
    exercises: exerciseCounts(),
  };
}

export async function setProfileName(name: string) {
  const clean = name.trim().slice(0, 60);
  await profiles.update((p) => {
    p.name = clean || null;
  });
}

/* ---------- question register ---------- */

export async function savedKeysForSession(sessionId: string): Promise<Record<string, string>> {
  const p = await profiles.get();
  return Object.fromEntries(p.savedQuestions.filter((q) => q.sessionId === sessionId).map((q) => [q.key, q.id]));
}

export async function saveQuestion(sessionId: string, key: string): Promise<SavedQuestion> {
  const s = await sessions.get(sessionId);
  const exercise = s ? null : await describeExerciseItem(sessionId, key);
  if (!s && !exercise) throw new EngineError("session_not_found", "Session not found", 404);
  const ref = s ? describeQuestion(loadTest(s.testNumber), key) : exercise!;
  const { result } = await profiles.update((p) => {
    const existing = p.savedQuestions.find((q) => q.sessionId === sessionId && q.key === key);
    if (existing) return existing;
    const saved: SavedQuestion = {
      id: randomUUID(), sessionId, testNumber: s?.testNumber ?? 0, key, origin: s ? "test" : "exercise",
      section: ref.section, taskKind: ref.taskKind, numberLabel: ref.numberLabel, preview: ref.preview, savedAt: Date.now(),
    };
    p.savedQuestions.push(saved);
    return saved;
  });
  return result;
}

export async function removeSaved(id: string) {
  await profiles.update((p) => {
    p.savedQuestions = p.savedQuestions.filter((q) => q.id !== id);
  });
}

export async function savedReview(id: string): Promise<RegisterReview> {
  const p = await profiles.get();
  const saved = p.savedQuestions.find((q) => q.id === id);
  if (!saved) throw new EngineError("saved_not_found", "This saved question no longer exists.", 404);
  const s = await sessions.get(saved.sessionId);
  if (!s) throw new EngineError("session_not_found", "The test this question came from was deleted.", 404);
  return reviewSaved(saved, s, loadTest(s.testNumber));
}

/* ---------- notes ---------- */

export interface NoteInput {
  title?: unknown;
  body?: unknown;
  tag?: unknown;
}

function cleanNote(input: NoteInput): { title: string; body: string; tag: NoteTag } {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 100) : "";
  if (!title) throw new EngineError("note_title_required", "Give your note a name.");
  const body = typeof input.body === "string" ? input.body.slice(0, 20000) : "";
  const tag = NOTE_TAGS.includes(input.tag as NoteTag) ? (input.tag as NoteTag) : "general";
  return { title, body, tag };
}

export async function createNote(input: NoteInput): Promise<Note> {
  const fields = cleanNote(input);
  const now = Date.now();
  const note: Note = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
  await profiles.update((p) => {
    p.notes.push(note);
  });
  return note;
}

export async function updateNote(id: string, input: NoteInput): Promise<Note> {
  const fields = cleanNote(input);
  const { result } = await profiles.update((p) => {
    const note = p.notes.find((n) => n.id === id);
    if (!note) throw new EngineError("note_not_found", "This note no longer exists.", 404);
    Object.assign(note, fields, { updatedAt: Date.now() });
    return note;
  });
  return result;
}

export async function deleteNote(id: string) {
  await profiles.update((p) => {
    p.notes = p.notes.filter((n) => n.id !== id);
  });
}
