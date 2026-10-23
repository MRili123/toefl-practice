"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { areaOf, type ExerciseConfig, MASTERY_LABEL, type MasteryStatus } from "@/engine/exercises/types";
import type { ExerciseView } from "@/server/exercises";
import { api } from "@/lib/api";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { Hearts } from "../shared";

export function EndScreen({ view }: { view: ExerciseView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const s = view.summary;
  const area = areaOf(view.kind);
  const writing = view.kind === "writing";
  const reading = view.kind === "reading";
  const failed = view.status === "failed";
  const mistakes = view.attempts.filter((a) => a.correct === false).length;

  const start = async (label: string, config: Partial<ExerciseConfig> & { retryOf?: string }) => {
    setBusy(label);
    setError(null);
    try {
      const v = await api.startExercise(config);
      router.push(`/exercise/${v.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  const sameConfig: Partial<ExerciseConfig> = { ...view.config };

  return (
    <div className="settle mx-auto max-w-2xl">
      <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center sm:px-10 sm:py-10">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
          {failed ? "Out of hearts" : view.status === "abandoned" ? "Session ended early" : "Session finished"}
        </div>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight">Practice Complete</h1>

        {view.score?.newBest && (
          <p className="settle mt-5 rounded-md bg-success-weak px-4 py-2.5 text-[15px] font-medium text-success" role="status">
            New best score! {view.score.previousBest !== null ? `You beat your previous best of ${view.score.previousBest}.` : "Your first spelling score."}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-end justify-center gap-10">
          {view.score && (
            <div>
              <div className="text-sm text-ink-3">Score</div>
              <div className="mt-1 text-5xl font-semibold tabular tracking-tight">
                {view.score.points}<span className="text-2xl text-ink-3"> pt{view.score.points === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-1 text-sm text-ink-3 tabular">1 point per correct answer</div>
            </div>
          )}
          {view.score && (
            <div>
              <div className="text-sm text-ink-3">Best score</div>
              <div className={cx("mt-1 text-4xl font-semibold tabular", view.score.newBest && "text-success")}>{view.score.best}</div>
              <div className="mt-1 text-sm text-ink-3 tabular">
                {view.score.newBest ? "new record" : view.score.points === view.score.best ? "you matched it" : `${view.score.best - view.score.points} below your best`}
              </div>
            </div>
          )}
          <div>
            <div className="text-sm text-ink-3">{writing ? "Estimated Practice Score" : "Exercise Score"}</div>
            <div className="mt-1 text-5xl font-semibold tabular tracking-tight">
              {writing ? (s.averageScore === null ? "—" : <>{s.averageScore.toFixed(1)}<span className="text-2xl text-ink-3"> / 6</span></>) : s.percent === null ? "—" : `${s.percent}%`}
            </div>
            {!writing && (
              <div className="mt-1 text-sm text-ink-3 tabular">
                {s.words ? `${s.words.correct} / ${s.words.total} words correct` : `${s.correct} / ${s.answered} correct`}
                {!view.endless && s.answered < s.total ? ` · ${s.total - s.answered}${reading ? " passages" : ""} not reached` : ""}
              </div>
            )}
            {writing && <div className="mt-1 text-xs text-ink-3">AI estimate — not an official TOEFL score</div>}
          </div>
          {view.endless && (
            <div>
              <div className="text-sm text-ink-3">Level reached</div>
              <div className="mt-1 font-mono text-4xl font-semibold">{s.levelReached ?? "—"}</div>
              <div className="mt-1 text-sm text-ink-3 tabular">{s.answered} question{s.answered === 1 ? "" : "s"}</div>
            </div>
          )}
          {view.hearts !== null && (
            <div className="flex flex-col items-center">
              <div className="text-sm text-ink-3">Hearts</div>
              <div className="mt-2"><Hearts hearts={view.hearts} max={view.maxHearts} /></div>
              <div className="mt-1 text-sm text-ink-3 tabular">{view.hearts} / {view.maxHearts}</div>
            </div>
          )}
        </div>

        {s.pending > 0 && <p className="mt-5 flex items-center justify-center gap-2 text-sm text-ink-3"><Spinner /> {s.pending} response{s.pending === 1 ? " is" : "s are"} still being evaluated.</p>}
        {s.recommendNext && (
          <p className="mt-6 rounded-md bg-success-weak px-4 py-2.5 text-[15px] text-success">
            Strong result — you are ready to try <strong>{s.recommendNext}</strong>.
          </p>
        )}

        {!writing && (
          <dl className="mt-7 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-lg border border-line px-4 py-3">
              <dt className="text-sm text-ink-3">{reading ? "Perfect passages" : "Answered correctly"}</dt>
              <dd className="text-2xl font-semibold tabular">{s.correct}{reading ? <span className="text-base font-normal text-ink-3"> / {s.answered}</span> : null}</dd>
            </div>
            <div className="rounded-lg border border-line px-4 py-3">
              <dt className="text-sm text-ink-3">{area === "spelling" ? "Words to review" : reading ? "Passages to review" : "To review"}</dt>
              <dd className="text-2xl font-semibold tabular">{mistakes}</dd>
            </div>
          </dl>
        )}

        {view.weakItems.length > 0 && (
          <div className="mt-6 text-left">
            <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">{area === "spelling" ? "Weak words" : "To review"}</h2>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {view.weakItems.slice(0, 8).map((w, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[15px]">
                  <span className="min-w-0 truncate">{w.text}</span>
                  <span className={cx("shrink-0 text-xs font-medium", w.status === "weak" ? "text-danger" : "text-warn")}>{MASTERY_LABEL[w.status as MasteryStatus] ?? w.status}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">Saved to your mistake memory — they will come back in your next sessions until you master them.</p>
          </div>
        )}

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {view.attempts.length > 0 && (
            <Link href={`/profile/exercises/${view.id}`} className="inline-flex h-11 items-center justify-center rounded-md border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">
              {mistakes > 0 ? "Review Mistakes" : "Review answers"}
            </Link>
          )}
          {!writing && !view.endless && (
            <Button size="lg" className="h-11" disabled={!!busy} onClick={() => void start("retry", { retryOf: view.id })}>
              {busy === "retry" && <Spinner />} Try Again
            </Button>
          )}
          <Button variant="primary" size="lg" className="h-11" disabled={!!busy} onClick={() => void start("continue", sameConfig)}>
            {busy === "continue" && <Spinner />} {view.endless ? "Practice Again" : "Continue Practice"} <IconArrowRight />
          </Button>
          {s.recommendNext && (
            <Button variant="primary" size="lg" className="h-11" disabled={!!busy} onClick={() => void start("next", { ...sameConfig, level: s.recommendNext! })}>
              {busy === "next" && <Spinner />} Next Level · {s.recommendNext}
            </Button>
          )}
          {!view.endless && (
            <Link href={`/exercises/${area}${view.kind === "speaking-interaction" ? "?mode=interaction" : ""}`} className="inline-flex h-11 items-center justify-center rounded-md px-4 font-medium text-ink-2 hover:bg-black/[0.04]">
              Change Level
            </Link>
          )}
          <Link href="/exercises" className="inline-flex h-11 items-center justify-center rounded-md px-4 font-medium text-ink-2 hover:bg-black/[0.04]">
            Back to Exercises
          </Link>
        </div>
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}
