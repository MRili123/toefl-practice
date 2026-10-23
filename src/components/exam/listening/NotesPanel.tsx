"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/primitives";
import { IconNote } from "@/components/ui/icons";

/** Scratch notes for the section; saved to the session so they survive a refresh. */
export function NotesPanel({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const change = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveRef.current(v), 800);
  };

  return (
    <div className="fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2 sm:right-6">
      {open && (
        <div className="w-[min(340px,calc(100vw-32px))] rounded-lg border border-line bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between border-b border-line px-3 py-2 text-sm font-medium">
            Notes
            <span className="text-xs font-normal text-ink-3">Not scored</span>
          </div>
          <textarea
            value={text}
            onChange={(e) => change(e.target.value)}
            rows={9}
            className="block w-full resize-none bg-surface px-3 py-2 text-[15px] outline-none"
            placeholder="Take notes while you listen…"
            aria-label="Notes"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
          open ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-ink-2 hover:text-ink",
        )}
      >
        <IconNote /> Notes
      </button>
    </div>
  );
}
