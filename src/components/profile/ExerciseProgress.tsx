"use client";

import Link from "next/link";
import { useState } from "react";
import { areaOf, KIND_LABEL } from "@/engine/exercises/types";
import type { ExercisesOverview } from "@/server/exercises";
import { formatDate } from "@/lib/format";
import { cx, EmptyState, SectionHeading } from "@/components/ui/primitives";
import { IconArrowRight, IconChevronRight, IconTarget } from "@/components/ui/icons";
import { SectionIcon } from "@/components/ui/sectionIcons";
import { AREAS } from "@/components/exercises/ExercisesHub";
import { LevelBadge, PercentBar } from "@/components/exercises/shared";

function MasterySection({ data }: { data: ExercisesOverview }) {
  const areas = AREAS.map((a) => ({ meta: a, d: data.areas[a.id] }));
  const totals = areas.reduce(
    (t, { d }) => (d.counts ? { mastered: t.mastered + d.counts.mastered, learning: t.learning + d.counts.learning, weak: t.weak + d.counts.weak } : t),
    { mastered: 0, learning: 0, weak: 0 },
  );
  const anyCounts = areas.some(({ d }) => d.counts);
  return (
    <section className="mt-12" aria-label="Exercise mastery">
      <SectionHeading title="Exercise Mastery" action={<Link href="/exercises" className="text-sm text-accent hover:underline">Go to Exercises</Link>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {areas.map(({ meta, d }) => (
            <li key={meta.id}>
              <Link href={`/exercises/${meta.id}`} className="group flex items-center gap-4 px-5 py-4 hover:bg-surface-2/70">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-weak text-accent">
                  <SectionIcon section={meta.id} width={17} height={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{meta.name}</span>
                    {d.level && <LevelBadge level={d.level} muted />}
                  </div>
                  {d.mastery !== null ? (
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="flex-1"><PercentBar value={d.mastery} /></div>
                      <span className="w-10 text-right text-sm font-semibold tabular">{d.mastery}%</span>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm text-ink-3">{d.sessions ? "Being evaluated…" : meta.empty}</p>
                  )}
                </div>
                <IconChevronRight className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="grid content-start gap-3">
          {anyCounts ? (
            <div className="grid grid-cols-3 gap-3">
              {([["Mastered", totals.mastered, "text-success"], ["Learning", totals.learning, "text-accent"], ["Weak", totals.weak, "text-danger"]] as const).map(([label, n, tone]) => (
                <div key={label} className="rounded-lg border border-line bg-surface px-4 py-3">
                  <div className="text-xs text-ink-3">{label}</div>
                  <div className={cx("text-2xl font-semibold tabular", tone)}>{n}</div>
                  <div className="text-xs text-ink-3">items</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="text-xs text-ink-3">Questions to review</div>
              <div className="text-2xl font-semibold tabular">{anyCounts ? data.toReview : "—"}</div>
            </div>
            <div className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="text-xs text-ink-3">Saved mistakes</div>
              <div className="text-2xl font-semibold tabular">{anyCounts ? data.savedMistakes : "—"}</div>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-surface px-4 py-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><IconTarget width={16} height={16} className="text-accent" /> Weak areas</div>
            {data.weakAreas.length === 0 ? (
              <p className="text-sm text-ink-3">{anyCounts ? "No recurring weaknesses yet." : "Weak areas appear after your first sessions."}</p>
            ) : (
              <ul className="space-y-1">
                {data.weakAreas.map((w) => (
                  <li key={w.key}>
                    <Link href={w.href} className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[15px] hover:bg-surface-2">
                      <span className="min-w-0"><span className="font-medium">{w.label}</span> <span className="text-sm text-ink-3">· {w.detail}</span></span>
                      <IconArrowRight className="shrink-0 text-accent opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HistorySection({ data }: { data: ExercisesOverview }) {
  const [all, setAll] = useState(false);
  const items = data.history;
  const shown = all ? items : items.slice(0, 8);
  const groups: { day: string; rows: typeof items }[] = [];
  for (const h of shown) {
    const day = formatDate(h.at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.rows.push(h);
    else groups.push({ day, rows: [h] });
  }
  return (
    <section className="mt-12" aria-label="Exercise history">
      <SectionHeading
        title="Exercise History"
        count={items.length || undefined}
        action={items.length > 8 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-accent hover:underline">{all ? "Show fewer" : `Show all ${items.length}`}</button>
        )}
      />
      {items.length === 0 ? (
        <EmptyState compact title="No exercise sessions yet." text="Your Reading, Spelling, Grammar, Writing and Speaking sessions will be listed here with their mistakes and feedback." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.day}>
              <h3 className="mb-2 text-sm font-medium text-ink-3">{g.day}</h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {g.rows.map((h) => {
                  const s = h.summary;
                  const writing = h.kind === "writing";
                  return (
                    <li key={h.id}>
                      <Link href={`/profile/exercises/${h.id}`} className="group flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3.5 hover:bg-surface-2/70">
                        <span className="flex min-w-0 flex-1 items-center gap-2.5">
                          <SectionIcon section={areaOf(h.kind)} width={16} height={16} className="shrink-0 text-ink-3" />
                          <span className="truncate font-medium">{KIND_LABEL[h.kind]}</span>
                          <LevelBadge level={h.level} muted />
                          {h.status === "failed" && <span className="text-xs text-danger">out of hearts</span>}
                          {h.status === "abandoned" && <span className="text-xs text-ink-3">ended early</span>}
                          {h.status === "active" && <span className="text-xs text-accent">in progress</span>}
                        </span>
                        <span className="text-sm text-ink-2 tabular">
                          {writing ? `${s.answered} response${s.answered === 1 ? "" : "s"}` : s.words ? `${s.words.correct}/${s.words.total} words` : `${s.correct}/${s.answered}`}
                        </span>
                        <span className="w-16 text-right font-semibold tabular">
                          {writing ? (s.averageScore === null ? "…" : `${s.averageScore.toFixed(1)}/6`) : s.percent === null ? "—" : `${s.percent}%`}
                        </span>
                        <span className="w-12 text-right text-sm text-ink-3 tabular">{s.hearts === null ? "" : `♥ ${s.hearts}/${h.maxHearts}`}</span>
                        <IconChevronRight className="shrink-0 text-ink-3" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ExerciseProgress({ data }: { data: ExercisesOverview }) {
  return (
    <>
      <MasterySection data={data} />
      <HistorySection data={data} />
    </>
  );
}
