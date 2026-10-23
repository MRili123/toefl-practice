"use client";

import { Fragment, type ReactNode } from "react";
import type { ClientAnswer, ClientTask, ItemFeedback } from "@/engine/session/viewTypes";
import { cx, StatusMark } from "@/components/ui/primitives";
import { IconCheck } from "@/components/ui/icons";

type Task = Extract<ClientTask, { kind: "complete_the_words" }>;

/**
 * A completed word with the given first half in grey and the letters to type in bold ("fo" + "rm"): only the
 * missing letters are typed, one per underscore, so showing the bare word ("form") would suggest four letters.
 */
function WordParts({ prefix, word }: { prefix: string; word: string }) {
  if (!word.toLowerCase().startsWith(prefix.toLowerCase())) return <>{word}</>;
  return (
    <>
      <span className="font-normal opacity-70">{word.slice(0, prefix.length)}</span>
      <span className="font-semibold underline decoration-2 underline-offset-2">{word.slice(prefix.length)}</span>
    </>
  );
}

export function CompleteTheWords({
  task,
  answers,
  onChange,
  disabled,
  feedback,
  firstNumber,
  bookmark,
}: {
  task: Task;
  answers: Record<string, ClientAnswer>;
  onChange: (itemId: string, value: string) => void;
  disabled: boolean;
  feedback: Record<string, ItemFeedback>;
  firstNumber: number;
  bookmark?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-[15px] text-ink-2">Fill in the missing letters in the paragraph.</p>
        {bookmark}
      </div>
      <div className="rounded-lg border border-line bg-surface px-6 py-6 text-[17px] leading-[2.4] sm:px-8">
        {task.segments.map((seg, i) => {
          const blank = task.blanks[i];
          if (!blank) return <Fragment key={i}>{seg}</Fragment>;
          const a = answers[blank.id];
          const value = a?.kind === "text" ? a.value : "";
          const fb = feedback[blank.id];
          return (
            <Fragment key={i}>
              {seg}
              <span className="inline-flex items-baseline whitespace-nowrap">
                <span>{blank.prefix}</span>
                <input
                  aria-label={`Question ${firstNumber + i}: complete the word beginning “${blank.prefix}”, ${blank.letters} letters`}
                  value={value}
                  maxLength={blank.letters}
                  disabled={disabled || !!fb}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(e) => onChange(blank.id, e.target.value.replace(/\s/g, ""))}
                  // One underscore per missing letter, as on the test ("mi_ _ _").
                  style={{
                    width: `${blank.letters * 1.6}ch`,
                    letterSpacing: "0.6ch",
                    backgroundImage: `repeating-linear-gradient(to right, ${fb ? "currentColor" : "var(--ink-2)"} 0 1ch, transparent 1ch 1.6ch)`,
                    backgroundSize: "100% 2px",
                    backgroundPosition: "left bottom",
                    backgroundRepeat: "no-repeat",
                  }}
                  className={cx(
                    "mx-px rounded-t-sm border-0 p-0 font-mono text-[16px] leading-7 outline-none focus:bg-accent-weak",
                    !fb && "bg-transparent",
                    fb?.correctness === "correct" && "bg-success-weak text-success",
                    fb && fb.correctness !== "correct" && "bg-danger-weak text-danger line-through decoration-danger/70",
                  )}
                />
                {fb && fb.correctness === "correct" && <IconCheck className="ml-0.5 self-center text-success" strokeWidth={3} aria-label="Correct" />}
                {fb && fb.correctness !== "correct" && (
                  <span
                    className="ml-1.5 inline-flex items-center gap-1 self-center rounded border border-success/40 bg-success-weak px-1.5 text-[14px] font-medium leading-6 text-success"
                    title="Correct answer"
                  >
                    <IconCheck width={13} height={13} strokeWidth={3} aria-hidden />
                    <span className="sr-only">Correct answer: {fb.correctAnswer}. Letters to type: </span>
                    {fb.correctAnswer ? <WordParts prefix={blank.prefix} word={fb.correctAnswer} /> : null}
                  </span>
                )}
              </span>
            </Fragment>
          );
        })}
      </div>
      {task.blanks.some((b) => feedback[b.id]) && <CorrectionList task={task} feedback={feedback} firstNumber={firstNumber} />}
    </div>
  );
}

function CorrectionList({ task, feedback, firstNumber }: { task: Task; feedback: Record<string, ItemFeedback>; firstNumber: number }) {
  const rows = task.blanks.map((b, i) => ({ b, n: firstNumber + i, fb: feedback[b.id] })).filter((r) => r.fb);
  const correct = rows.filter((r) => r.fb.correctness === "correct").length;
  return (
    <section className="mt-5 rounded-lg border border-line bg-surface" aria-label="Corrections">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="font-semibold">Corrections</span>
        <span className="text-sm text-ink-2 tabular">{correct} / {rows.length} correct</span>
      </header>
      <ul className="divide-y divide-line">
        {rows.map(({ b, n, fb }) => (
          <li key={b.id} className="grid grid-cols-[36px_24px_1fr] items-baseline gap-2 px-5 py-2.5 text-[15px] sm:grid-cols-[36px_24px_1fr_1fr]">
            <span className="text-ink-3 tabular">{n}.</span>
            <StatusMark status={fb.correctness} />
            <span className={cx(fb.correctness === "correct" ? "text-success" : "text-danger line-through decoration-danger/60")}>
              {fb.yourAnswer ? (
                <>
                  <span className="opacity-60">{b.prefix}</span>
                  {fb.yourAnswer.toLowerCase().startsWith(b.prefix.toLowerCase()) ? fb.yourAnswer.slice(b.prefix.length) : fb.yourAnswer}
                </>
              ) : (
                <span className="text-ink-3 no-underline">No answer ({b.prefix}…)</span>
              )}
            </span>
            {fb.correctness !== "correct" && (
              <span className="col-start-3 font-medium text-success sm:col-start-4">
                <span className="font-normal text-ink-3">Correct: </span>
                {fb.correctAnswer ? <WordParts prefix={b.prefix} word={fb.correctAnswer} /> : null}
                {fb.correctAnswer && fb.correctAnswer.toLowerCase().startsWith(b.prefix.toLowerCase()) && (
                  <span className="ml-2 text-sm font-normal text-ink-3">type “{fb.correctAnswer.slice(b.prefix.length)}”</span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
