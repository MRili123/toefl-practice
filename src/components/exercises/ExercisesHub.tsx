"use client";

import Link from "next/link";
import { type ComponentType, type SVGProps, useEffect, useState } from "react";
import type { ExerciseArea } from "@/engine/exercises/types";
import type { AreaOverview, ExercisesOverview } from "@/server/exercises";
import { api } from "@/lib/api";
import { cardInteractive, cx, EmptyState, PageHeader, Spinner } from "@/components/ui/primitives";
import { IconArrowRight, IconDocument, IconGrammar, IconMic, IconPen, IconSpelling } from "@/components/ui/icons";
import { LevelBadge, PercentBar } from "./shared";

export const AREAS: {
  id: ExerciseArea;
  name: string;
  description: string;
  empty: string;
  unit: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  {
    id: "reading",
    name: "Reading",
    description: "Complete the Words: fill in the missing letters of 10 words in short academic paragraphs, at the level you choose.",
    empty: "Complete your first passage to start tracking your reading accuracy.",
    unit: "passage",
    icon: IconDocument,
  },
  {
    id: "spelling",
    name: "Spelling",
    description: "Improve spelling accuracy with vocabulary and sentences commonly useful in academic English and TOEFL preparation.",
    empty: "Start your first spelling session to build your vocabulary mastery.",
    unit: "word",
    icon: IconSpelling,
  },
  {
    id: "grammar",
    name: "Grammar",
    description: "Strengthen grammar, sentence structure, and accuracy through adaptive multiple-choice practice.",
    empty: "Complete your first grammar exercise to identify your strengths and weaknesses.",
    unit: "question",
    icon: IconGrammar,
  },
  {
    id: "writing",
    name: "Writing",
    description: "Practice emails, academic discussions, and structured writing with AI-powered feedback.",
    empty: "Submit your first writing response to receive personalized feedback.",
    unit: "item",
    icon: IconPen,
  },
  {
    id: "speaking",
    name: "Speaking",
    description: "Improve pronunciation, fluency, repetition, and spoken responses with AI evaluation.",
    empty: "Complete your first speaking session to begin tracking your speaking progress.",
    unit: "sentence",
    icon: IconMic,
  },
];

function AreaCard({ meta, data, content }: { meta: (typeof AREAS)[number]; data: AreaOverview; content: number }) {
  const Icon = meta.icon;
  const practiced = data.sessions > 0;
  return (
    <Link href={`/exercises/${meta.id}`} className={cx(cardInteractive, "group flex flex-col p-6")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-weak text-accent">
          <Icon width={22} height={22} />
        </div>
        {data.level && <LevelBadge level={data.level} />}
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{meta.name}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{meta.description}</p>

      <div className="mt-5 flex-1">
        {practiced && data.mastery !== null ? (
          <>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-ink-2">Mastery</span>
              <span className="font-semibold tabular">{data.mastery}%</span>
            </div>
            <PercentBar value={data.mastery} />
            <p className="mt-2 text-sm text-ink-3">
              {data.toReview > 0 ? `${data.toReview} ${meta.unit}${data.toReview === 1 ? "" : "s"} to review` : "Nothing waiting for review"}
              {data.recommended ? ` · ${data.recommended} recommended` : ""}
            </p>
          </>
        ) : practiced ? (
          <p className="text-sm text-ink-3">Your results are being evaluated.</p>
        ) : (
          <p className="text-sm text-ink-3">{content ? meta.empty : "Content for this exercise is not installed yet."}</p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
        <span className="text-xs text-ink-3">{practiced ? `${data.sessions} session${data.sessions === 1 ? "" : "s"}` : "Not started"}</span>
        <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent">
          {practiced ? "Continue practice" : "Start practice"}
          <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export function ExercisesHub() {
  const [data, setData] = useState<ExercisesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.exercises().then(setData, (e) => setError((e as Error).message));
  }, []);

  return (
    <>
      <PageHeader eyebrow="Practise" title="Exercises" description="Adaptive practice that remembers your mistakes and brings them back until you master them." />
      {error ? (
        <EmptyState title="Exercises could not be loaded" text={error} />
      ) : !data ? (
        <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {AREAS.map((a) => (
              <AreaCard key={a.id} meta={a} data={data.areas[a.id]} content={data.content[a.id]} />
            ))}
          </div>
          {data.weakAreas.length > 0 && (
            <section className="mt-10" aria-label="Weak areas">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Focus next</h2>
              <div className="flex flex-wrap gap-2">
                {data.weakAreas.map((w) => (
                  <Link key={w.key} href={w.href} className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-sm hover:border-accent/60">
                    <span className="font-medium">{w.label}</span> <span className="text-ink-3">· {w.detail}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
