"use client";

import { useEffect, useState } from "react";
import type { DashboardTest } from "@/server/service";
import { api } from "@/lib/api";
import { formatBand, formatDate, pad2, SECTION_LABEL } from "@/lib/format";
import { cardInteractive, cx, EmptyState, PageHeader, ProgressBar, Spinner } from "@/components/ui/primitives";
import { IconArrowRight, IconLayers } from "@/components/ui/icons";
import { SectionIcon } from "@/components/ui/sectionIcons";
import { ConfigModal } from "./ConfigModal";
import { ServiceStatus } from "@/components/shell/ServiceStatus";

function SeriesCard({ t, onOpen }: { t: DashboardTest; onOpen: () => void }) {
  const cta = t.inProgress ? "Continue" : t.attempts > 0 ? "Retake" : "Start";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Series ${pad2(t.number)}. ${t.estDifficulty} difficulty. ${cta}.`}
      className={cx(cardInteractive, "group flex flex-col p-5 text-left")}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Series {pad2(t.number)}</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2" title={`Readability grade ${t.readabilityGrade}, relative to the 20 tests`}>
          {t.estDifficulty}
        </span>
      </div>
      <h3 className="mt-2 text-[17px] font-semibold leading-snug">TOEFL iBT Practice Test {pad2(t.number)}</h3>
      <p className="mt-1 text-sm text-ink-3">1 test · Full exam · ≈ {t.estimatedMinutes} min</p>

      <div className="mt-3 flex gap-1.5" aria-label="Sections">
        {t.sections.map((s) => (
          <span key={s} title={SECTION_LABEL[s]} className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-2">
            <SectionIcon section={s} width={14} height={14} />
            <span className="sr-only">{SECTION_LABEL[s]}</span>
          </span>
        ))}
      </div>

      <div className="mt-5">
        {t.progress !== null ? <ProgressBar value={t.progress} label="Completion of the latest attempt" /> : <p className="text-sm text-ink-3">Not started</p>}
      </div>

      <div className="mt-5 flex items-end justify-between gap-3 border-t border-line pt-4">
        <div className="text-xs leading-relaxed text-ink-3">
          {t.bestBand !== null && (
            <div>
              Best score <span className="text-sm font-semibold text-ink tabular">{formatBand(t.bestBand)}</span>
            </div>
          )}
          {t.lastAttemptAt !== null && <div>Last attempt {formatDate(t.lastAttemptAt)}</div>}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
          {cta} <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

export function SeriesLibrary() {
  const [tests, setTests] = useState<DashboardTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DashboardTest | null>(null);

  useEffect(() => {
    api.dashboard().then((d) => setTests(d.tests), (e) => setError((e as Error).message));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="TOEFL iBT · 2026 format"
        title="Series"
        description="Full-length practice exams in the current TOEFL iBT format, scored on the 1–6 band scale."
        aside={<ServiceStatus />}
      />
      {error && <EmptyState title="Series could not be loaded" text={error} />}
      {!tests && !error && (
        <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading series…</div>
      )}
      {tests && tests.length === 0 && (
        <EmptyState icon={<IconLayers />} title="No Series Yet" text="Your TOEFL practice series will appear here." />
      )}
      {tests && tests.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tests.map((t) => (
            <SeriesCard key={t.number} t={t} onOpen={() => setSelected(t)} />
          ))}
        </div>
      )}
      <ConfigModal key={selected?.number ?? 0} test={selected} onClose={() => setSelected(null)} />
    </>
  );
}
