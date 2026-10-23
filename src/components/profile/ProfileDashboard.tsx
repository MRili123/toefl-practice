"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SectionId } from "@/engine/bank/types";
import { SECTION_ORDER } from "@/engine/bank/types";
import type { AttemptSummary, ProfileData, RegisterCard } from "@/server/service";
import { api } from "@/lib/api";
import { formatBand, formatDate, pad2, SECTION_LABEL, SECTION_SHORT } from "@/lib/format";
import {
  Button, cardInteractive, ChipGroup, cx, EmptyState, Modal, PageHeader, RingProgress, SectionHeading, Spinner, StatCard, StatusMark,
} from "@/components/ui/primitives";
import { IconArrowRight, IconBookmark, IconChevronDown, IconClock, IconTrash, IconTrendDown, IconTrendUp } from "@/components/ui/icons";
import { SectionIcon } from "@/components/ui/sectionIcons";
import { LevelRadial } from "./LevelRadial";
import { NotesSection } from "./NotesSection";
import { DataSection } from "./DataSection";
import { ExerciseProgress } from "./ExerciseProgress";
import type { ExercisesOverview } from "@/server/exercises";
import { TASK_LABEL } from "./levels";

function NameEditor({ name, onSave }: { name: string | null; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-sm text-accent hover:underline">
        {name ? "Edit name" : "Add your name"}
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(value).then(() => setEditing(false));
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={60}
        aria-label="Your name"
        className="h-9 rounded-md border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-accent"
      />
      <Button size="sm" variant="primary" type="submit">Save</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  );
}

function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value === 0) return <span className="text-xs text-ink-3">No change</span>;
  const up = value > 0;
  const Icon = up ? IconTrendUp : IconTrendDown;
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-medium tabular", up ? "text-success" : "text-danger")}>
      <Icon width={14} height={14} />
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(1)}
      <span className="sr-only">since the previous test</span>
    </span>
  );
}

function SkillList({ data }: { data: ProfileData }) {
  return (
    <ul className="divide-y divide-line">
      {SECTION_ORDER.map((s) => {
        const k = data.level.skills[s];
        return (
          <li key={s} className="flex items-center gap-4 py-3.5">
            <RingProgress value={k.level === null ? null : k.level / 6} size={40} label={`${SECTION_LABEL[s]} ${k.level ?? "no data"}`}>
              <SectionIcon section={s} width={15} height={15} className="text-ink-2" />
            </RingProgress>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{SECTION_LABEL[s]}</div>
              <div className="text-xs text-ink-3">
                {k.tests ? `${k.tests} test${k.tests === 1 ? "" : "s"}` : "Not enough data"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold tabular">{k.level === null ? "—" : formatBand(k.level)}</div>
              <Trend value={k.trend} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function HowCalculated() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
        How is my level calculated?
        <IconChevronDown className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <p className="mt-2 max-w-prose leading-relaxed text-ink-3">
          Each skill level is a weighted average of your results. Practice tests count most — tests taken in Real Test
          Conditions more than practice mode, and recent tests more than older ones. Exercises and course assessments
          refine the level once they are available, but they cannot establish it on their own, and watching lessons
          never raises it. Your current level is the average of the four skills, rounded to the nearest half band, as ETS
          does. These are estimated practice levels, not official scores.
        </p>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<RegisterCard["status"], string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  unanswered: "Unanswered",
  partial: "Partly correct",
  evaluated: "Evaluated",
  pending: "In progress",
};

function RegisterStatusLabel({ status }: { status: RegisterCard["status"] }) {
  if (status === "correct" || status === "incorrect" || status === "unanswered") return <StatusMark status={status} withLabel />;
  return (
    <span className={cx("text-sm font-medium", status === "partial" ? "text-warn" : status === "evaluated" ? "text-accent" : "text-ink-3")}>
      {STATUS_TEXT[status]}
    </span>
  );
}

const REGISTER_FILTERS = ["reading", "listening", "speaking", "writing", "spelling", "grammar"] as const;
type RegisterFilter = (typeof REGISTER_FILTERS)[number] | "all";

function RegisterSection({ items }: { items: RegisterCard[] }) {
  const [all, setAll] = useState(false);
  const [filter, setFilter] = useState<RegisterFilter>("all");
  const present = REGISTER_FILTERS.filter((f) => items.some((q) => q.section === f));
  const filtered = filter === "all" ? items : items.filter((q) => q.section === filter);
  const shown = all ? filtered : filtered.slice(0, 6);
  return (
    <section className="mt-12">
      <SectionHeading
        title="My Question Register"
        count={items.length || undefined}
        action={filtered.length > 6 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-accent hover:underline">
            {all ? "Show fewer" : `Show all ${filtered.length}`}
          </button>
        )}
      />
      {items.length === 0 ? (
        <EmptyState compact icon={<IconBookmark />} title="No saved questions yet." text="Bookmark difficult questions while practicing to review your mistakes later." />
      ) : (
        <>
          {present.length > 1 && (
            <div className="mb-4">
              <ChipGroup
                label="Filter saved questions"
                value={filter}
                onChange={setFilter}
                options={[{ id: "all" as const, label: "All" }, ...present.map((f) => ({ id: f, label: SECTION_LABEL[f] }))]}
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((q) => (
              <Link key={q.id} href={q.href} className={cx(cardInteractive, "group flex flex-col p-4")}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
                  <SectionIcon section={q.section} width={13} height={13} />
                  {SECTION_LABEL[q.section]} · {TASK_LABEL[q.taskKind] ?? q.taskKind}
                </div>
                <p className="mt-2 line-clamp-3 flex-1 text-[15px] leading-snug">{q.preview}</p>
                <div className="mt-3 text-xs text-ink-3">
                  {q.origin === "exercise" ? "Exercise" : `Series ${pad2(q.testNumber)}`} · {q.numberLabel} · Saved {formatDate(q.savedAt)}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                  <RegisterStatusLabel status={q.status} />
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                    View <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function band(h: AttemptSummary, s: SectionId) {
  const b = h.sectionBands.find((x) => x.id === s);
  if (!b) return "·";
  return b.status === "pending" ? "…" : formatBand(b.band);
}

function overall(h: AttemptSummary) {
  if (h.overall.status === "not_scored") return "Not scored";
  if (h.overall.status === "pending") return "…";
  return formatBand(h.overall.band);
}

function HistorySection({ items, onDelete }: { items: AttemptSummary[]; onDelete: (h: AttemptSummary) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <section className="mt-12">
      <SectionHeading
        title="Test History"
        count={items.length || undefined}
        action={items.length > 8 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-sm text-accent hover:underline">
            {all ? "Show fewer" : `Show all ${items.length}`}
          </button>
        )}
      />
      {items.length === 0 ? (
        <EmptyState compact icon={<IconClock />} title="No tests completed yet." text="Finished tests and their full results will be kept here." />
      ) : (
        <>
          {/* Desktop: compact table */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-[0.06em] text-ink-3">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Test</th>
                  <th className="px-3 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Overall</th>
                  {SECTION_ORDER.map((s) => (
                    <th key={s} className="px-3 py-2.5 text-right font-semibold" title={SECTION_LABEL[s]}>{SECTION_SHORT[s]}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold">Done</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map((h) => (
                  <tr key={h.sessionId} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <div className="font-medium">Series {pad2(h.testNumber)}</div>
                      <div className="text-xs text-ink-3">{h.mode === "real" ? "Real Test Conditions" : "Practice"}</div>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{formatDate(h.completedAt ?? h.createdAt)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular">{overall(h)}</td>
                    {SECTION_ORDER.map((s) => (
                      <td key={s} className="px-3 py-3 text-right tabular text-ink-2">{band(h, s)}</td>
                    ))}
                    <td className="px-3 py-3 text-right tabular text-ink-2">{h.completion}%</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/results/${h.sessionId}`} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                          View results <IconArrowRight />
                        </Link>
                        <button type="button" onClick={() => onDelete(h)} className="text-ink-3 hover:text-danger" aria-label={`Delete Series ${pad2(h.testNumber)} result`}>
                          <IconTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {shown.map((h) => (
              <article key={h.sessionId} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">Series {pad2(h.testNumber)}</div>
                    <div className="text-xs text-ink-3">{formatDate(h.completedAt ?? h.createdAt)} · {h.mode === "real" ? "Real conditions" : "Practice"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold tabular">{overall(h)}</div>
                    <div className="text-xs text-ink-3">Overall</div>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {SECTION_ORDER.map((s) => (
                    <div key={s} className="rounded-md bg-surface-2 py-1.5">
                      <dt className="text-[11px] text-ink-3">{SECTION_LABEL[s]}</dt>
                      <dd className="font-semibold tabular">{band(h, s)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-ink-3">{h.completion}% answered</span>
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={() => onDelete(h)} className="text-ink-3" aria-label={`Delete Series ${pad2(h.testNumber)} result`}>
                      <IconTrash />
                    </button>
                    <Link href={`/results/${h.sessionId}`} className="inline-flex items-center gap-1 font-medium text-accent">
                      View results <IconArrowRight />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function ProfileDashboard() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [exercises, setExercises] = useState<ExercisesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AttemptSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.profile().then(setData, (e) => setError((e as Error).message));
    api.exercises().then(setExercises, () => undefined);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <EmptyState title="Profile could not be loaded" text={error} />;
  if (!data) return <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading your profile…</div>;

  const a = data.activity;
  const anyActivity = a.testsCompleted + a.exercisesCompleted + a.coursesCompleted + a.questionsSaved > 0;
  const missing = data.level.missingSkills.length;

  return (
    <>
      <PageHeader
        eyebrow="Profile"
        title={data.name ? data.name : "Your learning profile"}
        aside={<NameEditor name={data.name} onSave={async (v) => { await api.setName(v); load(); }} />}
      />

      {/* Level 1–2: current level and the four skills */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" aria-label="Current level">
        <div className="rounded-xl border border-line bg-surface px-6 py-8 sm:px-10">
          <LevelRadial level={data.level} />
          {data.level.overall === null && missing < 4 && (
            <p className="mt-2 text-center text-sm text-ink-3">
              Levels are available for {4 - missing} of 4 skills. Complete a test with all four sections to establish your current level.
            </p>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface px-6 py-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Skill levels</h2>
          <SkillList data={data} />
          <HowCalculated />
        </div>
      </section>

      {/* Level 3: learning activity */}
      <section className="mt-12" aria-label="Learning activity">
        <SectionHeading title="Learning activity" />
        {anyActivity ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Tests completed" value={a.testsCompleted} />
            <StatCard label="Exercises completed" value={a.exercisesCompleted} />
            <StatCard label="Courses completed" value={a.coursesCompleted} />
            <StatCard label="Questions saved" value={a.questionsSaved} />
          </div>
        ) : (
          <p className="text-sm text-ink-3">No learning activity yet. Start with a Series test to build your profile.</p>
        )}
      </section>

      {/* Level 4: register */}
      <RegisterSection items={data.register} />

      {/* Level 4b: personal notes */}
      <NotesSection notes={data.notes} onChange={load} />

      {/* Level 5: history */}
      <HistorySection items={data.history} onDelete={setDeleting} />

      {/* Level 6: exercises (mastery, weak areas, history) */}
      {exercises && <ExerciseProgress data={exercises} />}

      {/* Level 7: courses */}
      <section className="mt-12" aria-label="Course progress">
        <SectionHeading title="Course progress" />
        <EmptyState compact title="No courses started yet." text={data.courses.available ? "Browse Courses to start learning." : "Courses will appear in the Courses section once they are added."} />
      </section>

      {/* Level 8: export / import and setup */}
      <DataSection onImported={load} />

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete result">
        {deleting && (
          <div className="p-6">
            <h2 className="text-lg font-semibold">Delete this result?</h2>
            <p className="mt-2 text-[15px] text-ink-2">
              Series {pad2(deleting.testNumber)} from {formatDate(deleting.completedAt ?? deleting.createdAt)} will be removed permanently,
              including its answers, recordings, AI evaluations and saved questions. Your level will be recalculated.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.deleteSession(deleting.sessionId);
                    setDeleting(null);
                    load();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Spinner />} Delete result
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
