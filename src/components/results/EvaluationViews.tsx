"use client";

import { type ReactNode, useState } from "react";
import type { Correction, DeliveryMetrics, Feedback, InterviewFeedback, RepeatFeedback, WritingFeedback } from "@/ai/feedbackTypes";
import type { EvaluationRecord } from "@/engine/session/types";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { correctedSegments, correctedText, isRemoval, locateCorrections } from "@/lib/corrections";
import { IconAlert, IconChevronDown } from "@/components/ui/icons";
import { TranscriptReview, ValidatedTranscript } from "@/components/speaking/TranscriptReview";

export function EvaluationStatus({ evaluation, onRetry }: { evaluation: EvaluationRecord | null; onRetry?: () => void }) {
  if (!evaluation) return <p className="text-sm text-ink-3">Waiting for evaluation…</p>;
  if (evaluation.status === "queued") return <p className="flex items-center gap-2 text-sm text-ink-2"><Spinner /> Queued for evaluation…</p>;
  if (evaluation.status === "review") return <p className="text-sm text-ink-2">Waiting for you to check the transcript.</p>;
  if (evaluation.status === "running") {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <Spinner /> {evaluation.stage === "transcribing" ? "Transcribing your recording…" : "Evaluating with the local model…"}
      </p>
    );
  }
  if (evaluation.status === "error") {
    return (
      <div className="rounded-md border border-warn/30 bg-warn-weak px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-warn"><IconAlert /> Evaluation failed</p>
        <p className="mt-1 text-ink-2">{evaluation.error}</p>
        {onRetry && <Button size="sm" className="mt-3" onClick={onRetry}>Run evaluation again</Button>}
      </div>
    );
  }
  return null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="border-b border-line pb-1.5 text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">{title}</h4>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Bullets({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-[15px] text-ink-3">{empty ?? "None noted."}</p>;
  return (
    <ul className="space-y-1.5 text-[15px] leading-relaxed">
      {items.map((s, i) => <li key={i} className="flex gap-2"><span className="text-ink-3">–</span><span>{s}</span></li>)}
    </ul>
  );
}

export function ScorePill({ score, max, label = "Estimated score" }: { score: number | null; max: number; label?: string }) {
  return (
    <div className="inline-flex items-baseline gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5">
      <span className="text-xs uppercase tracking-wide text-ink-3">{label}</span>
      <span className="text-xl font-semibold tabular text-accent">{score === null ? "—" : score.toFixed(1)}</span>
      <span className="text-sm text-ink-3">/ {max}</span>
    </div>
  );
}

function Corrections({
  items,
  open,
  onToggle,
  idPrefix,
}: {
  items: Correction[];
  open?: number | null;
  onToggle?: (i: number) => void;
  idPrefix?: string;
}) {
  const [localOpen, setLocalOpen] = useState<number | null>(null);
  const isOpen = open !== undefined ? open : localOpen;
  const toggle = onToggle ?? ((i: number) => setLocalOpen((o) => (o === i ? null : i)));
  if (items.length === 0) return <p className="text-[15px] text-ink-3">No specific corrections.</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {items.map((c, i) => (
        <li key={i} id={idPrefix ? `${idPrefix}-${i}` : undefined} className={cx(isOpen === i && "bg-danger-weak/40")}>
          <button
            type="button"
            onClick={() => toggle(i)}
            aria-expanded={isOpen === i}
            className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left text-[15px] hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="text-danger line-through decoration-danger/50">{c.original}</span>
              <span className="mx-2 text-ink-3">→</span>
              {isRemoval(c.suggestion) ? (
                <span className="italic text-success">remove</span>
              ) : (
                <span className="font-medium text-success">{c.suggestion}</span>
              )}
            </span>
            <span
              className={cx(
                "shrink-0 rounded px-1.5 text-xs ring-1",
                errorCategory(c.type) === "other" ? "bg-surface-2 text-ink-3 ring-line" : "bg-danger-weak text-danger ring-danger/30",
              )}
            >
              {c.type}
            </span>
            <IconChevronDown className={cx("mt-1 shrink-0 text-ink-3 transition-transform", isOpen === i && "rotate-180")} />
          </button>
          {isOpen === i && <p className="px-3.5 pb-3 text-[15px] text-ink-2">{c.explanation}</p>}
        </li>
      ))}
    </ul>
  );
}

type ErrorCategory = "spelling" | "grammar" | "other";
function errorCategory(type: string): ErrorCategory {
  if (type === "spelling" || type === "capitalization") return "spelling";
  if (type === "grammar" || type === "word order") return "grammar";
  return "other";
}

function ErrorCounts({ corrections }: { corrections: Correction[] }) {
  const count = (cat: ErrorCategory) => corrections.filter((c) => errorCategory(c.type) === cat).length;
  const stats: [string, number][] = [
    ["Spelling mistakes", count("spelling")],
    ["Grammar mistakes", count("grammar")],
    ["Other issues", count("other")],
  ];
  return (
    <dl className="mt-2 grid grid-cols-3 gap-2">
      {stats.map(([label, n]) => (
        <div key={label} className={cx("rounded-md border px-3 py-2", n > 0 ? "border-danger/30 bg-danger-weak" : "border-line bg-surface")}>
          <dt className="text-xs text-ink-2">{label}</dt>
          <dd className={cx("text-2xl font-semibold tabular", n > 0 ? "text-danger" : "text-success")}>{n}</dd>
        </div>
      ))}
    </dl>
  );
}

function Criteria({ items }: { items: { label: string; score: number; comment: string }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((c) => (
        <div key={c.label}>
          <dt className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{c.label}</span>
            <span className="tabular text-ink-2">{c.score.toFixed(1)} / 5</span>
          </dt>
          <div className="my-1 h-1 rounded-full bg-line"><div className="h-full rounded-full bg-accent" style={{ width: `${(c.score / 5) * 100}%` }} /></div>
          <dd className="text-sm text-ink-2">{c.comment}</dd>
        </div>
      ))}
    </dl>
  );
}

const UNDERLINE: Record<ErrorCategory, string> = {
  spelling: "decoration-dotted",
  grammar: "decoration-wavy",
  other: "decoration-dashed",
};

/** The learner's original text, unchanged, with every mistake shown in red. */
function AnnotatedResponse({ text, corrections, onSelect }: { text: string; corrections: Correction[]; onSelect: (i: number) => void }) {
  const spans = locateCorrections(text, corrections);
  const cuts = new Set<number>([0, text.length]);
  spans.forEach((s) => s && (cuts.add(s.start), cuts.add(s.end)));
  const points = [...cuts].sort((a, b) => a - b);
  const parts: ReactNode[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [a, b] = [points[k], points[k + 1]];
    const piece = text.slice(a, b);
    const covering = spans.flatMap((s, i) => (s && s.start <= a && s.end >= b ? [i] : []));
    if (covering.length === 0) {
      parts.push(piece);
      continue;
    }
    const first = corrections[covering[0]];
    const cat = errorCategory(first.type);
    parts.push(
      <mark
        key={a}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(covering[0])}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(covering[0])}
        title={covering.map((i) => `${corrections[i].type}: ${corrections[i].original} → ${corrections[i].suggestion}`).join("\n")}
        className={cx(
          "cursor-pointer rounded-sm bg-danger-weak px-px font-medium text-danger underline decoration-danger decoration-2 underline-offset-4",
          UNDERLINE[cat],
        )}
      >
        {piece}
      </mark>,
    );
  }
  return <div className="whitespace-pre-wrap text-[16px] leading-relaxed">{parts}</div>;
}

/** The response with every correction applied; changed words in green. Built from the listed corrections. */
function CorrectedVersion({ text, corrections, onSelect }: { text: string; corrections: Correction[]; onSelect: (i: number) => void }) {
  const [copied, setCopied] = useState(false);
  const segments = correctedSegments(text, corrections);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(correctedText(text, corrections));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Corrected version</h4>
        {corrections.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</Button>
        )}
      </div>
      <div className="mt-2 whitespace-pre-wrap rounded-lg border border-success/30 bg-surface p-4 text-[16px] leading-relaxed">
        {corrections.length === 0
          ? <span className="text-ink-3">No corrections were needed.</span>
          : segments.map((s, k) =>
              s.index === null ? (
                s.text
              ) : s.text === "" ? (
                <del key={k} title={`Removed “${s.original}”`} className="text-success/70 decoration-success decoration-2">
                  {s.original}
                </del>
              ) : (
                <mark
                  key={k}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(s.index)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(s.index)}
                  title={`Was “${s.original}”`}
                  className="cursor-pointer rounded-sm bg-success-weak px-px font-medium text-success underline decoration-success decoration-2 underline-offset-4"
                >
                  {s.text}
                </mark>
              ),
            )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        Suggested version built by applying the corrections listed here — green shows what changed, struck-through words were removed.
        Select a green change to see why. Your original response above is kept exactly as you wrote it.
      </p>
    </div>
  );
}

export function WritingEvaluation({ response, evaluation, onRetry }: { response: string; evaluation: EvaluationRecord | null; onRetry?: () => void }) {
  const fb = evaluation?.status === "done" ? (evaluation.feedback as WritingFeedback) : null;
  const [open, setOpen] = useState<number | null>(null);
  const idPrefix = `corr-${evaluation?.itemId ?? "x"}`;
  const select = (i: number) => {
    setOpen(i);
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-${i}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Your response</h4>
        {fb && <ErrorCounts corrections={fb.corrections} />}
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-4">
          {response.trim() ? (
            <AnnotatedResponse text={response} corrections={fb?.corrections ?? []} onSelect={select} />
          ) : (
            <p className="text-ink-3">No response submitted.</p>
          )}
        </div>
        {fb && (
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            {fb.wordCount} words · Mistakes are shown in red: dotted underline = spelling, wavy = grammar, dashed = other.
            Select a highlighted word to see its correction. Your text itself is not changed.
          </p>
        )}
        {fb && response.trim() && <CorrectedVersion text={response} corrections={fb.corrections} onSelect={select} />}
      </div>
      <div>
        <h4 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">AI evaluation</h4>
        <div className="mt-2">
          <EvaluationStatus evaluation={evaluation} onRetry={onRetry} />
          {fb && evaluation && (
            <>
              <ScorePill score={evaluation.score} max={5} />
              <p className="mt-3 text-[15px] leading-relaxed">{fb.summary}</p>
              <Section title="Criteria"><Criteria items={fb.criteria} /></Section>
              <Section title="Strengths"><Bullets items={fb.strengths} /></Section>
              <Section title="Issues"><Bullets items={fb.issues} /></Section>
              <Section title={`Corrections (${fb.corrections.length})`}>
                <Corrections items={fb.corrections} open={open} onToggle={(i) => setOpen(open === i ? null : i)} idPrefix={idPrefix} />
              </Section>
              <Section title="How to improve"><Bullets items={fb.howToImprove} /></Section>
              <p className="mt-4 text-xs text-ink-3">Estimated by a local model ({evaluation.model}). Not an official ETS score.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Delivery({ d }: { d: DeliveryMetrics }) {
  const rows: [string, string][] = [
    ["Speaking time", `${d.speechSeconds} s`],
    ["Words", String(d.wordCount)],
    ["Speech rate", `${d.wordsPerMinute} words/min`],
    ["Pauses over 0.8 s", `${d.longPauses}${d.longPauses ? ` (longest ${d.longestPauseSeconds} s)` : ""}`],
    ["Recognition confidence", `${Math.round(d.meanConfidence * 100)}%`],
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k}><dt className="text-ink-3">{k}</dt><dd className="font-medium tabular">{v}</dd></div>
        ))}
      </dl>
      {d.lowConfidenceWords.length > 0 && (
        <p className="mt-2 text-sm text-ink-2">Low-confidence words: {d.lowConfidenceWords.join(", ")}</p>
      )}
      <p className="mt-2 text-xs text-ink-3">
        Measured from the speech recognizer&apos;s timings and confidence. These are indirect indicators of fluency and clarity, not a pronunciation score.
      </p>
    </div>
  );
}

function RepeatDetail({ fb }: { fb: RepeatFeedback }) {
  return (
    <>
      <Section title="Target vs. your repetition">
        <p className="text-[15px]"><span className="text-ink-3">Target: </span>{fb.target}</p>
        <p className="mt-2 flex flex-wrap gap-1 text-[15px]" aria-label="Word alignment">
          {fb.alignment.map((o, i) =>
            o.op === "match" ? (
              <span key={i} className="rounded bg-success-weak px-1">{o.spoken}</span>
            ) : o.op === "sub" ? (
              <span key={i} className="rounded bg-danger-weak px-1" title={`Expected “${o.target}”`}>
                <span className="line-through decoration-danger/60">{o.spoken}</span> <span className="text-success">{o.target}</span>
              </span>
            ) : o.op === "del" ? (
              <span key={i} className="rounded border border-dashed border-danger/60 px-1 text-danger" title="Missing word">{o.target}</span>
            ) : (
              <span key={i} className="rounded bg-warn-weak px-1 text-warn" title="Extra word">+{o.spoken}</span>
            ),
          )}
        </p>
        <p className="mt-2 text-xs text-ink-3">
          Green: repeated correctly · Struck-through: changed word · Dashed: missing word · +: extra word. Word accuracy {Math.round(fb.accuracy * 100)}%.
        </p>
      </Section>
      <Section title="Observations"><Bullets items={fb.notes} /></Section>
      <Section title="Delivery indicators"><Delivery d={fb.delivery} /></Section>
    </>
  );
}

function InterviewDetail({ fb }: { fb: InterviewFeedback }) {
  return (
    <>
      <p className="mt-3 text-[15px] leading-relaxed">{fb.summary}</p>
      {fb.criteria.length > 0 && <Section title="Evaluation"><Criteria items={fb.criteria} /></Section>}
      <Section title="Strengths"><Bullets items={fb.strengths} /></Section>
      <Section title="Issues"><Bullets items={fb.issues} /></Section>
      <Section title="Corrections"><Corrections items={fb.corrections} /></Section>
      <Section title="Improvement"><Bullets items={fb.improvement} /></Section>
      <Section title="Delivery indicators"><Delivery d={fb.delivery} /></Section>
    </>
  );
}

export function SpeakingEvaluation({
  recordingUrl,
  evaluation,
  onRetry,
  onValidate,
}: {
  recordingUrl: string | null;
  evaluation: EvaluationRecord | null;
  onRetry?: () => void;
  /** Validate the transcript of an answer waiting for review (scoring starts afterwards). */
  onValidate?: (text: string) => Promise<void>;
}) {
  const fb = evaluation?.status === "done" ? (evaluation.feedback as Feedback) : null;
  if (recordingUrl && evaluation?.status === "review" && onValidate) {
    return <TranscriptReview transcript={evaluation.transcript ?? ""} recordingUrl={recordingUrl} onValidate={onValidate} />;
  }
  return (
    <div>
      {recordingUrl ? (
        <audio controls src={recordingUrl} preload="none" className="w-full max-w-md" aria-label="Your recording" />
      ) : (
        <p className="text-[15px] text-ink-3">No recording was submitted for this task.</p>
      )}
      {recordingUrl && (
        <Section title="Transcript">
          {evaluation?.transcript !== null && evaluation?.transcript !== undefined ? (
            <ValidatedTranscript transcript={evaluation.transcript} original={evaluation.stt?.text} edited={evaluation.edited} />
          ) : (
            <EvaluationStatus evaluation={evaluation} onRetry={onRetry} />
          )}
          <p className="mt-1.5 text-xs text-ink-3">
            {evaluation?.stt ? "Automatic transcript (local Whisper), checked by you before scoring." : "Automatic transcript (local Whisper). Recognition errors are possible."}
          </p>
        </Section>
      )}
      {recordingUrl && evaluation?.transcript != null && <div className="mt-4"><EvaluationStatus evaluation={evaluation} onRetry={onRetry} /></div>}
      {fb && evaluation && (
        <div className="mt-5">
          <ScorePill score={evaluation.score} max={5} />
          {fb.kind === "repeat" && <RepeatDetail fb={fb} />}
          {fb.kind === "interview" && <InterviewDetail fb={fb} />}
        </div>
      )}
    </div>
  );
}
