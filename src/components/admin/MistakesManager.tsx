"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Cefr, CEFR_LEVELS, GRAMMAR_CATEGORY_LABEL, type GrammarCategory, MASTERY_LABEL, MISTAKE_SOURCE_LABEL, type MistakeSource,
} from "@/engine/exercises/types";
import type { Mistake } from "@/server/admin/mistakes";
import { api } from "@/lib/api";
import { Button, ChipGroup, cx, EmptyState, Modal, Spinner, Toggle } from "@/components/ui/primitives";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { LevelBadge } from "@/components/exercises/shared";
import { inputCls } from "./ItemForm";

const PAGE = 50;
const SOURCES = Object.keys(MISTAKE_SOURCE_LABEL) as MistakeSource[];

function QuestionView({ m, onRetry, busy }: { m: Mistake; onRetry: () => void; busy: boolean }) {
  const q = m.question;
  if (!q) return null;
  if (q.state === "done" && q.item) {
    const item = q.item;
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <LevelBadge level={item.level} muted />
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">{GRAMMAR_CATEGORY_LABEL[item.category]}</span>
          <span className="font-mono text-ink-3">{item.id}</span>
        </div>
        <p className="mt-3 text-lg">{item.stem}</p>
        <ul className="mt-3 space-y-1.5">
          {item.options.map((o, i) => (
            <li key={i} className={cx("flex items-center gap-2 rounded-md border px-3 py-2 text-[15px]", i === item.answer ? "border-success/50 bg-success-weak font-medium text-success" : "border-line")}>
              <span className="w-4 font-mono text-sm">{"ABCD"[i]}</span> {o}
              {i === item.answer && <IconCheck className="ml-auto" width={16} height={16} />}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-2">{item.explanation}</p>
        <p className="mt-4 text-xs text-ink-3">
          This question is in Grammar practice ({m.status ? MASTERY_LABEL[m.status] : "not answered yet"}). It is edited or deleted under Admin → Grammar.
        </p>
      </div>
    );
  }
  if (q.state === "error") {
    return (
      <div>
        <p className="rounded-md bg-danger-weak px-3 py-2 text-sm text-danger">{q.error ?? "The question could not be generated."}</p>
        <Button className="mt-4" variant="primary" onClick={onRetry} disabled={busy}>{busy && <Spinner />} Try again</Button>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[15px] text-ink-2">
      <Spinner /> {q.state === "running" ? "The AI is writing and checking a question for this mistake…" : "Waiting for the AI (other evaluations may run first)…"}
    </p>
  );
}

export function MistakesManager() {
  const [items, setItems] = useState<Mistake[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | "spelling" | "grammar">("all");
  const [source, setSource] = useState<"all" | MistakeSource>("all");
  const [level, setLevel] = useState<"all" | Cefr>("all");
  const [showMastered, setShowMastered] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.adminMistakes().then(setItems, (e) => setError((e as Error).message)), []);
  useEffect(() => {
    void load();
  }, [load]);

  // Refresh while the AI is checking mistakes or generating questions.
  const generating = !!items?.some((m) => m.check === "pending" || (m.question && (m.question.state === "queued" || m.question.state === "running")));
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [generating, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((m) => {
      if (!showMastered && m.mastered) return false;
      if (type !== "all" && m.type !== type) return false;
      if (source !== "all" && m.source !== source) return false;
      if (level !== "all" && m.level !== level) return false;
      return !q || [m.original, m.correction, m.context ?? "", m.explanation ?? "", m.where.label, m.category ?? ""].join(" ").toLowerCase().includes(q);
    });
  }, [items, query, type, source, level, showMastered]);
  const shown = filtered.slice(0, limit);
  const current = items?.find((m) => m.id === open) ?? null;

  const showQuestion = async (m: Mistake) => {
    setOpen(m.id);
    if (m.question?.state === "done" || m.question?.state === "queued" || m.question?.state === "running") return;
    setBusy(true);
    try {
      const updated = await api.adminMistakeQuestion(m.id);
      setItems((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setLimit(PAGE);
  const counts = items ? { total: items.filter((m) => !m.mastered).length, mastered: items.filter((m) => m.mastered).length } : null;

  return (
    <>
      <header className="pb-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><IconArrowLeft /> Admin</Link>
        <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight">Non-mastered mistakes</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-ink-2">
          Every spelling and grammar mistake from your series tests (Reading · Complete the Words, Writing) and from Spelling, Reading and Writing practice.
          The AI checks each one: a spelling mistake adds the word to Spelling practice at the word&apos;s level; a grammar mistake gets its own AI question, with options and a level, in Grammar practice.
          A mistake is mastered once that practice item is.
        </p>
      </header>

      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            placeholder="Search a word, sentence or explanation…"
            aria-label="Search mistakes"
            className={cx(inputCls, "md:flex-1")}
          />
          <select
            className={cx(inputCls, "md:w-56")}
            value={source}
            aria-label="Where the mistake was made"
            onChange={(e) => {
              setSource(e.target.value as typeof source);
              reset();
            }}
          >
            <option value="all">Everywhere</option>
            {SOURCES.map((s) => <option key={s} value={s}>{MISTAKE_SOURCE_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-3">
            <ChipGroup
              label="Mistake type"
              options={[{ id: "all" as const, label: "All mistakes" }, { id: "spelling" as const, label: "Spelling" }, { id: "grammar" as const, label: "Grammar" }]}
              value={type}
              onChange={(v) => {
                setType(v);
                reset();
              }}
            />
            <ChipGroup
              label="Level"
              options={[{ id: "all" as const, label: "All levels" }, ...CEFR_LEVELS.map((l) => ({ id: l, label: l }))]}
              value={level}
              onChange={(v) => {
                setLevel(v);
                reset();
              }}
            />
          </div>
          <Toggle checked={showMastered} onChange={setShowMastered} label="Show mastered" />
        </div>
      </div>

      {error && <p className="mb-3 rounded-md bg-danger-weak px-4 py-2 text-sm text-danger" role="alert">{error}</p>}

      {!items ? (
        !error && <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Collecting your mistakes…</div>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-3 tabular">
            {filtered.length} shown · {counts!.total} not mastered{counts!.mastered ? ` · ${counts!.mastered} mastered` : ""}
          </p>
          {filtered.length === 0 ? (
            <EmptyState compact title={items.length ? "No mistakes match these filters." : "No mistakes recorded yet."} text={items.length ? undefined : "They appear here after your tests and practice sessions."} />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {shown.map((m) => (
                <li key={m.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[16px]">
                      <span className="text-danger line-through decoration-danger/60">{m.original}</span>
                      <span className="text-ink-3">→</span>
                      <span className="font-medium text-success">{m.correction}</span>
                    </div>
                    {m.context && <p className="mt-1 text-sm text-ink-2">“{m.context}”</p>}
                    {m.explanation && <p className="mt-1 text-sm text-ink-3">{m.explanation}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      {m.check === "pending" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-ink-2"><Spinner /> AI is checking: spelling or grammar?</span>
                      ) : (
                        <span
                          className={cx("rounded-full px-2 py-0.5 font-medium", m.type === "spelling" ? "bg-accent-weak text-accent" : "bg-warn-weak text-warn")}
                          title={m.check === "done" ? "Checked by the AI" : undefined}
                        >
                          {m.type === "spelling" ? "Spelling" : "Grammar"}{m.check === "done" ? " · AI-checked" : ""}
                        </span>
                      )}
                      {m.check === "error" && <span className="rounded-full bg-danger-weak px-2 py-0.5 text-danger" title={m.checkError ?? undefined}>AI check failed · retried when you reopen this page</span>}
                      <LevelBadge level={m.level} muted />
                      {m.category && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">{GRAMMAR_CATEGORY_LABEL[m.category as GrammarCategory] ?? m.category}</span>}
                      <Link href={m.where.href} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2 hover:text-accent hover:underline">{m.where.label}</Link>
                      <span className={cx("rounded-full px-2 py-0.5", m.mastered ? "bg-success-weak text-success" : m.status === "weak" ? "bg-danger-weak text-danger" : "bg-surface-2 text-ink-3")}>
                        {m.status ? MASTERY_LABEL[m.status] : m.practiceKey ? "Not practised yet" : m.question ? "No question yet" : m.check === "pending" ? "Waiting for the AI" : "Not in practice"}
                      </span>
                      <span className="text-ink-3">{new Date(m.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    </div>
                  </div>
                  {m.question && (
                    <div className="shrink-0">
                      <Button size="sm" variant={m.question.state === "done" ? "secondary" : m.question.state === "error" ? "danger" : "secondary"} onClick={() => void showQuestion(m)}>
                        {(m.question.state === "queued" || m.question.state === "running") && <Spinner />}
                        Show AI-generated question
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {filtered.length > limit && (
            <div className="mt-4 flex justify-center">
              <Button onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, filtered.length - limit)} more</Button>
            </div>
          )}
        </>
      )}

      <Modal open={!!current} onClose={() => setOpen(null)} title="AI-generated question">
        {current && (
          <div className="p-6">
            <h2 className="text-lg font-semibold">AI-generated question</h2>
            <p className="mt-1 text-sm text-ink-2">
              From your mistake: <span className="text-danger line-through">{current.original}</span> → <span className="font-medium text-success">{current.correction}</span>
            </p>
            <div className="mt-5"><QuestionView m={current} busy={busy} onRetry={() => void showQuestion(current)} /></div>
            <div className="mt-6 flex justify-end"><Button onClick={() => setOpen(null)}>Close</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
