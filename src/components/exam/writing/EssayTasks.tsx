"use client";

import type { ReactNode } from "react";
import type { ClientTask } from "@/engine/session/viewTypes";
import { countWords } from "@/lib/format";
import { cx } from "@/components/ui/primitives";
import { Avatar } from "./Avatar";

type Email = Extract<ClientTask, { kind: "write_email" }>;
type Discussion = Extract<ClientTask, { kind: "academic_discussion" }>;

/** Word count; `min` only where ETS states one (Academic Discussion: at least 100 words). */
function Counter({ text, min }: { text: string; min?: number }) {
  const words = countWords(text);
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-2 text-sm text-ink-3 tabular">
      <span>
        Words: <span className={cx("font-medium", min !== undefined && words >= min ? "text-success" : "text-ink")}>{words}</span>
        {min !== undefined && <span className="ml-1">(at least {min})</span>}
      </span>
      <span>Characters: {text.length}</span>
    </div>
  );
}

function Editor({ value, onChange, disabled, label, rows = 14 }: { value: string; onChange: (v: string) => void; disabled: boolean; label: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      aria-label={label}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="sentences"
      className="block min-h-[280px] w-full resize-y bg-surface px-4 py-3 text-[16px] leading-relaxed outline-none disabled:bg-surface-2 disabled:text-ink-2"
    />
  );
}

export function EmailTaskView({ task, text, onChange, disabled, bookmark }: { task: Email; text: string; onChange: (v: string) => void; disabled: boolean; bookmark?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="space-y-4 text-[15px] leading-relaxed">
        <div className="rounded-lg border border-line bg-surface p-5">
          <p>{task.situation}</p>
          <p className="mt-3 font-medium">{task.taskInstructions.replace(/do each of the following:?$/i, "do the following.")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {task.requiredPoints.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <p className="mt-3">Write as much as you can and in complete sentences.</p>
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 pt-2 text-sm font-medium">
          Your Response:
          {bookmark}
        </div>
        <dl className="grid grid-cols-[72px_1fr] gap-y-1 border-b border-line px-4 py-3 text-sm">
          <dt className="text-ink-3">To:</dt><dd>{task.recipient}</dd>
          <dt className="text-ink-3">Subject:</dt><dd className="font-medium">{task.subject}</dd>
        </dl>
        <Editor value={text} onChange={onChange} disabled={disabled} label="Your email" />
        <Counter text={text} />
      </section>
    </div>
  );
}

export function DiscussionTaskView({ task, text, onChange, disabled, bookmark }: { task: Discussion; text: string; onChange: (v: string) => void; disabled: boolean; bookmark?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
      <section className="space-y-4 text-[15px] leading-relaxed">
        <div className="text-ink-2">
          <p>{task.topicIntro}</p>
          <p className="mt-2">In your response, you should do the following.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Express and support your opinion.</li>
            <li>Make a contribution to the discussion in your own words.</li>
          </ul>
          <p className="mt-2">An effective response will contain at least {task.targetWords.min} words.</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <Avatar src={task.professor.image} name={task.professor.name} size={40} />
            <div className="font-semibold">{task.professor.name}</div>
          </div>
          <p className="mt-3">{task.professor.text}</p>
        </div>
        {task.students.map((s) => (
          <div key={s.name} className="ml-4 rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex items-center gap-3">
              <Avatar src={s.image} name={s.name} size={32} />
              <div className="text-sm font-semibold">{s.name}</div>
            </div>
            <p className="mt-2 text-[15px]">{s.text}</p>
          </div>
        ))}
      </section>
      <section className="self-start overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm font-medium">
          Your response
          {bookmark}
        </div>
        <Editor value={text} onChange={onChange} disabled={disabled} label="Your discussion post" rows={16} />
        <Counter text={text} min={task.targetWords.min} />
      </section>
    </div>
  );
}
