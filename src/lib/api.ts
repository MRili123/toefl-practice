import type { ClientAnswer, SessionView } from "@/engine/session/viewTypes";
import type { SessionConfig } from "@/engine/session/types";
import type { ResultsView } from "@/engine/results/results";
import type { AttemptSummary, DashboardTest, ProfileData } from "@/server/service";
import type { RegisterReview } from "@/engine/profile/register";
import type { Note, NoteTag, SavedQuestion } from "@/engine/profile/store";
import type { Course, ExerciseCategory } from "@/engine/content/library";
import type { Cefr, ExerciseConfig, WritingLevels } from "@/engine/exercises/types";
import type { ExercisesOverview, ExerciseView } from "@/server/exercises";
import type { AdminItem, AdminKind } from "@/server/admin/content";
import type { Mistake } from "@/server/admin/mistakes";

export interface AdminSummary {
  content: Record<AdminKind, number>;
  mistakes: { open: number; spelling: number; grammar: number };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "http_error", body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export type SessionAction =
  | { type: "beginSection" }
  | { type: "beginBlock" }
  | { type: "goto"; taskIndex: number }
  | { type: "next" }
  | { type: "submitTask"; taskId: string; advance?: boolean }
  | { type: "checkItem"; itemId: string }
  | { type: "endBlock" }
  | { type: "timeout" }
  | { type: "notes"; text: string }
  | { type: "startQuestion"; itemId: string }
  | { type: "submitQuestion"; itemId: string };

export interface Health {
  ollama: { ok: boolean; model: string; modelInstalled: boolean; error: string | null };
  stt: { ok: boolean; ready: boolean; model: string | null; error: string | null };
}

export const api = {
  dashboard: () => request<{ tests: DashboardTest[]; history: AttemptSummary[] }>("/api/tests"),
  health: () => request<Health>("/api/health"),
  createSession: (testNumber: number, config: Partial<SessionConfig>) =>
    request<{ id: string }>("/api/sessions", json("POST", { testNumber, config })),
  deleteSession: (id: string) => request<void>(`/api/sessions/${id}`, { method: "DELETE" }),
  view: (id: string) => request<SessionView>(`/api/sessions/${id}`),
  saveAnswer: (id: string, itemId: string, answer: Exclude<ClientAnswer, { kind: "recording" }>) =>
    request<{ ok: true }>(`/api/sessions/${id}/answer`, json("PUT", { itemId, answer })),
  action: (id: string, action: SessionAction) => request<SessionView>(`/api/sessions/${id}/action`, json("POST", action)),
  uploadRecording: (id: string, itemId: string, blob: Blob, durationMs: number) => {
    const form = new FormData();
    form.set("itemId", itemId);
    form.set("durationMs", String(Math.round(durationMs)));
    form.set("file", blob, `${itemId}.webm`);
    return request<SessionView>(`/api/sessions/${id}/recording`, { method: "POST", body: form });
  },
  results: (id: string) => request<ResultsView>(`/api/sessions/${id}/results`),
  retryEvaluation: (id: string, itemId: string) =>
    request<{ ok: true }>(`/api/sessions/${id}/evaluations/${encodeURIComponent(itemId)}`, { method: "POST" }),
  /** Validate the (possibly corrected) transcript of a spoken answer, which starts its scoring. */
  confirmTranscript: (id: string, itemId: string, text: string) =>
    request<{ ok: true }>(`/api/sessions/${id}/evaluations/${encodeURIComponent(itemId)}/transcript`, json("POST", { text })),
  profile: () => request<ProfileData>("/api/profile"),
  setName: (name: string) => request<{ ok: true }>("/api/profile", json("PATCH", { name })),
  library: () => request<{ courses: Course[]; exercises: Record<ExerciseCategory, number> }>("/api/library"),
  savedKeys: (sessionId: string) => request<Record<string, string>>(`/api/register?sessionId=${encodeURIComponent(sessionId)}`),
  saveQuestion: (sessionId: string, key: string) => request<SavedQuestion>("/api/register", json("POST", { sessionId, key })),
  removeSaved: (id: string) => request<void>(`/api/register/${id}`, { method: "DELETE" }),
  savedReview: (id: string) => request<RegisterReview>(`/api/register/${id}`),
  createNote: (note: { title: string; body: string; tag: NoteTag }) => request<Note>("/api/notes", json("POST", note)),
  updateNote: (id: string, note: { title: string; body: string; tag: NoteTag }) => request<Note>(`/api/notes/${id}`, json("PATCH", note)),
  deleteNote: (id: string) => request<void>(`/api/notes/${id}`, { method: "DELETE" }),
  exercises: () => request<ExercisesOverview>("/api/exercises"),
  startExercise: (config: Partial<ExerciseConfig> & { retryOf?: string }) => request<ExerciseView>("/api/exercises/sessions", json("POST", config)),
  exercise: (id: string) => request<ExerciseView>(`/api/exercises/sessions/${id}`),
  deleteExercise: (id: string) => request<void>(`/api/exercises/sessions/${id}`, { method: "DELETE" }),
  exerciseAction: (id: string, action: ExerciseAction) =>
    request<ExerciseView | { deleted: true }>(`/api/exercises/sessions/${id}/action`, json("POST", action)),
  /** Series writing: the level of the corrected version of a response, or (with `level`) that text at another level. */
  seriesWritingLevels: (sessionId: string, itemId: string, level?: Cefr) =>
    request<WritingLevels>(`/api/sessions/${sessionId}/evaluations/${itemId}/levels`, json("POST", { level })),
  /** Writing: the level of the improved version, or (with `level`) that text rewritten at another level. */
  writingLevels: (id: string, itemId: string, level?: Cefr) =>
    request<WritingLevels>(`/api/exercises/sessions/${id}/action`, json("POST", { type: "levels", itemId, level })),
  exerciseRecording: (id: string, itemId: string, blob: Blob, durationMs: number) => {
    const form = new FormData();
    form.set("itemId", itemId);
    form.set("durationMs", String(Math.round(durationMs)));
    form.set("file", blob, `${itemId}.webm`);
    return request<ExerciseView>(`/api/exercises/sessions/${id}/recording`, { method: "POST", body: form });
  },
  /** Audio for an exercise item; the server resolves the text, so the answer never reaches the browser. */
  tts: async (sessionId: string, itemId: string): Promise<Blob> => {
    const res = await fetch("/api/tts", { cache: "no-store", ...json("POST", { sessionId, itemId }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body?.error?.code ?? "tts_failed", body?.error?.message ?? "Audio could not be loaded.");
    }
    return res.blob();
  },
  /* ---------- admin ---------- */
  adminSummary: () => request<AdminSummary>("/api/admin/summary"),
  adminItems: (kind: AdminKind) => request<AdminItem[]>(`/api/admin/content/${kind}`),
  adminCreate: (kind: AdminKind, body: unknown) => request<AdminItem>(`/api/admin/content/${kind}`, json("POST", body)),
  adminUpdate: (kind: AdminKind, id: string, body: unknown) => request<AdminItem>(`/api/admin/content/${kind}/${id}`, json("PUT", body)),
  adminDelete: (kind: AdminKind, id: string) => request<void>(`/api/admin/content/${kind}/${id}`, { method: "DELETE" }),
  adminMistakes: () => request<Mistake[]>("/api/admin/mistakes"),
  adminMistakeQuestion: (id: string) => request<Mistake>(`/api/admin/mistakes/${id}/question`, { method: "POST" }),
};

export type ExerciseAction =
  | { type: "answer"; itemId: string; value: string }
  | { type: "writing"; itemId: string; text: string; subject?: string }
  | { type: "next" }
  | { type: "retry"; itemId: string }
  | { type: "transcript"; itemId: string; text: string }
  | { type: "levels"; itemId: string; level?: Cefr }
  | { type: "exit" };
