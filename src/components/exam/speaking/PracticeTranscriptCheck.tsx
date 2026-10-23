"use client";

import { useEffect } from "react";
import type { EvaluationRecord } from "@/engine/session/types";
import { Button, Spinner } from "@/components/ui/primitives";
import { EvaluationStatus } from "@/components/results/EvaluationViews";
import { TranscriptReview } from "@/components/speaking/TranscriptReview";

/**
 * Practice mode: between a spoken answer and the next task, the learner checks what the speech-to-text heard.
 * (In Real Test Conditions the transcripts are checked on the results page instead, so the test is not paused.)
 */
export function PracticeTranscriptCheck({
  evaluation,
  recordingUrl,
  onValidate,
  onRetry,
  onContinue,
}: {
  evaluation: EvaluationRecord | null;
  recordingUrl: string;
  onValidate: (text: string) => Promise<void>;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const settled = evaluation && evaluation.status !== "queued" && evaluation.status !== "running" && evaluation.status !== "review" && evaluation.status !== "error";
  // Already validated (e.g. in another tab): nothing to check here.
  useEffect(() => {
    if (settled) onContinue();
  }, [settled, onContinue]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      {!evaluation || evaluation.status === "queued" || evaluation.status === "running" ? (
        <p className="flex items-center justify-center gap-2 py-16 text-ink-2" role="status">
          <Spinner /> Transcribing your answer…
        </p>
      ) : evaluation.status === "review" ? (
        <TranscriptReview transcript={evaluation.transcript ?? ""} recordingUrl={recordingUrl} onValidate={onValidate} />
      ) : evaluation.status === "error" ? (
        <div className="space-y-4">
          <EvaluationStatus evaluation={evaluation} onRetry={onRetry} />
          <Button onClick={onContinue}>Continue — check it on the results page</Button>
        </div>
      ) : null}
    </div>
  );
}
