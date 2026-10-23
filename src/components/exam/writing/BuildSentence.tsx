"use client";

import { type ReactNode, useState } from "react";
import type { ClientTask, ItemFeedback } from "@/engine/session/viewTypes";
import { Button, cx } from "@/components/ui/primitives";
import { FeedbackBox } from "../Mcq";
import { Avatar } from "./Avatar";

type Task = Extract<ClientTask, { kind: "build_a_sentence" }>;

/** Maps saved chunk strings back to pool indices (chunks may repeat). */
function slotsFromAnswer(task: Task, chunks: string[]): (number | null)[] {
  const used = new Set<number>();
  const slots: (number | null)[] = Array(task.numBlanks).fill(null);
  chunks.slice(0, task.numBlanks).forEach((c, i) => {
    const idx = task.chunks.findIndex((x, j) => x === c && !used.has(j));
    if (idx >= 0) {
      used.add(idx);
      slots[i] = idx;
    }
  });
  return slots;
}

export function BuildSentence({
  task,
  chunks,
  onChange,
  disabled,
  feedback,
  bookmark,
}: {
  task: Task;
  chunks: string[];
  onChange: (chunks: string[]) => void;
  disabled: boolean;
  feedback: ItemFeedback | null;
  bookmark?: ReactNode;
}) {
  const [slots, setSlots] = useState(() => slotsFromAnswer(task, chunks));
  const [dragFrom, setDragFrom] = useState<{ pool?: number; slot?: number } | null>(null);
  const locked = disabled || !!feedback;

  const commit = (next: (number | null)[]) => {
    setSlots(next);
    onChange(next.filter((x): x is number => x !== null).map((i) => task.chunks[i]));
  };
  const place = (poolIdx: number, at?: number) => {
    if (locked) return;
    const next = slots.map((s) => (s === poolIdx ? null : s));
    const target = at ?? next.findIndex((s) => s === null);
    if (target < 0) return;
    next[target] = poolIdx;
    commit(next);
  };
  const remove = (slot: number) => {
    if (locked) return;
    const next = [...slots];
    next[slot] = null;
    commit(next);
  };
  const dropOnSlot = (slot: number) => {
    if (!dragFrom || locked) return;
    const next = [...slots];
    if (dragFrom.slot !== undefined) {
      [next[slot], next[dragFrom.slot]] = [next[dragFrom.slot], next[slot]];
      commit(next);
    } else if (dragFrom.pool !== undefined) place(dragFrom.pool, slot);
    setDragFrom(null);
  };

  const inUse = new Set(slots.filter((x): x is number => x !== null));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-[15px] text-ink-2">Make an appropriate sentence.</p>
        {bookmark}
      </div>

      <div className="space-y-5 rounded-lg border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Avatar src={task.speakerImage} name={task.speakerName} />
          <div>
            <div className="text-sm font-semibold">{task.speakerName}</div>
            <p className="mt-1 rounded-md bg-surface-2 px-3.5 py-2.5 text-[16px] ring-1 ring-line">{task.speakerLine}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Avatar src={task.respondentImage} name={task.respondentName} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{task.respondentName}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-md bg-accent-weak/50 px-3 py-3 text-[16px] ring-1 ring-accent/20">
              {task.answerPrefix && <span>{task.answerPrefix}</span>}
              {slots.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={locked || s === null}
                  onClick={() => remove(i)}
                  draggable={!locked && s !== null}
                  onDragStart={() => setDragFrom({ slot: i })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOnSlot(i)}
                  aria-label={s === null ? `Blank ${i + 1}, empty` : `Blank ${i + 1}: ${task.chunks[s]}. Select to remove.`}
                  className={cx(
                    "min-h-9 min-w-16 rounded-md px-2.5 py-1 text-[15px]",
                    s === null ? "border border-dashed border-line-strong bg-surface text-transparent" : "border border-accent bg-surface font-medium text-ink",
                  )}
                >
                  {s === null ? "____" : task.chunks[s]}
                </button>
              ))}
              {task.answerSuffix && <span>{task.answerSuffix}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Word bank">
        {task.chunks.map((c, i) => (
          <button
            key={i}
            type="button"
            disabled={locked || inUse.has(i)}
            onClick={() => place(i)}
            draggable={!locked && !inUse.has(i)}
            onDragStart={() => setDragFrom({ pool: i })}
            className={cx(
              "rounded-md border px-3 py-1.5 text-[15px] transition-colors",
              inUse.has(i) ? "border-line bg-surface-2 text-ink-3/50" : "border-line-strong bg-surface hover:border-accent",
            )}
          >
            {c}
          </button>
        ))}
        {!locked && inUse.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => commit(Array(task.numBlanks).fill(null))}>Clear</Button>
        )}
      </div>

      {feedback && <FeedbackBox feedback={feedback} />}
    </div>
  );
}
