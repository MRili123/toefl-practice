"use client";

import type { Correction } from "@/ai/feedbackTypes";
import type { Cefr, WritingLevels } from "@/engine/exercises/types";
import { correctedText } from "@/lib/corrections";
import { diffWords } from "@/lib/wordDiff";
import { LevelVersions } from "./LevelVersions";

/**
 * A spoken answer in text form, corrected: the transcript with the AI's corrections applied (what changed is
 * highlighted), its CEFR level, and the same answer at other levels (in spoken style).
 */
export function CorrectedSpeech({ transcript, corrections, load, initial }: {
  transcript: string;
  corrections: Correction[];
  load?: (level?: Cefr) => Promise<WritingLevels>;
  initial?: WritingLevels;
}) {
  const corrected = correctedText(transcript, corrections);
  if (!transcript.trim()) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Corrected version</h3>
      <div className="mt-2 whitespace-pre-wrap rounded-md border border-success/30 bg-surface px-4 py-3 text-[15px] leading-relaxed">
        {corrections.length === 0
          ? transcript
          : diffWords(transcript, corrected).map((p, i) =>
              p.op === "same" ? <span key={i}>{p.text}</span>
                : p.op === "add" ? <mark key={i} className="rounded-sm bg-success-weak px-0.5 font-medium text-success">{p.text}</mark>
                  : <del key={i} className="text-danger/70 decoration-danger/50">{p.text}</del>,
            )}
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {corrections.length === 0
          ? "No corrections were needed in what you said."
          : "What you said with the AI's corrections applied: green is new, struck-through words were removed. Your recording and transcript are unchanged."}
      </p>
      {load && <LevelVersions key={transcript} load={load} improved={corrected} initial={initial} hideBase what="corrected answer" />}
    </section>
  );
}
