"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import type { SectionId } from "@/engine/bank/types";
import type { ItemReview, SectionResult } from "@/engine/results/results";
import { formatBand, pad2 } from "@/lib/format";
import { cx, Eyebrow, Spinner, StatusMark } from "@/components/ui/primitives";
import { IconChevronDown } from "@/components/ui/icons";
import { SpeakingEvaluation, WritingEvaluation } from "./EvaluationViews";
import { useResults } from "./useResults";

function QuestionGrid({ items, selected, onSelect }: { items: ItemReview[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {items.map((it) => (
          <button
            key={it.itemId}
            type="button"
            onClick={() => onSelect(it.itemId)}
            aria-pressed={selected === it.itemId}
            aria-label={`Question ${it.number}: ${it.correctness}`}
            className={cx(
              "flex h-11 items-center justify-center gap-1 rounded-md text-sm tabular transition-colors",
              it.correctness === "correct" && "border border-line bg-surface",
              it.correctness === "incorrect" && "border-2 border-danger/60 bg-danger-weak",
              it.correctness === "unanswered" && "border border-dashed border-line-strong bg-surface-2 text-ink-3",
              selected === it.itemId && "ring-2 ring-accent ring-offset-1",
            )}
          >
            <span>{pad2(it.number)}</span>
            <StatusMark status={it.correctness} size={13} />
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1"><StatusMark status="correct" size={13} /> Correct</span>
        <span className="flex items-center gap-1"><StatusMark status="incorrect" size={13} /> Incorrect (bold border)</span>
        <span className="flex items-center gap-1"><StatusMark status="unanswered" size={13} /> Unanswered (dashed)</span>
      </div>
    </div>
  );
}

export function ItemDetail({ it, bookmark }: { it: ItemReview; bookmark?: ReactNode }) {
  const [showContext, setShowContext] = useState(false);
  return (
    <article className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-ink-3">
          Question {it.number} · Module {it.moduleStage}
          {it.moduleStage === 2 && ` (${it.moduleDifficulty === "hard" ? "harder" : "easier"})`}
        </div>
        <div className="flex items-center gap-2">
          <StatusMark status={it.correctness} withLabel />
          {bookmark}
        </div>
      </div>
      <h3 className="mt-3 text-[17px] font-medium leading-snug">{it.question}</h3>
      {it.options && (
        <ul className="mt-3 space-y-1 text-[15px] text-ink-2">
          {it.options.map((o) => <li key={o}>{o}</li>)}
        </ul>
      )}
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Your answer</dt>
          <dd className={cx("mt-1 text-[15px]", it.correctness === "incorrect" && "text-danger")}>{it.yourAnswer ?? <span className="text-ink-3">No answer</span>}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">Correct answer</dt>
          <dd className="mt-1 text-[15px] font-medium text-success">{it.correctAnswer}</dd>
        </div>
      </dl>
      {it.explanation && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-3">Explanation</div>
          <p className="mt-1 text-[15px] leading-relaxed">{it.explanation}</p>
        </div>
      )}
      {it.skill && (
        <div className="mt-4 text-sm">
          <span className="text-ink-3">Skill: </span>
          <span className="rounded border border-line px-1.5 py-0.5 font-medium">{it.skill}</span>
        </div>
      )}
      {(it.context.text || it.context.audio) && (
        <div className="mt-5 border-t border-line pt-4">
          <button className="flex items-center gap-1 text-sm font-medium text-accent" onClick={() => setShowContext((v) => !v)} aria-expanded={showContext}>
            {it.context.audio ? "Recording and transcript" : "Text"}{it.context.title ? `: ${it.context.title}` : ""}
            <IconChevronDown className={cx("transition-transform", showContext && "rotate-180")} />
          </button>
          {showContext && (
            <div className="mt-3 space-y-3">
              {it.context.audio && <audio controls src={it.context.audio} preload="none" className="w-full max-w-md" />}
              {it.context.text && <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{it.context.text}</p>}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ObjectiveReview({ section, mark }: { section: SectionResult; mark: (key: string) => ReactNode }) {
  const firstWrong = section.items.find((i) => i.correctness !== "correct") ?? section.items[0];
  const [selected, setSelected] = useState<string | null>(firstWrong?.itemId ?? null);
  const item = section.items.find((i) => i.itemId === selected);
  if (section.items.length === 0) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Questions</h3>
        <QuestionGrid items={section.items} selected={selected} onSelect={setSelected} />
      </div>
      <div>{item && <ItemDetail key={item.itemId} it={item} bookmark={mark(item.taskKind === "complete_the_words" ? item.taskId : item.itemId)} />}</div>
    </div>
  );
}

function Skills({ section }: { section: SectionResult }) {
  if (section.skills.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">By skill</h3>
      <dl className="space-y-2.5">
        {section.skills.map((s) => (
          <div key={s.skill} className="grid grid-cols-[140px_1fr_60px] items-center gap-3 text-sm">
            <dt>{s.skill}</dt>
            <div className="h-2 rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${(s.correct / s.total) * 100}%` }} /></div>
            <dd className="text-right tabular text-ink-2">{s.correct}/{s.total}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Path({ section }: { section: SectionResult }) {
  const r = section.routing;
  if (!r) return null;
  return (
    <div className="rounded-lg border border-line bg-surface p-5 text-[15px]">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Adaptive path</h3>
      <p>
        Module 1: {r.correct} of {r.total} correct ({Math.round(r.pct * 100)}%). Routed to the{" "}
        <span className="font-semibold">{r.route === "hard" ? "harder" : "easier"} Module 2</span> (threshold {Math.round(r.threshold * 100)}%).
      </p>
      <p className="mt-2 text-xs text-ink-3">
        TOEFL-style simulation of the 2026 multistage design. The easier path caps the maximum estimated score; the harder path raises it.
      </p>
    </div>
  );
}

export function SectionDetail({ sessionId, sectionId }: { sessionId: string; sectionId: SectionId }) {
  const { data, error, retry, confirm } = useResults(sessionId);
  const register = useRegister(sessionId);
  const mark = (key: string) => <BookmarkButton saved={register.isSaved(key)} onToggle={() => void register.toggle(key)} />;
  if (error) return <div className="py-16 text-center text-danger">{error}</div>;
  if (!data) return <div className="flex items-center justify-center gap-2 py-16 text-ink-3"><Spinner /> Loading…</div>;
  const section = data.sections.find((s) => s.id === sectionId);
  if (!section) return <div className="py-16 text-center">This section was not part of the test.</div>;

  const pending = section.score?.status === "pending";
  return (
    <div>
      <Link href={`/results/${sessionId}`} className="text-sm text-ink-2 hover:text-ink">← All results</Link>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <Eyebrow>Series {pad2(data.testNumber)} · Performance</Eyebrow>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{section.label}</h1>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-ink-3">Estimated section score</div>
          <div className="flex items-center justify-end gap-2 text-4xl font-semibold tabular text-accent">
            {pending && <Spinner className="text-ink-3" />}
            {pending ? "…" : formatBand(section.score?.band)}
          </div>
        </div>
      </header>

      {section.stats && (
        <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
          {([["Correct", section.stats.correct], ["Incorrect", section.stats.incorrect], ["Unanswered", section.stats.unanswered]] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-surface px-4 py-3">
              <div className="text-xs text-ink-3">{k}</div>
              <div className="text-2xl font-semibold tabular">{v}</div>
            </div>
          ))}
        </div>
      )}

      {(section.routing || section.skills.length > 0) && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Path section={section} />
          <Skills section={section} />
        </div>
      )}

      {section.items.length > 0 && (
        <section className="mt-8">
          {section.id === "writing" && <h2 className="mb-4 text-lg font-semibold">Build a Sentence</h2>}
          <ObjectiveReview section={section} mark={mark} />
        </section>
      )}

      {section.tasks.map((t) => (
        <section key={t.itemId} className="mt-10 rounded-xl border border-line bg-surface p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-3">Question {t.number}</div>
            {mark(t.itemId)}
          </div>
          <h2 className="mt-1 text-xl font-semibold">{t.title}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t.prompt}</p>
          {t.details.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-ink-3">
              {t.details.map((d) => <li key={d}>{d}</li>)}
            </ul>
          )}
          <div className="mt-6">
            {t.kind === "write_email" || t.kind === "academic_discussion" ? (
              <WritingEvaluation response={t.response.text ?? ""} evaluation={t.evaluation} onRetry={() => retry(t.itemId)} />
            ) : (
              <SpeakingEvaluation
                recordingUrl={t.response.recordingUrl}
                evaluation={t.evaluation}
                onRetry={() => retry(t.itemId)}
                onValidate={(text) => confirm(t.itemId, text)}
              />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
