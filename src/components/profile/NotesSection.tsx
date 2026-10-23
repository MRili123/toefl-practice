"use client";

import { useMemo, useState } from "react";
import { type Note, NOTE_TAGS, type NoteTag } from "@/engine/profile/notes";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Button, cardInteractive, ChipGroup, cx, EmptyState, Modal, SectionHeading, Spinner } from "@/components/ui/primitives";
import { IconCheck, IconPen, IconTrash } from "@/components/ui/icons";

const TAG_LABEL: Record<NoteTag, string> = {
  general: "General",
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
  speaking: "Speaking",
  vocabulary: "Vocabulary",
  grammar: "Grammar",
};

type Draft = { id: string | null; title: string; body: string; tag: NoteTag };
const blank = (): Draft => ({ id: null, title: "", body: "", tag: "general" });

/**
 * Opens a note to read and edit. Saving keeps the note open (the list refreshes behind it); the Save button stays
 * disabled until something in the note changes.
 */
function NoteEditor({ initial, onClose, onChanged }: { initial: Draft; onClose: () => void; onChanged: () => void }) {
  const [saved, setSaved] = useState(initial);
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = d.title !== saved.title || d.body !== saved.body || d.tag !== saved.tag;
  const canSave = dirty && d.title.trim().length > 0 && !busy;
  const edit = (patch: Partial<Draft>) => {
    setD({ ...d, ...patch });
    setJustSaved(false);
    setConfirmDiscard(false);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const body = { title: d.title.trim(), body: d.body, tag: d.tag };
      const note = d.id ? await api.updateNote(d.id, body) : await api.createNote(body);
      const next = { id: note.id, title: note.title, body: note.body, tag: note.tag };
      setSaved(next);
      setD(next);
      setJustSaved(true);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteNote(d.id!);
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={d.id ? "Note" : "New note"} dismissable={!dirty} size="lg">
      <form
        className="flex h-full flex-col overflow-y-auto p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-3">{d.id ? "Note" : "New note"}</h2>
          <span className="text-sm" aria-live="polite">
            {dirty ? (
              <span className="text-ink-3">Unsaved changes</span>
            ) : justSaved ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-success"><IconCheck width={15} height={15} /> Saved</span>
            ) : d.id ? (
              <span className="text-ink-3">All changes saved</span>
            ) : null}
          </span>
        </div>

        <label className="sr-only" htmlFor="note-title">Name</label>
        <input
          id="note-title"
          autoFocus={!d.id}
          value={d.title}
          maxLength={100}
          onChange={(e) => edit({ title: e.target.value })}
          placeholder="Name your note, e.g. Linking words for the discussion task"
          className="mt-2 w-full border-0 border-b border-line bg-transparent px-0 pb-2 text-2xl font-semibold outline-none placeholder:font-normal placeholder:text-ink-3 focus:border-accent"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink-2">Topic</span>
          <ChipGroup label="Note topic" options={NOTE_TAGS.map((t) => ({ id: t, label: TAG_LABEL[t] }))} value={d.tag} onChange={(tag) => edit({ tag })} />
        </div>

        <label className="sr-only" htmlFor="note-body">Note</label>
        <textarea
          id="note-body"
          autoFocus={!!d.id}
          value={d.body}
          maxLength={20000}
          onChange={(e) => edit({ body: e.target.value })}
          placeholder="Write anything you want to remember…"
          className="mt-4 min-h-64 w-full flex-1 resize-none rounded-lg border border-line-strong bg-surface px-4 py-3 text-base leading-relaxed outline-none focus:border-accent"
        />
        <div className="mt-1.5 text-right text-xs text-ink-3">{d.body.trim() ? d.body.trim().split(/\s+/).length : 0} words</div>

        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {d.id && (confirmDelete ? (
            <span className="mr-auto flex items-center gap-2 text-sm">
              Delete this note?
              <Button size="sm" variant="danger" type="button" disabled={busy} onClick={() => void remove()}>Delete</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setConfirmDelete(false)}>Keep</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" type="button" className="mr-auto text-ink-3 hover:text-danger" onClick={() => setConfirmDelete(true)}>
              <IconTrash width={16} height={16} /> Delete
            </Button>
          ))}
          {!d.id && <span className="mr-auto" />}
          {confirmDiscard ? (
            <span className="flex items-center gap-2 text-sm">
              Discard changes?
              <Button size="sm" variant="danger" type="button" onClick={onClose}>Discard</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            </span>
          ) : (
            <Button type="button" onClick={() => (dirty ? setConfirmDiscard(true) : onClose())}>{dirty ? "Cancel" : "Close"}</Button>
          )}
          <Button
            variant="primary"
            type="submit"
            disabled={!canSave}
            title={!dirty ? "Nothing to save — change the note first" : d.title.trim() ? "Save (Ctrl+Enter)" : "Give your note a name first"}
          >
            {busy && <Spinner />} Save note
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function NotesSection({ notes, onChange }: { notes: Note[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<NoteTag | "all">("all");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  const usedTags = useMemo(() => NOTE_TAGS.filter((t) => notes.some((n) => n.tag === t)), [notes]);
  const q = query.trim().toLowerCase();
  const filtered = notes.filter(
    (n) => (filter === "all" || n.tag === filter) && (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)),
  );
  const shown = all ? filtered : filtered.slice(0, 6);

  return (
    <section className="mt-12" aria-label="My notes">
      <SectionHeading
        title="My Notes"
        count={notes.length || undefined}
        action={notes.length > 0 && (
          <Button size="sm" variant="primary" onClick={() => setEditing(blank())}>
            <IconPen width={15} height={15} /> New note
          </Button>
        )}
      />

      {notes.length === 0 ? (
        <EmptyState
          compact
          icon={<IconPen />}
          title="No notes yet."
          text="Write down vocabulary, grammar rules, templates or tips, give each note a name, and keep them here."
          action={<Button variant="primary" onClick={() => setEditing(blank())}>Write your first note</Button>}
        />
      ) : (
        <>
          {(notes.length > 6 || usedTags.length > 1) && (
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {usedTags.length > 1 ? (
                <ChipGroup
                  label="Filter notes"
                  options={[{ id: "all" as const, label: "All" }, ...usedTags.map((t) => ({ id: t, label: TAG_LABEL[t] }))]}
                  value={filter}
                  onChange={setFilter}
                />
              ) : <span />}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes"
                aria-label="Search notes"
                className="h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm outline-none focus:border-accent sm:w-56"
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-ink-3">No notes match your search.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setEditing({ id: n.id, title: n.title, body: n.body, tag: n.tag })}
                  className={cx(cardInteractive, "flex flex-col p-4 text-left")}
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">{TAG_LABEL[n.tag]}</span>
                  <span className="mt-1.5 line-clamp-2 font-semibold leading-snug">{n.title}</span>
                  <span className={cx("mt-1.5 line-clamp-3 flex-1 whitespace-pre-line text-sm leading-snug", n.body.trim() ? "text-ink-2" : "italic text-ink-3")}>
                    {n.body.trim() || "Empty note"}
                  </span>
                  <span className="mt-3 border-t border-line pt-3 text-xs text-ink-3">
                    {n.updatedAt > n.createdAt ? "Edited" : "Created"} {formatDate(n.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {filtered.length > 6 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-sm text-accent hover:underline">
              {all ? "Show fewer" : `Show all ${filtered.length}`}
            </button>
          )}
        </>
      )}

      {editing && (
        <NoteEditor
          key={editing.id ?? "new"}
          initial={editing}
          onClose={() => setEditing(null)}
          onChanged={onChange}
        />
      )}
    </section>
  );
}
