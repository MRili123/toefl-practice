"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  ExerciseCorrection, GrammarFeedback, RepeatExerciseFeedback, SpeakingExerciseFeedback, SpellingFeedback,
  WritingExerciseFeedback, WritingLevels,
} from "@/engine/exercises/types";
import { GRAMMAR_CATEGORY_LABEL, type GrammarCategory } from "@/engine/exercises/types";
import { api } from "@/lib/api";
import { LevelVersions } from "./LevelVersions";
import { CorrectedSpeech } from "./CorrectedSpeech";
import { fromExerciseCorrections } from "@/lib/corrections";
import { cx } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";

/* ---------- verdicts ---------- */

export function Verdict({ correct, labels = ["Correct", "Not quite"] }: { correct: boolean; labels?: [string, string] }) {
  return (
    <div className={cx("settle flex items-center gap-2 text-lg font-semibold", correct ? "text-success" : "text-danger")} role="status">
      <span className={cx("flex h-7 w-7 items-center justify-center rounded-full text-white", correct ? "bg-success" : "bg-danger")}>
        {correct ? <IconCheck width={16} height={16} strokeWidth={3} /> : <IconX width={16} height={16} strokeWidth={3} />}
      </span>
      {correct ? labels[0] : labels[1]}
    </div>
  );
}

export function EstimatedScore({ score, label = "Estimated Practice Score" }: { score: number; label?: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tabular tracking-tight">{score.toFixed(1)}</span>
        <span className="text-lg text-ink-3">/ 6</span>
      </div>
      <div className="mt-1 text-xs text-ink-3">AI estimate for practice — not an official TOEFL score.</div>
    </div>
  );
}

/* ---------- spelling ---------- */

export function SpellingFeedbackView({ fb, correct }: { fb: SpellingFeedback; correct: boolean }) {
  if (correct) {
    return (
      <div className="text-center">
        <div className="text-sm text-ink-3">Correct answer</div>
        <div className="mt-1 text-xl font-medium">{fb.expected}</div>
      </div>
    );
  }
  return (
    <dl className="grid gap-4 text-left sm:grid-cols-2">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">Your answer</dt>
        <dd className="mt-1 break-words text-lg">
          {fb.given ? (
            fb.diff.filter((d) => d.op !== "add").map((d, i) => (
              <span key={i} className={d.op === "del" ? "rounded-sm bg-danger-weak text-danger underline decoration-danger decoration-2 underline-offset-4" : undefined}>
                {d.text}{fb.expected.includes(" ") ? " " : ""}
              </span>
            ))
          ) : (
            <span className="italic text-ink-3">No answer</span>
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">Correct answer</dt>
        <dd className="mt-1 break-words text-lg">
          {fb.expected.includes(" ")
            ? fb.expected
            : fb.diff.filter((d) => d.op !== "del").map((d, i) => (
                <span key={i} className={d.op === "add" ? "rounded-sm bg-success-weak font-semibold text-success" : undefined}>{d.text}</span>
              ))}
        </dd>
      </div>
      {fb.expected.includes(" ") && fb.wrongWords.length > 0 && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">Words to fix</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {fb.wrongWords.map((w, i) => (
              <span key={i} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-sm">
                {w.given ? <><s className="text-danger">{w.given}</s> → </> : <span className="text-ink-3">missing: </span>}
                <span className="font-medium text-success">{w.expected}</span>
              </span>
            ))}
          </dd>
        </div>
      )}
      {fb.explanation && <p className="text-[15px] text-ink-2 sm:col-span-2">{fb.explanation}</p>}
    </dl>
  );
}

/* ---------- grammar ---------- */

const LETTERS = "ABCD";

export function GrammarStem({ stem }: { stem: string }) {
  const parts = stem.split(/_{3,}/);
  return (
    <p className="text-xl leading-relaxed">
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="mx-1 inline-block w-20 border-b-2 border-ink-3 align-baseline" aria-label="blank" />}
        </span>
      ))}
    </p>
  );
}

export function GrammarOptions({
  options,
  selected,
  onSelect,
  feedback,
}: {
  options: string[];
  selected: number | null;
  onSelect?: (i: number) => void;
  feedback: GrammarFeedback | null;
}) {
  return (
    <div className="space-y-2.5" role="radiogroup" aria-label="Answers">
      {options.map((o, i) => {
        const isSel = selected === i;
        const isAnswer = feedback !== null && feedback.answer === i;
        const wrongPick = feedback !== null && isSel && !isAnswer;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={isSel}
            disabled={!onSelect}
            onClick={() => onSelect?.(i)}
            className={cx(
              "flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-[17px] transition-colors duration-150",
              isAnswer ? "border-success bg-success-weak" : wrongPick ? "border-danger bg-danger-weak" : isSel ? "border-accent bg-accent-weak" : "border-line bg-surface hover:border-line-strong",
              !onSelect && "cursor-default",
            )}
          >
            <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold", isSel && !feedback ? "border-accent bg-accent text-white" : "border-line-strong text-ink-2")}>
              {LETTERS[i]}
            </span>
            <span className="flex-1">{o}</span>
            {isAnswer && <IconCheck className="shrink-0 text-success" strokeWidth={3} aria-label="Correct answer" />}
            {wrongPick && <IconX className="shrink-0 text-danger" strokeWidth={3} aria-label="Your answer" />}
          </button>
        );
      })}
    </div>
  );
}

export function GrammarExplanation({ fb }: { fb: GrammarFeedback }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">Explanation · {GRAMMAR_CATEGORY_LABEL[fb.category]}</div>
      <p className="mt-1.5 text-[15px] leading-relaxed">{fb.explanation}</p>
    </div>
  );
}

/* ---------- inline corrections with popover ---------- */

const TYPE_LABEL: Record<ExerciseCorrection["type"], string> = {
  grammar: "Grammar",
  spelling: "Spelling",
  vocabulary: "Word choice",
  punctuation: "Punctuation",
  capitalization: "Capitalization",
  "sentence-structure": "Sentence structure",
};

function Popover({ c, onClose }: { c: ExerciseCorrection; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const over = r.right - (window.innerWidth - 12);
    const under = 12 - r.left;
    setShift(over > 0 ? -over : under > 0 ? under : 0);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${TYPE_LABEL[c.type]} correction`}
      style={{ transform: `translateX(${shift}px)` }}
      className="settle absolute left-0 top-full z-30 mt-2 w-72 rounded-lg border border-line bg-surface p-4 text-left text-sm font-normal leading-normal text-ink shadow-lg"
    >
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
        {TYPE_LABEL[c.type]}{c.category && GRAMMAR_CATEGORY_LABEL[c.category as GrammarCategory] ? ` · ${GRAMMAR_CATEGORY_LABEL[c.category as GrammarCategory]}` : ""}
      </div>
      <dl className="mt-2 space-y-1.5">
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-3">Incorrect</dt><dd className="text-danger line-through decoration-1">{c.original}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-3">Correct</dt><dd className="font-medium text-success">{c.correction}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-ink-3">Reason</dt><dd>{c.reason}</dd></div>
      </dl>
    </div>
  );
}

/** The learner's ORIGINAL text with precise underlines; click an error to see the correction. */
export function CorrectionsText({ text, corrections }: { text: string; corrections: ExerciseCorrection[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const placed = corrections
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.start !== null && c.end !== null && c.end! > c.start!)
    .sort((a, b) => a.c.start! - b.c.start!);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const { c, i } of placed) {
    if (c.start! < pos) continue;
    out.push(text.slice(pos, c.start!));
    const tone = c.type === "grammar" || c.type === "spelling" || c.type === "sentence-structure" ? "decoration-danger" : "decoration-warn";
    out.push(
      <span key={i} className="relative inline">
        <button
          type="button"
          onClick={() => setOpen(open === i ? null : i)}
          aria-expanded={open === i}
          className={cx("rounded-sm underline decoration-wavy decoration-2 underline-offset-4 hover:bg-danger-weak", tone, open === i && "bg-danger-weak")}
        >
          {text.slice(c.start!, c.end!)}
        </button>
        {open === i && <Popover c={c} onClose={() => setOpen(null)} />}
      </span>,
    );
    pos = c.end!;
  }
  out.push(text.slice(pos));
  return <div className="whitespace-pre-wrap break-words text-[16px] leading-[1.9]">{out}</div>;
}

/* ---------- writing ---------- */

const RATING_TONE: Record<string, string> = { Strong: "text-success", Good: "text-accent", Fair: "text-warn", "Needs work": "text-danger" };

function List({ title, items, tone }: { title: string; items: string[]; tone?: "success" | "danger" }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-ink-3")} />
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

type WritingTab = "original" | "corrections" | "improved";

export function WritingEvaluationView({ fb, text, subject, levels }: {
  fb: WritingExerciseFeedback;
  text: string;
  subject?: string;
  /** Lets the improved version be rated and rewritten at other CEFR levels. */
  levels?: { sessionId: string; itemId: string; initial?: WritingLevels };
}) {
  const [tab, setTab] = useState<WritingTab>("corrections");
  return (
    <div className="settle space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6 rounded-xl border border-line bg-surface p-6">
        <EstimatedScore score={fb.score} />
        <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 text-sm sm:max-w-md sm:grid-cols-3">
          <div><dt className="text-ink-3">Grammar</dt><dd className="text-lg font-semibold tabular">{fb.grammarCount} <span className="text-sm font-normal text-ink-3">mistake{fb.grammarCount === 1 ? "" : "s"}</span></dd></div>
          <div><dt className="text-ink-3">Spelling</dt><dd className="text-lg font-semibold tabular">{fb.spellingCount} <span className="text-sm font-normal text-ink-3">mistake{fb.spellingCount === 1 ? "" : "s"}</span></dd></div>
          <div><dt className="text-ink-3">Words</dt><dd className="text-lg font-semibold tabular">{fb.wordCount}</dd></div>
          {([["Vocabulary", fb.vocabulary], ["Organization", fb.organization], ["Task fulfillment", fb.task]] as const).map(([label, r]) => (
            <div key={label} title={r.comment}><dt className="text-ink-3">{label}</dt><dd className={cx("text-[15px] font-semibold", RATING_TONE[r.rating])}>{r.rating}</dd></div>
          ))}
        </dl>
      </div>

      {fb.summary && <p className="text-[15px] leading-relaxed text-ink-2">{fb.summary}</p>}

      <div className="rounded-xl border border-line bg-surface">
        <div role="tablist" aria-label="Your writing" className="flex gap-1 border-b border-line px-3 pt-2">
          {([["original", "Original"], ["corrections", `Corrections${fb.corrections.length ? ` (${fb.corrections.length})` : ""}`], ["improved", "Improved Version"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors", tab === id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-5 sm:p-6">
          {subject !== undefined && tab !== "improved" && <p className="mb-3 text-sm"><span className="text-ink-3">Subject: </span>{subject || <span className="italic text-ink-3">none</span>}</p>}
          {tab === "original" && <div className="whitespace-pre-wrap break-words text-[16px] leading-[1.9]">{text || <span className="italic text-ink-3">Empty response</span>}</div>}
          {tab === "corrections" && (
            <>
              {fb.corrections.length > 0 && <p className="mb-3 text-sm text-ink-3">Click an underlined part to see the correction.</p>}
              <CorrectionsText text={text} corrections={fb.corrections} />
              {fb.corrections.length === 0 && <p className="mt-3 text-sm text-success">No errors were found in this response.</p>}
            </>
          )}
          {tab === "improved" && (
            <>
              <p className="mb-3 text-sm text-ink-3">A polished version generated by the AI. Your original is kept unchanged.</p>
              {levels && fb.improvedVersion ? (
                <LevelVersions load={(l) => api.writingLevels(levels.sessionId, levels.itemId, l)} improved={fb.improvedVersion} initial={levels.initial} />
              ) : (
                <div className="whitespace-pre-wrap break-words text-[16px] leading-[1.9]">{fb.improvedVersion || <span className="italic text-ink-3">Not available</span>}</div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <List title="What you did well" items={fb.strengths} tone="success" />
        <List title="What to improve" items={fb.improve} tone="danger" />
        <List title="Tips" items={fb.tips} />
      </div>
      {fb.recommendedWords.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Useful words for this topic</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {fb.recommendedWords.map((w) => <span key={w} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">{w}</span>)}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- speaking ---------- */

export function SpeakingFeedbackView({ fb, recordingUrl, levels }: {
  fb: SpeakingExerciseFeedback;
  recordingUrl?: string | null;
  /** Lets the corrected answer be rated and rewritten at other CEFR levels. */
  levels?: { sessionId: string; itemId: string; initial?: WritingLevels };
}) {
  return (
    <div className="settle space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <EstimatedScore score={fb.score} />
        {recordingUrl && <audio controls src={recordingUrl} className="w-full max-w-xs" />}
      </div>
      {fb.summary && <p className="text-[15px] leading-relaxed text-ink-2">{fb.summary}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <List title="What you did well" items={fb.strengths} tone="success" />
        <List title="Suggestions" items={fb.suggestions} />
      </div>
      {fb.errors.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Errors</h3>
          <ul className="mt-2 space-y-2">
            {fb.errors.map((e, i) => (
              <li key={i} className="rounded-md border border-line bg-surface-2 px-4 py-3 text-[15px]">
                <div><span className="text-danger line-through decoration-1">“{e.original}”</span> → <span className="font-medium text-success">“{e.correction}”</span></div>
                <div className="mt-0.5 text-sm text-ink-3">{e.reason}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {fb.delivery.length > 0 && <List title="Delivery (from timing and recognition data)" items={fb.delivery} />}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Transcript</h3>
        <p className="mt-2 rounded-md border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed">
          {fb.transcript ? `“${fb.transcript}”` : <span className="italic text-ink-3">No speech detected</span>}
        </p>
        <p className="mt-1 text-xs text-ink-3">Automatic transcript of your recording, shown exactly as recognized.</p>
      </section>
      {fb.transcript && (
        <CorrectedSpeech
          transcript={fb.transcript}
          corrections={fromExerciseCorrections(fb.errors)}
          load={levels ? (l) => api.writingLevels(levels.sessionId, levels.itemId, l) : undefined}
          initial={levels?.initial}
        />
      )}
    </div>
  );
}

export function RepeatFeedbackView({ fb, recordingUrl }: { fb: RepeatExerciseFeedback; recordingUrl?: string | null }) {
  const missing = new Set(fb.missing);
  const changed = new Map(fb.changed.map((c) => [c.expected, c.said]));
  return (
    <div className="settle space-y-5 text-left">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">Original sentence</div>
        <p className="mt-1.5 text-lg leading-relaxed">
          {fb.target.split(/\s+/).map((w, i) => {
            const key = w.toLowerCase().replace(/[^a-z0-9']/g, "");
            const cls = missing.has(key) ? "bg-danger-weak text-danger underline decoration-danger" : changed.has(key) ? "bg-warn-weak text-warn" : "";
            return <span key={i} className={cx("rounded-sm", cls)} title={missing.has(key) ? "Missing" : changed.has(key) ? `You said “${changed.get(key)}”` : undefined}>{w} </span>;
          })}
        </p>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">What you said</div>
        <p className="mt-1.5 text-[15px] text-ink-2">{fb.transcript ? `“${fb.transcript}”` : <span className="italic text-ink-3">No speech detected</span>}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-ink-3">Accuracy</dt><dd className="text-lg font-semibold tabular">{Math.round(fb.accuracy * 100)}%</dd></div>
        <div><dt className="text-ink-3">Repeated</dt><dd className="text-lg font-semibold tabular">{fb.matched.length}</dd></div>
        <div><dt className="text-ink-3">Missing</dt><dd className="text-lg font-semibold tabular">{fb.missing.length}</dd></div>
        <div><dt className="text-ink-3">Added</dt><dd className="text-lg font-semibold tabular">{fb.added.length}</dd></div>
      </dl>
      {fb.changed.length > 0 && (
        <p className="text-sm text-ink-2">Changed: {fb.changed.map((c) => `“${c.said}” instead of “${c.expected}”`).join("; ")}</p>
      )}
      {fb.notes.length > 0 && <List title="Fluency & clarity" items={fb.notes} />}
      {recordingUrl && <audio controls src={recordingUrl} className="w-full max-w-xs" />}
    </div>
  );
}
