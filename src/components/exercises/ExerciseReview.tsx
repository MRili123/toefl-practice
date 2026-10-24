"use client";

import Link from "next/link";
import { scrollIntoViewSoon } from "@/lib/scrollIntoViewSoon";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type GrammarQuestion, KIND_LABEL, type ReadingPassage, type SpellingItem, type WritingPrompt } from "@/engine/exercises/types";
import type { ExerciseView, RevealedAttempt } from "@/server/exercises";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button, cx, EmptyState, Modal, Spinner } from "@/components/ui/primitives";
import { IconArrowLeft } from "@/components/ui/icons";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import { BackToMistakes } from "@/components/profile/BackToMistakes";
import {
  GrammarExplanation, GrammarOptions, GrammarStem, RepeatFeedbackView, SpeakingFeedbackView, SpellingFeedbackView,
  WritingEvaluationView,
} from "./feedback";
import { subtitleOf } from "./player/ExercisePlayer";
import { passageFromFeedback, ReadingPassageView } from "./player/ReadingPlayer";
import { PromptPanel } from "./player/WritingPlayer";
import { Hearts, LevelBadge } from "./shared";

function StatusTag({ a }: { a: RevealedAttempt }) {
  if (a.ai && a.ai.stage !== "done") {
    return <span className="text-sm text-ink-3">{a.ai.stage === "error" ? "Evaluation failed" : "Evaluating…"}</span>;
  }
  if (a.correct === null) return a.feedback && "score" in a.feedback ? <span className="text-sm font-medium tabular">{a.feedback.score.toFixed(1)} / 6</span> : null;
  if (a.feedback?.kind === "reading") {
    return <span className={cx("text-sm font-medium tabular", a.correct ? "text-success" : "text-danger")}>{a.feedback.correct} / {a.feedback.total} words{a.feedback.timedOut ? " · time up" : ""}</span>;
  }
  return <span className={cx("text-sm font-medium", a.correct ? "text-success" : "text-danger")}>{a.correct ? "Correct" : a.heartLost ? "Incorrect · ♥ lost" : "Incorrect"}</span>;
}

function AttemptCard({ view, a, bookmark, focused }: { view: ExerciseView; a: RevealedAttempt; bookmark: React.ReactNode; focused?: boolean }) {
  const recordingUrl = a.answer && view.kind.startsWith("speaking") ? `/api/exercises/recordings/${view.id}/${a.answer}` : null;
  return (
    <article id={`item-${a.number}`} className={cx("scroll-mt-24 rounded-xl border border-line bg-surface p-5 sm:p-6", focused && "ring-2 ring-accent ring-offset-4 ring-offset-bg")}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <span className="font-semibold text-ink tabular">{a.number}.</span>
          <LevelBadge level={a.level} muted />
        </div>
        <div className="flex items-center gap-2"><StatusTag a={a} />{bookmark}</div>
      </header>

      {a.feedback?.kind === "reading" && a.detail && (
        <>
          <p className="mb-3 text-sm font-medium">{(a.detail as ReadingPassage).title}</p>
          <ReadingPassageView {...passageFromFeedback(a.itemId, a.feedback, (a.detail as ReadingPassage).segments)} feedback={a.feedback} />
        </>
      )}
      {a.feedback?.kind === "spelling" && (
        <>
          <p className="mb-3 text-sm text-ink-3">{(a.detail as SpellingItem | null)?.type === "sentence" ? "Dictation sentence" : "Dictation word"}</p>
          <SpellingFeedbackView fb={a.feedback} correct={a.correct === true} />
        </>
      )}
      {a.feedback?.kind === "grammar" && a.detail && (
        <div className="space-y-4">
          <GrammarStem stem={(a.detail as GrammarQuestion).stem} />
          <GrammarOptions options={(a.detail as GrammarQuestion).options} selected={Number(a.answer)} feedback={a.feedback} />
          <GrammarExplanation fb={a.feedback} />
        </div>
      )}
      {view.kind === "writing" && a.detail && (
        <div className="space-y-6">
          <details className="rounded-lg border border-line bg-surface-2 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Prompt</summary>
            <div className="mt-3"><PromptPanel prompt={a.detail as WritingPrompt} /></div>
          </details>
          {a.feedback?.kind === "writing" ? (
            <WritingEvaluationView fb={a.feedback} text={a.answer ?? ""} subject={a.subject} levels={{ sessionId: view.id, itemId: a.itemId, initial: a.levels }} />
          ) : (
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{a.answer}</div>
          )}
        </div>
      )}
      {view.kind === "speaking-interaction" && (
        <div className="space-y-5">
          <p className="text-lg font-medium">{a.prompt}</p>
          {a.feedback?.kind === "speaking" ? <SpeakingFeedbackView fb={a.feedback} recordingUrl={recordingUrl} levels={{ sessionId: view.id, itemId: a.itemId, initial: a.levels }} /> : recordingUrl && <audio controls src={recordingUrl} className="w-full max-w-xs" />}
        </div>
      )}
      {view.kind === "speaking-repeat" && (
        a.feedback?.kind === "repeat" ? <RepeatFeedbackView fb={a.feedback} recordingUrl={recordingUrl} /> : <p className="text-lg">{a.prompt}</p>
      )}
      {a.transcriptEdited && a.stt && (
        <p className="mt-3 text-xs text-ink-3">Transcript corrected by you before scoring. Speech-to-text heard: <span className="italic">“{a.stt.text || "(nothing)"}”</span></p>
      )}
      {a.ai?.stage === "error" && <p className="mt-3 text-sm text-danger">{a.ai.error}</p>}
    </article>
  );
}

/** `focus`: the answer number to scroll to (a link from My Mistakes). */
export function ExerciseReview({ id, focus, backTo }: { id: string; focus?: number; backTo?: string }) {
  const router = useRouter();
  const [view, setView] = useState<ExerciseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mistakes">("all");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const reg = useRegister(id);

  useEffect(() => {
    api.exercise(id).then((v) => {
      setView(v);
      const target = focus ? v.attempts.find((a) => a.number === focus) : undefined;
      // Show only the mistakes, unless the answer we were sent to is not one of them.
      if (v.attempts.some((a) => a.correct === false) && (!target || target.correct === false)) setFilter("mistakes");
    }, (e) => setError((e as Error).message));
  }, [id, focus]);

  const loaded = !!view;
  useEffect(() => {
    if (loaded && focus) scrollIntoViewSoon(`item-${focus}`);
  }, [loaded, focus]);

  if (error) return <EmptyState title="This practice session could not be loaded" text={error} action={<Link href="/profile" className="text-accent hover:underline">Back to Profile</Link>} />;
  if (!view) return <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading…</div>;

  const s = view.summary;
  const mistakes = view.attempts.filter((a) => a.correct === false);
  const shown = filter === "mistakes" ? mistakes : view.attempts;

  return (
    <>
      <header className="pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/profile" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><IconArrowLeft /> Profile</Link>
          {backTo && <BackToMistakes mistakeId={backTo} />}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-ink-3">
              {formatDate(view.completedAt ?? view.createdAt)} <LevelBadge level={view.config.level} muted /> {view.config.progressive && "· progressive"}
            </div>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight">{KIND_LABEL[view.kind]}</h1>
            {subtitleOf(view) && <p className="mt-1 text-[15px] text-ink-2">{subtitleOf(view)}</p>}
          </div>
          <div className="flex items-center gap-8">
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">{view.kind === "writing" ? "Estimated score" : "Exercise score"}</div>
              <div className="text-3xl font-semibold tabular">
                {view.kind === "writing" ? (s.averageScore === null ? "—" : `${s.averageScore.toFixed(1)} / 6`) : s.percent === null ? "—" : `${s.percent}%`}
              </div>
              {view.kind !== "writing" && <div className="text-sm text-ink-3 tabular">{s.words ? `${s.words.correct}/${s.words.total} words correct` : `${s.correct}/${s.answered} correct`}</div>}
            </div>
            {view.hearts !== null && <Hearts hearts={view.hearts} max={view.maxHearts} />}
          </div>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {mistakes.length > 0 && view.kind !== "writing" ? (
          <div role="tablist" className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
            {(["mistakes", "all"] as const).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cx("rounded-md px-3 py-1.5", filter === f ? "bg-accent text-white" : "text-ink-2 hover:bg-surface-2")}>
                {f === "mistakes" ? `Mistakes (${mistakes.length})` : `All answers (${view.attempts.length})`}
              </button>
            ))}
          </div>
        ) : <span />}
        <Button size="sm" variant="ghost" className="text-ink-3 hover:text-danger" onClick={() => setConfirm(true)}>Delete this session</Button>
      </div>

      {view.attempts.length === 0 ? (
        <EmptyState compact title="No answers in this session." />
      ) : (
        <div className="space-y-4">
          {shown.map((a) => (
            <AttemptCard key={`${a.itemId}-${a.number}`} view={view} a={a} focused={a.number === focus} bookmark={<BookmarkButton saved={reg.isSaved(a.itemId)} onToggle={() => void reg.toggle(a.itemId)} />} />
          ))}
        </div>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete session">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Delete this practice session?</h2>
          <p className="mt-2 text-[15px] text-ink-2">The session and its recordings are removed from your history. Your mistake memory and mastery progress are kept.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setConfirm(false)} disabled={busy}>Cancel</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.deleteExercise(id);
                  router.push("/profile");
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              {busy && <Spinner />} Delete
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
