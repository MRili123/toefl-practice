"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { BackupSummary } from "@/server/backup";
import { formatDate } from "@/lib/format";
import { Button, Modal, SectionHeading, Spinner } from "@/components/ui/primitives";

async function postBackup(file: File, preview: boolean): Promise<BackupSummary> {
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(`/api/backup${preview ? "?preview=1" : ""}`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? "The file could not be read.");
  return body as BackupSummary;
}

/** Move progress between computers with one file; also links to the AI setup page. */
export function DataSection({ onImported }: { onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; summary: BackupSummary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      setPending({ file, summary: await postBackup(file, true) });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const s = await postBackup(pending.file, false);
      setMessage({ ok: true, text: `Imported ${s.new.tests} tests, ${s.new.exerciseSessions} exercise sessions, ${s.new.savedQuestions} saved questions and ${s.new.notes} notes.` });
      setPending(null);
      onImported();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const s = pending?.summary;
  return (
    <section className="mt-12" aria-label="Your data">
      <SectionHeading title="Your data" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-semibold">Move your progress</h3>
          <p className="mt-1 text-sm text-ink-2">
            Export saves your tests, exercises, recordings, saved questions, notes and mistake memory in one file. Import it on another
            computer — nothing already there is deleted.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/backup" download className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-[15px] font-medium text-white hover:bg-accent-hover">
              Export my progress
            </a>
            <Button onClick={() => input.current?.click()}>Import progress…</Button>
            <input ref={input} type="file" accept=".toeflbackup" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
          </div>
          {message && <p className={message.ok ? "mt-3 text-sm text-success" : "mt-3 text-sm text-danger"} role="status">{message.text}</p>}
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="font-semibold">AI and audio setup</h3>
          <p className="mt-1 text-sm text-ink-2">Check the local AI model, speech-to-text and the optional audio key on this computer.</p>
          <Link href="/setup" className="mt-4 inline-flex h-10 items-center rounded-md border border-line-strong px-4 text-[15px] font-medium hover:bg-surface-2">
            Open setup
          </Link>
        </div>
      </div>

      <Modal open={!!pending} onClose={() => !busy && setPending(null)} title="Import progress">
        {s && (
          <div className="p-6">
            <h2 className="text-lg font-semibold">Import this backup?</h2>
            <p className="mt-1 text-sm text-ink-3">Created {formatDate(s.createdAt)}</p>
            <ul className="mt-4 space-y-1 text-[15px]">
              <li>{s.tests} tests <span className="text-ink-3">({s.new.tests} new)</span></li>
              <li>{s.exerciseSessions} exercise sessions <span className="text-ink-3">({s.new.exerciseSessions} new)</span></li>
              <li>{s.savedQuestions} saved questions <span className="text-ink-3">({s.new.savedQuestions} new)</span></li>
              <li>{s.notes} notes <span className="text-ink-3">({s.new.notes} new)</span></li>
              <li>{s.mistakes} remembered mistakes</li>
            </ul>
            <p className="mt-4 text-sm text-ink-2">Everything is merged with what is already on this computer. Nothing is deleted.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={() => void confirm()} disabled={busy}>{busy && <Spinner />} Import</Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
