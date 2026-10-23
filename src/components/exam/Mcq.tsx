"use client";

import type { ReactNode } from "react";
import type { ClientMcq, ItemFeedback } from "@/engine/session/viewTypes";
import { cx, StatusMark } from "@/components/ui/primitives";
import { IconCheck, IconX } from "@/components/ui/icons";

const LETTERS = "ABCDEFGH";

export function McqQuestion({
  q,
  selected,
  onSelect,
  disabled,
  feedback,
  number,
  directions,
  bookmark,
}: {
  q: ClientMcq;
  selected: string | null;
  onSelect: (optionId: string) => void;
  disabled: boolean;
  feedback: ItemFeedback | null;
  number?: number;
  directions?: string;
  /** Rendered top-right, outside the fieldset so it stays usable when answers are locked. */
  bookmark?: ReactNode;
}) {
  return (
    <div className="relative">
      {bookmark && <div className="absolute -top-1 right-0">{bookmark}</div>}
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className={cx("mb-4 text-[17px] font-medium leading-snug", !!bookmark && "pr-10")}>
        {number !== undefined && <span className="mr-2 text-ink-3 tabular">{number}.</span>}
        {q.stem}
        {directions && <span className="mt-1 block text-sm font-normal text-ink-3">{directions}</span>}
      </legend>
      <div className="space-y-2" role="radiogroup">
        {q.options.map((o, i) => {
          const isSel = selected === o.id;
          const isCorrect = feedback !== null && o.id === feedback.correctOptionId;
          const isWrongPick = feedback !== null && isSel && !isCorrect;
          return (
            <label
              key={o.id}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-md border px-3.5 py-3 transition-colors",
                disabled && "cursor-default",
                isCorrect ? "border-success bg-success-weak" : isWrongPick ? "border-danger bg-danger-weak" : isSel ? "border-accent bg-accent-weak" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <input type="radio" className="sr-only" name={q.id} checked={isSel} onChange={() => onSelect(o.id)} />
              <span
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  isSel ? "border-accent bg-accent text-white" : "border-line-strong text-ink-2",
                )}
                aria-hidden
              >
                {LETTERS[i]}
              </span>
              <span className="flex-1 pt-px">{o.text}</span>
              {isCorrect && <IconCheck className="mt-1 shrink-0 text-success" strokeWidth={3} aria-label="Correct answer" />}
              {isWrongPick && <IconX className="mt-1 shrink-0 text-danger" strokeWidth={3} aria-label="Your answer" />}
            </label>
          );
        })}
      </div>
      {feedback && <FeedbackBox feedback={feedback} />}
    </fieldset>
    </div>
  );
}

export function FeedbackBox({ feedback }: { feedback: ItemFeedback }) {
  return (
    <div
      className={cx(
        "mt-4 rounded-md border px-4 py-3 text-[15px]",
        feedback.correctness === "correct" ? "border-success/30 bg-success-weak" : "border-danger/25 bg-danger-weak",
      )}
      role="status"
    >
      <StatusMark status={feedback.correctness} withLabel />
      {feedback.correctness !== "correct" && feedback.correctAnswer && (
        <p className="mt-1.5">
          <span className="text-ink-3">Correct answer: </span>
          <span className="font-medium">{feedback.correctAnswer}</span>
        </p>
      )}
      {feedback.explanation && <p className="mt-1.5 text-ink-2">{feedback.explanation}</p>}
    </div>
  );
}
