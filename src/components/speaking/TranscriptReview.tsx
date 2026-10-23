"use client";

import { useState } from "react";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconCheck } from "@/components/ui/icons";

/**
 * Shows what the speech-to-text service heard, before the answer is scored. The learner listens back, corrects
 * any recognition error by editing the text, then validates; the evaluation uses the validated text.
 */
export function TranscriptReview({
  transcript,
  recordingUrl,
  onValidate,
  compact,
}: {
  transcript: string;
  recordingUrl?: string | null;
  onValidate: (text: string) => Promise<void>;
  compact?: boolean;
}) {
  const [text, setText] = useState(transcript);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edited = text.replace(/\s+/g, " ").trim() !== transcript.replace(/\s+/g, " ").trim();

  const validate = async () => {
    setBusy(true);
    setError(null);
    try {
      await onValidate(text);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className={cx("rounded-xl border border-accent/40 bg-accent-weak/40", compact ? "p-4" : "p-5 sm:p-6")}>
      <h3 className="text-[15px] font-semibold">Check what was heard</h3>
      <p className="mt-1 text-sm text-ink-2">
        This is the speech-to-text transcript of your answer. If a word is wrong, click in the text and correct it to what you actually said, then validate.
        Your answer is scored on the validated text.
      </p>
      {recordingUrl && (
        <div className="mt-3">
          <audio controls src={recordingUrl} preload="metadata" className="w-full max-w-md" aria-label="Listen to your answer" />
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        rows={compact ? 2 : 3}
        spellCheck={false}
        aria-label="Transcript of your answer"
        placeholder="No speech was detected. Type what you said, or leave it empty."
        className="mt-3 block w-full resize-y rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-[16px] leading-relaxed outline-none focus:border-accent"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {edited ? (
            <span className="text-warn">
              You corrected the transcript ·{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setText(transcript)} disabled={busy}>
                undo changes
              </button>
            </span>
          ) : (
            <span className="text-ink-3">Unchanged</span>
          )}
        </div>
        <Button variant="primary" onClick={() => void validate()} disabled={busy}>
          {busy ? <Spinner /> : <IconCheck width={16} height={16} />} Validate
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** After scoring: the validated transcript, and the original recognition when the learner corrected it. */
export function ValidatedTranscript({ transcript, original, edited }: { transcript: string; original?: string | null; edited?: boolean }) {
  return (
    <div>
      <p className="rounded-md bg-surface-2 px-3.5 py-2.5 text-[15px] leading-relaxed ring-1 ring-line">
        {transcript || <span className="text-ink-3">(no speech detected)</span>}
      </p>
      {edited && original != null && (
        <p className="mt-1.5 text-xs text-ink-3">
          Corrected by you. Speech-to-text heard: <span className="italic">“{original || "(nothing)"}”</span>
        </p>
      )}
    </div>
  );
}
