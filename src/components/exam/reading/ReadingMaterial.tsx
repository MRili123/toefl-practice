"use client";

import { useEffect, useRef } from "react";
import type { ClientTask } from "@/engine/session/viewTypes";

type DailyLife = Extract<ClientTask, { kind: "daily_life" }>;
type Passage = Extract<ClientTask, { kind: "academic_passage" }>;

const paras = (text: string) => text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);

export function DailyLifeText({ task }: { task: DailyLife }) {
  if (task.textType === "email" && task.email) {
    const e = task.email;
    return (
      <article className="rounded-lg border border-line bg-surface">
        <dl className="grid grid-cols-[72px_1fr] gap-y-1 border-b border-line px-5 py-4 text-sm">
          <dt className="text-ink-3">From</dt><dd>{e.from}</dd>
          <dt className="text-ink-3">To</dt><dd>{e.to}</dd>
          {e.date && (<><dt className="text-ink-3">Date</dt><dd>{e.date}</dd></>)}
          <dt className="text-ink-3">Subject</dt><dd className="font-semibold">{e.subject}</dd>
        </dl>
        <div className="passage px-5 py-4 text-[16px] leading-relaxed">
          {paras(e.body).map((p, i) => <p key={i}>{p}</p>)}
          {(e.signoff || e.senderName) && (
            <p className="whitespace-pre-line">{[e.signoff, e.senderName].filter(Boolean).join("\n")}</p>
          )}
        </div>
      </article>
    );
  }
  if (task.textType === "text_chain" && task.messages) {
    return (
      <article className="rounded-lg border border-line bg-surface">
        {task.title && <h3 className="border-b border-line px-5 py-3 text-sm font-semibold">{task.title}</h3>}
        <ol className="space-y-3 px-5 py-4">
          {task.messages.map((m, i) => (
            <li key={i} className="rounded-md bg-surface-2 px-3.5 py-2.5 ring-1 ring-line">
              <div className="flex justify-between text-xs text-ink-3">
                <span className="font-semibold text-ink-2">{m.sender}</span>
                <span className="tabular">{m.time}</span>
              </div>
              <p className="mt-1 text-[15px] leading-relaxed">{m.text}</p>
            </li>
          ))}
        </ol>
      </article>
    );
  }
  return (
    <article className="rounded-lg border-2 border-ink/80 bg-surface px-6 py-5">
      {task.title && <h3 className="mb-3 text-center text-lg font-bold uppercase tracking-wide">{task.title}</h3>}
      <div className="passage text-[16px] leading-relaxed">{paras(task.text ?? "").map((p, i) => <p key={i}>{p}</p>)}</div>
    </article>
  );
}

const wordRe = (word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

function splitOnWord(text: string, word: string): [string, string, string] | null {
  const m = wordRe(word).exec(text);
  return m ? [text.slice(0, m.index), m[0], text.slice(m.index + m[0].length)] : null;
}

/** Marks the target word, preferring the paragraph the question names ("in paragraph 2"). */
export function PassageText({ task, highlightText, stem }: { task: Passage; highlightText: string | null; stem: string | null }) {
  const markRef = useRef<HTMLElement>(null);
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightText, stem]);
  const named = stem ? Number(/paragraph\s+(\d+)/i.exec(stem)?.[1] ?? NaN) : NaN;
  const re = highlightText ? wordRe(highlightText) : null;
  const target = re
    ? Number.isFinite(named) && task.paragraphs[named - 1] && re.test(task.paragraphs[named - 1])
      ? named - 1
      : task.paragraphs.findIndex((p) => re.test(p))
    : -1;
  return (
    <article className="rounded-lg border border-line bg-surface px-5 py-5 sm:px-7">
      <h3 className="mb-4 text-lg font-semibold">{task.title}</h3>
      <div className="space-y-4 text-[16px] leading-[1.75]">
        {task.paragraphs.map((p, i) => {
          const parts = i === target && highlightText ? splitOnWord(p, highlightText) : null;
          return (
            <div key={i} className="grid grid-cols-[20px_1fr] gap-2">
              <span className="select-none pt-0.5 text-right text-xs text-ink-3 tabular">{i + 1}</span>
              <p>
                {parts ? (
                  <>
                    {parts[0]}
                    <mark ref={markRef} className="scroll-my-24 rounded-sm bg-[#fde9a8] px-0.5 text-ink">{parts[1]}</mark>
                    {parts[2]}
                  </>
                ) : (
                  p
                )}
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
