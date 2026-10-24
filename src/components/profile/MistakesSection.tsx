"use client";

import Link from "next/link";
import { scrollIntoViewSoon } from "@/lib/scrollIntoViewSoon";
import { useEffect, useMemo, useState } from "react";
import type { Mistake, MistakePractice } from "@/server/admin/mistakes";
import { MISTAKE_SOURCE_LABEL, type MistakeSource } from "@/engine/exercises/types";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { ChipGroup, cx, EmptyState, SectionHeading, Spinner } from "@/components/ui/primitives";
import { IconArrowRight, IconCheck, IconPlus } from "@/components/ui/icons";
import { LevelBadge } from "@/components/exercises/shared";

type TypeFilter = "all" | "spelling" | "grammar";
const PAGE = 10;

/** The sentence with the mistaken words marked, when the mistake appears in it. */
function Context({ text, original }: { text: string; original: string }) {
  const at = text.toLowerCase().indexOf(original.toLowerCase());
  if (at < 0 || !original.trim()) return <>“{text}”</>;
  return (
    <>
      “{text.slice(0, at)}
      <mark className="rounded-sm bg-danger-weak px-0.5 text-danger">{text.slice(at, at + original.length)}</mark>
      {text.slice(at + original.length)}”
    </>
  );
}

/** One line on what the mistake became in practice (the AI's part). */
function PracticeLine({ p }: { p: MistakePractice }) {
  const word = p.word ? <> “{p.word}”</> : null;
  const [tone, text] = ((): [string, React.ReactNode] => {
    if (p.area === "spelling") {
      switch (p.state) {
        case "added": return ["text-success", <>AI added the word{word} to Spelling practice</>];
        case "exists": return ["text-ink-2", <>The word{word} is already in Spelling practice</>];
        case "not-added": return ["text-ink-3", <>Not added to Spelling practice{p.reason ? <> — {p.reason}</> : null}</>];
        case "pending": return ["text-ink-3", <>The AI is checking this mistake…</>];
        default: return ["text-danger", <>The AI check failed{p.reason ? <> — {p.reason}</> : null}</>];
      }
    }
    switch (p.state) {
      case "added": return ["text-success", <>AI wrote a question from this mistake in Grammar practice</>];
      case "pending": return ["text-ink-3", <>The AI is writing a Grammar practice question…</>];
      case "none": return ["text-ink-3", <>No Grammar practice question yet</>];
      // The server's reason already says it (and the button below offers the retry).
      default: return ["text-danger", <>{p.reason?.replace(/\s*Try again\.?$/i, "") || "The AI could not write a question for this mistake."}</>];
    }
  })();
  const icon = p.state === "added" ? <IconPlus width={13} height={13} /> : p.state === "exists" ? <IconCheck width={13} height={13} /> : null;
  return <p className={cx("mt-1.5 inline-flex items-center gap-1 text-xs font-medium", tone)}>{icon}{text}</p>;
}

function MistakeRow({ m, highlight, onGenerate, generating }: { m: Mistake; highlight: boolean; onGenerate: (id: string) => void; generating: boolean }) {
  const canGenerate = m.practice.area === "grammar" && (m.practice.state === "none" || m.practice.state === "error") && !generating;
  const href = `${m.where.href}${m.where.href.includes("?") ? "&" : "?"}back=${encodeURIComponent(m.id)}`;
  return (
    <li id={`mistake-${m.id}`} className={cx("scroll-mt-24 transition-colors", highlight && "bg-accent-weak")}>
      <Link href={href} title={`Open where you made it: ${m.where.label}`} className="flex flex-col gap-2 px-4 py-3.5 hover:bg-surface-2 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] text-danger line-through decoration-danger/60">{m.original}</span>
          <IconArrowRight width={14} height={14} className="text-ink-3" />
          <span className="text-[15px] font-semibold text-success">{m.correction}</span>
          <span className={cx("ml-1 rounded-full px-2 py-0.5 text-xs font-medium", m.type === "spelling" ? "bg-accent-weak text-accent" : "bg-warn-weak text-warn")}>
            {m.type === "spelling" ? "Spelling" : "Grammar"}
          </span>
          <LevelBadge level={m.level} muted />
        </div>
        {m.context && <p className="mt-1 text-sm leading-relaxed text-ink-2"><Context text={m.context} original={m.original} /></p>}
        {m.explanation && <p className="mt-1 text-sm text-ink-3">{m.explanation}</p>}
        <PracticeLine p={generating && m.practice.state !== "added" ? { ...m.practice, state: "pending" } : m.practice} />
      </div>
      <div className="flex shrink-0 flex-row items-center gap-3 text-sm sm:flex-col sm:items-end sm:gap-1">
        <span className="inline-flex items-center gap-1 text-accent">{MISTAKE_SOURCE_LABEL[m.source]} <IconArrowRight width={13} height={13} /></span>
        <span className="text-xs text-ink-3">{formatDate(m.at)}</span>
        {m.mastered ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><IconCheck width={13} height={13} /> Mastered</span>
        ) : (
          <span className="text-xs text-ink-3">Practising</span>
        )}
      </div>
      </Link>
      {canGenerate && (
        <div className="-mt-1.5 px-4 pb-3">
          <button type="button" onClick={() => onGenerate(m.id)} className="text-xs font-medium text-accent hover:underline">
            {m.practice.state === "error" ? "Try again" : "Generate the question now"}
          </button>
        </div>
      )}
    </li>
  );
}

/** Every spelling and grammar mistake you made, with where it came from (series or practice). */
export function MistakesSection() {
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null);
  const [error, setError] = useState(false);
  const [type, setType] = useState<TypeFilter>("all");
  const [source, setSource] = useState<"all" | MistakeSource>("all");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Set<string>>(new Set());

  // Ask the AI for a grammar question, then follow it until it is written (or fails).
  const generate = async (id: string) => {
    setGenerating((g) => new Set(g).add(id));
    const done = (updated: Mistake) => {
      setMistakes((list) => list?.map((x) => (x.id === id ? updated : x)) ?? list);
      if (updated.practice.state !== "pending") setGenerating((g) => { const n = new Set(g); n.delete(id); return n; });
      return updated.practice.state !== "pending";
    };
    try {
      if (done(await api.adminMistakeQuestion(id))) return;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const updated = (await api.adminMistakes()).find((x) => x.id === id);
        if (!updated || done(updated)) return;
      }
    } catch {
      // leave the row as it was; the button comes back
    }
    setGenerating((g) => { const n = new Set(g); n.delete(id); return n; });
  };

  // Coming back from a mistake (/profile#mistake-<id>): show it and scroll to it.
  useEffect(() => {
    api.adminMistakes().then((list) => {
      setMistakes(list);
      const id = decodeURIComponent(location.hash.replace(/^#mistake-/, ""));
      const index = location.hash.startsWith("#mistake-") ? list.findIndex((m) => m.id === id) : -1;
      if (index < 0) return;
      if (index >= PAGE) setAll(true);
      setHighlight(id);
      scrollIntoViewSoon(`mistake-${id}`, "center"); // the rest of the profile is still loading above the list
    }, () => setError(true));
  }, []);

  const sources = useMemo(() => {
    const used = new Set((mistakes ?? []).map((m) => m.source));
    return (Object.keys(MISTAKE_SOURCE_LABEL) as MistakeSource[]).filter((s) => used.has(s));
  }, [mistakes]);
  const q = query.trim().toLowerCase();
  const shown = (mistakes ?? []).filter(
    (m) =>
      (type === "all" || m.type === type) &&
      (source === "all" || m.source === source) &&
      (!q || [m.original, m.correction, m.context ?? ""].some((s) => s.toLowerCase().includes(q))),
  );
  const count = (t: TypeFilter) => (mistakes ?? []).filter((m) => t === "all" || m.type === t).length;

  return (
    <section id="my-mistakes" className="mt-12 scroll-mt-24" aria-label="My mistakes">
      <SectionHeading title="My Mistakes" count={mistakes?.length || undefined} />
      {!mistakes && !error && <div className="flex items-center gap-2 py-8 text-sm text-ink-3"><Spinner /> Loading your mistakes…</div>}
      {error && <p className="text-sm text-danger">Your mistakes could not be loaded.</p>}
      {mistakes && mistakes.length === 0 && (
        <EmptyState compact title="No mistakes yet." text="Spelling and grammar mistakes from the series and from practice will appear here." />
      )}
      {mistakes && mistakes.length > 0 && (
        <>
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <ChipGroup
              label="Mistake type"
              options={[
                { id: "all" as const, label: `All ${count("all")}` },
                { id: "spelling" as const, label: `Spelling ${count("spelling")}` },
                { id: "grammar" as const, label: `Grammar ${count("grammar")}` },
              ]}
              value={type}
              onChange={setType}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search mistakes"
              aria-label="Search mistakes"
              className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent lg:w-56"
            />
          </div>
          {sources.length > 1 && (
            <div className="mb-4">
              <ChipGroup
                label="Where the mistake came from"
                options={[{ id: "all" as const, label: "Everywhere" }, ...sources.map((s) => ({ id: s, label: MISTAKE_SOURCE_LABEL[s] }))]}
                value={source}
                onChange={setSource}
              />
            </div>
          )}
          {shown.length === 0 ? (
            <p className="text-sm text-ink-3">No mistakes match.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
              {(all ? shown : shown.slice(0, PAGE)).map((m) => <MistakeRow key={m.id} m={m} highlight={m.id === highlight} onGenerate={(id) => void generate(id)} generating={generating.has(m.id)} />)}
            </ul>
          )}
          {shown.length > PAGE && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-sm text-accent hover:underline">
              {all ? "Show fewer" : `Show all ${shown.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
