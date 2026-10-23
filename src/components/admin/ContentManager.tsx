"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Cefr, CEFR_LEVELS, GRAMMAR_CATEGORIES, GRAMMAR_CATEGORY_LABEL, type GrammarCategory, MASTERY_LABEL, SPEAKING_TOPICS,
  TOPIC_LABEL,
} from "@/engine/exercises/types";
import type { AdminItem, AdminKind } from "@/server/admin/content";
import { api } from "@/lib/api";
import { Button, ChipGroup, cx, EmptyState, Modal, Spinner } from "@/components/ui/primitives";
import { IconArrowLeft } from "@/components/ui/icons";
import { LevelBadge } from "@/components/exercises/shared";
import { AREA_META } from "./AdminHome";
import type { AdminArea } from "./areas";
import { inputCls, ItemForm } from "./ItemForm";

const PAGE = 50;
type LevelFilter = "all" | Cefr;

/** All the text of an item, for the search bar. */
function haystack(i: AdminItem): string {
  const parts: string[] = [i.id];
  if ("text" in i) parts.push(i.text);
  if ("title" in i) parts.push(i.title);
  if ("stem" in i) parts.push(i.stem, ...i.options, i.explanation);
  if ("situation" in i) parts.push(i.situation, i.to, ...i.tasks);
  if ("professor" in i) parts.push(i.professor.text, ...i.students.map((s) => s.text));
  if ("prompt" in i) parts.push(i.prompt);
  return parts.join(" ").toLowerCase();
}

/** Reading passage with the words to complete shown as they appear in the test. */
function PassagePreview({ text }: { text: string }) {
  const parts = text.split(/\{([A-Za-z]+)\}/);
  return (
    <p className="text-[15px] leading-relaxed">
      {parts.map((p, n) => {
        if (n % 2 === 0) return <span key={n}>{p}</span>;
        const keep = Math.max(1, Math.floor(p.length / 2));
        return <span key={n} className="rounded bg-accent-weak px-0.5">{p.slice(0, keep)}<span className="text-ink-3 underline decoration-dotted">{p.slice(keep)}</span></span>;
      })}
    </p>
  );
}

function ItemBody({ item }: { item: AdminItem }) {
  switch (item.kind) {
    case "reading":
      return (<><p className="font-medium">{item.title}</p><div className="mt-1 line-clamp-3"><PassagePreview text={item.text} /></div></>);
    case "spelling":
      return <p className={cx("text-[15px]", item.type === "word" && "font-mono")}>{item.text}</p>;
    case "grammar":
      return (
        <>
          <p className="text-[15px]">{item.stem}</p>
          <p className="mt-1 text-sm text-ink-2">
            {item.options.map((o, i) => (
              <span key={i} className={cx("mr-3", i === item.answer && "font-semibold text-success")}>{"ABCD"[i]}. {o}</span>
            ))}
          </p>
        </>
      );
    case "writing":
      return (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">{item.type === "email" ? "Write an Email" : item.type === "discussion" ? "Academic Discussion" : "General Writing"}</p>
          <p className="mt-0.5 line-clamp-2 text-[15px]">{item.type === "email" ? item.situation : item.type === "discussion" ? item.professor.text : item.prompt}</p>
        </>
      );
    case "interaction":
    case "repeat":
      return <p className="text-[15px]">{item.text}</p>;
  }
}

function Tags({ item }: { item: AdminItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <LevelBadge level={item.level} muted />
      {item.origin === "generated" && (
        <span className="rounded-full bg-warn-weak px-2 py-0.5 text-warn">
          {item.kind === "spelling" && item.learnedFrom ? `From your ${item.learnedFrom}` : "AI · from your mistakes"}
        </span>
      )}
      {item.kind === "grammar" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">{GRAMMAR_CATEGORY_LABEL[item.category as GrammarCategory] ?? item.category}</span>}
      {item.kind === "interaction" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">{TOPIC_LABEL[item.topic]}</span>}
      {item.status && (
        <span className={cx("rounded-full px-2 py-0.5", item.status === "mastered" ? "bg-success-weak text-success" : item.status === "weak" ? "bg-danger-weak text-danger" : "bg-accent-weak text-accent")}>
          {MASTERY_LABEL[item.status]}
        </span>
      )}
      {!item.status && item.attempts > 0 && <span className="text-ink-3">used {item.attempts}×</span>}
    </div>
  );
}

export function ContentManager({ area }: { area: AdminArea }) {
  const meta = AREA_META[area];
  const [speakingKind, setSpeakingKind] = useState<"interaction" | "repeat">("interaction");
  const kind: AdminKind = area === "speaking" ? speakingKind : area;
  // The list loaded for each content type (Speaking switches between two).
  const [data, setData] = useState<{ kind: AdminKind; items: AdminItem[] | null; error: string | null } | null>(null);
  const items = data?.kind === kind ? data.items : null;
  const error = data?.kind === kind ? data.error : null;
  const setItems = (fn: (list: AdminItem[] | null) => AdminItem[] | null) => setData((d) => (d && d.kind === kind ? { ...d, items: fn(d.items) } : d));
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [sub, setSub] = useState("all"); // spelling type, writing type, grammar category, speaking topic
  const [origin, setOrigin] = useState<"all" | "bank" | "generated">("all");
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<AdminItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminItems(kind).then(
      (list) => setData({ kind, items: list, error: null }),
      (e) => setData({ kind, items: null, error: (e as Error).message }),
    );
  }, [kind]);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (level !== "all" && i.level !== level) return false;
      if (origin !== "all" && i.origin !== origin) return false;
      if (sub !== "all") {
        if ((i.kind === "spelling" || i.kind === "writing") && i.type !== sub) return false;
        if (i.kind === "grammar" && i.category !== sub) return false;
        if (i.kind === "interaction" && i.topic !== sub) return false;
      }
      return !q || haystack(i).includes(q);
    });
  }, [items, query, level, origin, sub]);
  const shown = filtered.slice(0, limit);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3000);
  };

  const subOptions: { id: string; label: string }[] | null =
    kind === "spelling" ? [{ id: "word", label: "Words" }, { id: "sentence", label: "Sentences" }]
    : kind === "writing" ? [{ id: "email", label: "Email" }, { id: "discussion", label: "Academic Discussion" }, { id: "essay", label: "General Writing" }]
    : kind === "grammar" ? GRAMMAR_CATEGORIES.map((c) => ({ id: c, label: GRAMMAR_CATEGORY_LABEL[c] }))
    : kind === "interaction" ? SPEAKING_TOPICS.map((t) => ({ id: t, label: TOPIC_LABEL[t] }))
    : null;
  const hasGenerated = kind === "spelling" || kind === "grammar";
  const newDefaults = {
    ...(level !== "all" ? { level } : {}),
    ...(sub !== "all" && (kind === "spelling" || kind === "writing") ? { type: sub as "word" } : {}),
    ...(sub !== "all" && kind === "grammar" ? { category: sub } : {}),
    ...(sub !== "all" && kind === "interaction" ? { topic: sub as "education" } : {}),
  };

  return (
    <>
      <header className="pb-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><IconArrowLeft /> Admin</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{meta.name}</h1>
            <p className="mt-1 text-[15px] text-ink-2">{meta.description}</p>
          </div>
          <Button variant="primary" onClick={() => setEditing("new")} disabled={!items}>
            + Add {kind === "reading" ? "passage" : kind === "spelling" ? "word / sentence" : kind === "grammar" ? "question" : kind === "writing" ? "prompt" : kind === "interaction" ? "question" : "sentence"}
          </Button>
        </div>
      </header>

      {area === "speaking" && (
        <div className="mb-4">
          <ChipGroup
            label="Speaking content"
            options={[{ id: "interaction", label: "Interaction Test questions" }, { id: "repeat", label: "Listen & Repeat sentences" }]}
            value={speakingKind}
            onChange={(v) => {
              setSpeakingKind(v);
              setSub("all");
              setLimit(PAGE);
            }}
          />
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search text, options or id…"
            aria-label="Search"
            className={cx(inputCls, "md:flex-1")}
          />
          {subOptions && (
            <select
              className={cx(inputCls, "md:w-60")}
              value={sub}
              aria-label="Filter"
              onChange={(e) => {
                setSub(e.target.value);
                setLimit(PAGE);
              }}
            >
              <option value="all">{kind === "grammar" ? "All categories" : kind === "interaction" ? "All topics" : "All types"}</option>
              {subOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          {hasGenerated && (
            <select className={cx(inputCls, "md:w-52")} value={origin} aria-label="Origin" onChange={(e) => setOrigin(e.target.value as typeof origin)}>
              <option value="all">Built-in and mine</option>
              <option value="bank">Built-in only</option>
              <option value="generated">From my mistakes</option>
            </select>
          )}
        </div>
        <ChipGroup
          label="Level"
          options={[{ id: "all" as LevelFilter, label: "All levels" }, ...CEFR_LEVELS.map((l) => ({ id: l as LevelFilter, label: l }))]}
          value={level}
          onChange={(v) => {
            setLevel(v);
            setLimit(PAGE);
          }}
        />
      </div>

      {notice && <p className="mb-3 rounded-md bg-success-weak px-4 py-2 text-sm text-success" role="status">{notice}</p>}

      {error ? (
        <EmptyState title="Could not load the content" text={error} action={<Button onClick={() => { setData(null); load(); }}>Retry</Button>} />
      ) : !items ? (
        <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading…</div>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-3 tabular">{filtered.length} of {items.length} shown</p>
          {filtered.length === 0 ? (
            <EmptyState compact title="Nothing matches these filters." />
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {shown.map((i) => (
                <li key={i.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-3">{i.id}</span>
                      <Tags item={i} />
                    </div>
                    <ItemBody item={i} />
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" onClick={() => setEditing(i)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-ink-3 hover:text-danger" onClick={() => setDeleting(i)}>Delete</Button>
                  </div>
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

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add item" : "Edit item"} dismissable={false}>
        {editing !== null && (
          <ItemForm
            key={editing === "new" ? `new-${kind}` : editing.id}
            kind={kind}
            item={editing === "new" ? null : editing}
            defaults={newDefaults}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              const isNew = editing === "new";
              setItems((list) => (list ? (isNew ? [saved, ...list] : list.map((x) => (x.id === saved.id ? saved : x))) : list));
              setEditing(null);
              flash(isNew ? `Added ${saved.id}.` : `Saved ${saved.id}.`);
            }}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={() => { setDeleting(null); setDeleteError(null); }} title="Delete item">
        {deleting && (
          <div className="p-6">
            <h2 className="text-lg font-semibold">Delete {deleting.id}?</h2>
            <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3"><ItemBody item={deleting} /></div>
            <p className="mt-3 text-sm text-ink-2">
              It is removed from {deleting.origin === "generated" ? "your mistake memory" : "the exercise content files"}, with its progress and audio. Past sessions that used it show it as unavailable.
            </p>
            {deleteError && <p className="mt-3 rounded-md bg-danger-weak px-3 py-2 text-sm text-danger" role="alert">{deleteError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => { setDeleting(null); setDeleteError(null); }} disabled={busy}>Cancel</Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.adminDelete(kind, deleting.id);
                    setItems((list) => list?.filter((x) => x.id !== deleting.id) ?? null);
                    flash(`Deleted ${deleting.id}.`);
                    setDeleting(null);
                  } catch (e) {
                    setDeleteError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Spinner />} Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
