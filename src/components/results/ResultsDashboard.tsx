"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBand, formatDate, pad2 } from "@/lib/format";
import { cx, Eyebrow, Spinner } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { useResults } from "./useResults";

const BANDS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

function BandScale({ band }: { band: number | null }) {
  return (
    <div className="mt-6 flex justify-center gap-1" aria-hidden>
      {BANDS.map((b) => (
        <div key={b} className="flex flex-col items-center gap-1">
          <div className={cx("h-1.5 w-6 rounded-full sm:w-8", band !== null && b <= band ? "bg-accent" : "bg-line")} />
          {Number.isInteger(b) && <span className="text-[11px] text-ink-3 tabular">{b}</span>}
        </div>
      ))}
    </div>
  );
}

export function ResultsDashboard({ sessionId }: { sessionId: string }) {
  const { data, error } = useResults(sessionId);
  const [show120, setShow120] = useState(false);

  if (error) return <div className="py-16 text-center text-danger">{error}</div>;
  if (!data) return <div className="flex items-center justify-center gap-2 py-16 text-ink-3"><Spinner /> Loading results…</div>;

  const o = data.overall;
  const notScored = o.status === "not_scored";
  const overallLabel = notScored
    ? "Not scored"
    : o.status === "incomplete"
      ? "Test not finished"
      : o.status === "pending"
        ? "Evaluating responses…"
        : o.allFourSections
          ? "Overall Score"
          : `Overall estimate (${o.sectionsCounted} section${o.sectionsCounted === 1 ? "" : "s"})`;

  const toReview = data.sections.flatMap((x) => x.tasks).filter((t) => t.evaluation?.status === "review").length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/profile" className="text-sm text-ink-2 hover:text-ink">← Profile</Link>
        <span className="text-sm text-ink-3">
          Series {pad2(data.testNumber)} · {data.mode === "real" ? "Real Test Conditions" : "Practice"} · {formatDate(data.completedAt ?? data.createdAt)}
        </span>
      </div>

      {toReview > 0 && (
        <Link
          href={`/results/${sessionId}/speaking`}
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-weak px-5 py-4 hover:border-accent"
        >
          <span>
            <span className="font-semibold">Check your speaking transcripts.</span>{" "}
            <span className="text-ink-2">
              {toReview} spoken answer{toReview === 1 ? " is" : "s are"} waiting: confirm or correct what the speech-to-text heard, then Speaking is scored.
            </span>
          </span>
          <span className="font-medium text-accent">Check transcripts →</span>
        </Link>
      )}

      <section className="mt-6 rounded-xl border border-line bg-surface px-6 py-10 text-center">
        <Eyebrow>Your Results</Eyebrow>
        <div className="mt-4 flex items-center justify-center gap-3">
          {o.status === "pending" && <Spinner className="text-ink-3" />}
          <span className="text-6xl font-semibold tracking-tight tabular">{formatBand(o.band)}</span>
        </div>
        <div className="mt-2 text-[15px] font-medium text-ink-2">{overallLabel}</div>
        {o.cefr && <div className="mt-1 text-sm text-ink-3">CEFR {o.cefr}</div>}
        {notScored ? (
          <p className="mx-auto mt-4 max-w-md rounded-md border border-warn/30 bg-warn-weak px-4 py-3 text-sm text-ink-2">
            As on the real TOEFL iBT, a test is scored only if at least one Reading question, one Listening question,
            one Writing task and one Speaking task are answered. No answer was recorded in: {o.emptySections.join(", ")}.
          </p>
        ) : (
          <BandScale band={o.band} />
        )}
        {o.comparable120 && (
          <div className="mt-6">
            <button className="text-sm text-accent hover:underline" onClick={() => setShow120((v) => !v)} aria-expanded={show120}>
              {show120 ? "Hide" : "Show"} comparable 0–120 score
            </button>
            {show120 && (
              <p className="mt-2 text-[15px]">
                Comparable score <span className="font-semibold tabular">{o.comparable120.score}</span>
                <span className="text-ink-3"> (range {o.comparable120.min}–{o.comparable120.max} on the 0–120 scale)</span>
              </p>
            )}
          </div>
        )}
        <p className="mx-auto mt-6 max-w-lg text-xs leading-relaxed text-ink-3">
          Estimated Practice Score — not an official ETS score. The overall score is the average of the four section scores
          rounded to the nearest half band. During the 2026–2028 transition, ETS score reports also show a comparable 0–120 score.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {data.sections.map((s) => {
          const pending = s.score?.status === "pending";
          return (
            <Link
              key={s.id}
              href={`/results/${sessionId}/${s.id}`}
              className="group flex flex-col rounded-xl border border-line bg-surface p-6 transition-colors hover:border-accent/60"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.08em] text-ink-2">{s.label}</div>
              <div className="my-6 flex items-center justify-center gap-3">
                {pending && <Spinner className="text-ink-3" />}
                <span className="text-5xl font-semibold tabular">{notScored ? "—" : pending ? "…" : formatBand(s.score?.band)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-3">
                  {!s.completed
                    ? "Not completed"
                    : pending
                      ? "Evaluating responses…"
                      : s.stats
                        ? `${s.stats.correct} / ${s.stats.total} correct`
                        : `${s.tasks.filter((t) => t.answered).length} / ${s.tasks.length} responses`}
                  {s.endedBy === "timeout" && " · time expired"}
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-accent">
                  View performance <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      {(data.sections.some((s) => s.id === "reading" || s.id === "listening")) && (
        <p className="mt-6 text-xs leading-relaxed text-ink-3">
          Reading and Listening used a TOEFL-style adaptive simulation (Module 1 → harder or easier Module 2). It approximates the 2026
          multistage design and is not ETS&apos;s proprietary algorithm. Speaking and Writing responses are evaluated by a local AI model.
        </p>
      )}

      <div className="mt-8 flex justify-center">
        <Link href="/series" className="inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-[15px] font-medium hover:bg-surface-2">
          Back to Series
        </Link>
      </div>
    </div>
  );
}
