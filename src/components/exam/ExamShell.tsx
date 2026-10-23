"use client";

import { type ReactNode, useState } from "react";
import { formatClock } from "@/lib/format";
import { Button, cx, Modal } from "@/components/ui/primitives";
import { IconClock } from "@/components/ui/icons";

export function ExamHeader({
  section,
  counter,
  remainingMs,
  timerLabel,
  progress,
  subLabel,
  onExit,
}: {
  section: string;
  counter: string | null;
  remainingMs: number | null;
  timerLabel?: string;
  progress: number | null;
  subLabel?: string | null;
  onExit: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  const low = remainingMs !== null && remainingMs <= 5 * 60_000;
  const critical = remainingMs !== null && remainingMs <= 60_000;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <span className="hidden text-sm font-semibold tracking-tight text-ink-2 sm:inline">TOEFL Practice</span>
        <span className="hidden h-5 w-px bg-line sm:inline" />
        <span className="text-[15px] font-semibold uppercase tracking-[0.06em]">{section}</span>
        {subLabel && <span className="hidden text-sm text-ink-3 md:inline">{subLabel}</span>}
        <span className="ml-auto text-sm text-ink-2 tabular" aria-live="polite">{counter}</span>
        {remainingMs !== null && (
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            title={hidden ? "Show time" : "Hide time"}
            className={cx(
              "flex min-w-[92px] items-center justify-end gap-1.5 rounded-md px-2 py-1 font-mono text-[17px] font-medium tabular",
              critical ? "text-danger" : low ? "text-warn" : "text-ink",
            )}
            aria-label={`${timerLabel ?? "Time remaining"} ${formatClock(remainingMs)}`}
          >
            <IconClock className="text-ink-3" />
            {hidden ? <span className="text-sm font-sans text-ink-3">Show</span> : formatClock(remainingMs)}
          </button>
        )}
        <span className="h-5 w-px bg-line" />
        <button type="button" onClick={onExit} className="rounded-md px-2 py-1 text-sm font-medium text-ink-2 hover:bg-black/[0.04] hover:text-ink">
          Exit
        </button>
      </div>
      {progress !== null && (
        <div className="h-[3px] w-full bg-line" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </header>
  );
}

export function ExamFooter({ hint, left, right }: { hint?: ReactNode; left?: ReactNode; right: ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-20 border-t border-line bg-surface">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex gap-2">{left}</div>
        <div className="min-w-0 flex-1 text-sm text-ink-3">{hint}</div>
        <div className="flex gap-2">{right}</div>
      </div>
    </footer>
  );
}

export function ExitDialog({
  open,
  timerRunning,
  busy,
  onCancel,
  onSaveAndExit,
  onDiscard,
}: {
  open: boolean;
  timerRunning: boolean;
  busy: boolean;
  onCancel: () => void;
  onSaveAndExit: () => void;
  onDiscard: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const close = () => {
    setConfirmDiscard(false);
    onCancel();
  };
  return (
    <Modal open={open} onClose={close} title="Exit test">
      <div className="p-6">
        <h2 className="text-lg font-semibold">{confirmDiscard ? "Discard this attempt?" : "Exit the test?"}</h2>
        {confirmDiscard ? (
          <p className="mt-2 text-[15px] text-ink-2">All answers and recordings from this attempt will be deleted. This cannot be undone.</p>
        ) : (
          <div className="mt-2 space-y-2 text-[15px] text-ink-2">
            <p>Your answers are saved. You can resume this attempt from the dashboard.</p>
            {timerRunning && (
              <p className="text-warn">The section timer keeps running while you are away. If it reaches 00:00, the section is submitted automatically.</p>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {confirmDiscard ? (
            <>
              <Button onClick={() => setConfirmDiscard(false)} disabled={busy}>Back</Button>
              <Button variant="danger" onClick={onDiscard} disabled={busy}>Discard attempt</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={() => setConfirmDiscard(true)} disabled={busy}>
                Discard attempt…
              </Button>
              <Button onClick={close} disabled={busy}>Continue test</Button>
              <Button variant="primary" onClick={onSaveAndExit} disabled={busy}>Save and exit</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function TimeUpOverlay() {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/80" role="alertdialog" aria-label="Time is up">
      <div className="rounded-lg border border-line bg-surface px-8 py-6 text-center">
        <div className="font-mono text-2xl font-semibold">00:00</div>
        <p className="mt-2 font-medium">Time is up.</p>
        <p className="text-sm text-ink-3">Saving your answers and submitting…</p>
      </div>
    </div>
  );
}
