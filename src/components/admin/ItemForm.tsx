"use client";

import { type ReactNode, useState } from "react";
import {
  type Cefr, GRAMMAR_CATEGORIES, GRAMMAR_CATEGORY_LABEL, SPEAKING_TOPICS, type SpeakingTopic, TOPIC_LABEL,
} from "@/engine/exercises/types";
import type { AdminItem, AdminKind } from "@/server/admin/content";
import { api } from "@/lib/api";
import { Button, ChipGroup, cx, Spinner } from "@/components/ui/primitives";
import { LevelStepper } from "@/components/exercises/shared";

export const inputCls = "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-accent";
export const textareaCls = "w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[15px] leading-relaxed outline-none focus:border-accent";

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Mirrors the server's passage rule (keep the first half, rounded down) so the author sees how words are cut. */
function previewBlanks(text: string) {
  return [...text.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => {
    const w = m[1];
    const keep = Math.max(1, Math.floor(w.length / 2));
    return { prefix: w.slice(0, keep), missing: w.slice(keep) };
  });
}

type Draft = {
  level: Cefr;
  // reading
  title: string;
  text: string;
  // spelling
  type: "word" | "sentence" | "email" | "discussion" | "essay";
  // grammar
  stem: string;
  options: string[];
  answer: number;
  explanation: string;
  category: string;
  // writing
  situation: string;
  to: string;
  tasks: string[];
  professor: { name: string; text: string };
  students: { name: string; text: string }[];
  prompt: string;
  // interaction
  topic: SpeakingTopic;
};

function initial(kind: AdminKind, item: AdminItem | null, defaults: Partial<Draft>): Draft {
  const d: Draft = {
    level: "B1", title: "", text: "", type: kind === "writing" ? "email" : "word", stem: "", options: ["", "", "", ""], answer: 0,
    explanation: "", category: GRAMMAR_CATEGORIES[0], situation: "", to: "", tasks: ["", "", ""], professor: { name: "", text: "" },
    students: [{ name: "", text: "" }, { name: "", text: "" }], prompt: "", topic: "education", ...defaults,
  };
  if (!item) return d;
  return { ...d, ...(item as Partial<Draft>), level: item.level };
}

function body(kind: AdminKind, d: Draft): unknown {
  switch (kind) {
    case "reading": return { level: d.level, title: d.title, text: d.text };
    case "spelling": return { level: d.level, type: d.type, text: d.text };
    case "grammar": return { level: d.level, stem: d.stem, options: d.options, answer: d.answer, explanation: d.explanation, category: d.category };
    case "writing":
      if (d.type === "email") return { level: d.level, type: "email", situation: d.situation, to: d.to, tasks: d.tasks.filter((t) => t.trim()) };
      if (d.type === "discussion") return { level: d.level, type: "discussion", professor: d.professor, students: d.students.filter((s) => s.name.trim() || s.text.trim()) };
      return { level: d.level, type: "essay", prompt: d.prompt };
    case "interaction": return { level: d.level, topic: d.topic, text: d.text };
    case "repeat": return { level: d.level, text: d.text };
  }
}

const KIND_NAME: Record<AdminKind, string> = {
  reading: "passage", spelling: "spelling item", grammar: "grammar question", writing: "writing prompt", interaction: "speaking question", repeat: "Listen & Repeat sentence",
};

export function ItemForm({
  kind,
  item,
  defaults,
  onSaved,
  onCancel,
}: {
  kind: AdminKind;
  item: AdminItem | null;
  defaults: Partial<Draft>;
  onSaved: (item: AdminItem) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => initial(kind, item, defaults));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = item ? await api.adminUpdate(kind, item.id, body(kind, d)) : await api.adminCreate(kind, body(kind, d));
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const blanks = kind === "reading" ? previewBlanks(d.text) : [];

  return (
    <form
      className="flex max-h-[85dvh] flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="overflow-y-auto p-6">
        <h2 className="text-lg font-semibold">{item ? `Edit ${KIND_NAME[kind]}` : `Add a ${KIND_NAME[kind]}`}</h2>
        {item && <p className="mt-0.5 font-mono text-xs text-ink-3">{item.id}</p>}

        <Row label="Level" hint="You can move an item to another level at any time">
          <LevelStepper value={d.level} onChange={(level) => set({ level })} />
        </Row>

        {kind === "reading" && (
          <>
            <Row label="Title">
              <input className={inputCls} value={d.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Coral Reefs" />
            </Row>
            <Row label="Paragraph" hint={<span className={cx("tabular", blanks.length === 10 ? "text-success" : "text-warn")}>{blanks.length} / 10 words marked</span>}>
              <textarea
                className={cx(textareaCls, "min-h-40")}
                value={d.text}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="Coral reefs are among the most diverse ecosystems on Earth. {Millions} of tiny organisms called polyps build {massive} structures…"
              />
              <p className="mt-1.5 text-xs text-ink-3">
                Keep the first sentence complete. Put each of the 10 words to complete in {"{braces}"}; the second half of the word is hidden, as in the test.
              </p>
              {blanks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
                  {blanks.map((b, i) => (
                    <span key={i} className="rounded border border-line bg-surface-2 px-1.5 font-mono">
                      {b.prefix}<span className="text-ink-3">{"_".repeat(b.missing.length)}</span>
                    </span>
                  ))}
                </div>
              )}
            </Row>
          </>
        )}

        {kind === "spelling" && (
          <>
            <Row label="Type">
              <ChipGroup label="Spelling type" options={[{ id: "word", label: "Word" }, { id: "sentence", label: "Sentence" }]} value={d.type as "word" | "sentence"} onChange={(type) => set({ type })} />
            </Row>
            <Row label={d.type === "word" ? "Word" : "Sentence"} hint={d.type === "word" ? "lowercase, one word" : "ends with . ! or ?, numbers written as words"}>
              <input className={inputCls} value={d.text} maxLength={300} onChange={(e) => set({ text: e.target.value })} placeholder={d.type === "word" ? "environment" : "The library closes early on Fridays."} />
            </Row>
          </>
        )}

        {kind === "grammar" && (
          <>
            <Row label="Sentence" hint='one blank written "_____"'>
              <input className={inputCls} value={d.stem} maxLength={300} onChange={(e) => set({ stem: e.target.value })} placeholder="She _____ to the library every morning." />
            </Row>
            <Row label="Options" hint="select the correct one">
              <div className="space-y-2" role="radiogroup" aria-label="Correct answer">
                {d.options.map((o, i) => (
                  <label key={i} className={cx("flex items-center gap-2 rounded-md border px-2", d.answer === i ? "border-success/50 bg-success-weak" : "border-line")}>
                    <input type="radio" name="answer" checked={d.answer === i} onChange={() => set({ answer: i })} aria-label={`Option ${"ABCD"[i]} is correct`} />
                    <span className="w-4 font-mono text-sm text-ink-3">{"ABCD"[i]}</span>
                    <input
                      className="h-10 flex-1 bg-transparent text-[15px] outline-none"
                      value={o}
                      maxLength={80}
                      onChange={(e) => set({ options: d.options.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder={`Option ${"ABCD"[i]}`}
                    />
                  </label>
                ))}
              </div>
            </Row>
            <Row label="Category">
              <select className={inputCls} value={d.category} onChange={(e) => set({ category: e.target.value })}>
                {GRAMMAR_CATEGORIES.map((c) => <option key={c} value={c}>{GRAMMAR_CATEGORY_LABEL[c]}</option>)}
              </select>
            </Row>
            <Row label="Explanation" hint="shown after the answer">
              <textarea className={cx(textareaCls, "min-h-20")} value={d.explanation} maxLength={600} onChange={(e) => set({ explanation: e.target.value })} />
            </Row>
          </>
        )}

        {kind === "writing" && (
          <>
            <Row label="Task">
              {item ? (
                <p className="text-[15px]">{d.type === "email" ? "Write an Email" : d.type === "discussion" ? "Academic Discussion" : "General Writing"}</p>
              ) : (
                <ChipGroup
                  label="Writing task"
                  options={[{ id: "email", label: "Write an Email" }, { id: "discussion", label: "Academic Discussion" }, { id: "essay", label: "General Writing" }]}
                  value={d.type as "email" | "discussion" | "essay"}
                  onChange={(type) => set({ type })}
                />
              )}
            </Row>
            {d.type === "email" && (
              <>
                <Row label="Situation">
                  <textarea className={cx(textareaCls, "min-h-24")} value={d.situation} onChange={(e) => set({ situation: e.target.value })} />
                </Row>
                <Row label="To">
                  <input className={inputCls} value={d.to} maxLength={80} onChange={(e) => set({ to: e.target.value })} placeholder="Professor Lee" />
                </Row>
                <Row label="In your email, do the following" hint="1–5 points">
                  <div className="space-y-2">
                    {d.tasks.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <input className={inputCls} value={t} maxLength={300} onChange={(e) => set({ tasks: d.tasks.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Point ${i + 1}`} />
                        {d.tasks.length > 1 && <Button type="button" variant="ghost" onClick={() => set({ tasks: d.tasks.filter((_, j) => j !== i) })} aria-label={`Remove point ${i + 1}`}>✕</Button>}
                      </div>
                    ))}
                    {d.tasks.length < 5 && <Button type="button" size="sm" onClick={() => set({ tasks: [...d.tasks, ""] })}>Add a point</Button>}
                  </div>
                </Row>
              </>
            )}
            {d.type === "discussion" && (
              <>
                <Row label="Professor">
                  <input className={cx(inputCls, "mb-2")} value={d.professor.name} maxLength={40} onChange={(e) => set({ professor: { ...d.professor, name: e.target.value } })} placeholder="Dr. Gupta" />
                  <textarea className={cx(textareaCls, "min-h-24")} value={d.professor.text} onChange={(e) => set({ professor: { ...d.professor, text: e.target.value } })} placeholder="The professor's question" />
                </Row>
                {d.students.map((s, i) => (
                  <Row key={i} label={`Student ${i + 1}`} hint={d.students.length > 1 ? <button type="button" className="text-accent hover:underline" onClick={() => set({ students: d.students.filter((_, j) => j !== i) })}>Remove</button> : undefined}>
                    <input className={cx(inputCls, "mb-2")} value={s.name} maxLength={40} onChange={(e) => set({ students: d.students.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Name" />
                    <textarea className={cx(textareaCls, "min-h-20")} value={s.text} onChange={(e) => set({ students: d.students.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} placeholder="The student's post" />
                  </Row>
                ))}
                {d.students.length < 3 && <Button type="button" size="sm" className="mt-3" onClick={() => set({ students: [...d.students, { name: "", text: "" }] })}>Add a student</Button>}
              </>
            )}
            {d.type === "essay" && (
              <Row label="Prompt">
                <textarea className={cx(textareaCls, "min-h-28")} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} />
              </Row>
            )}
          </>
        )}

        {kind === "interaction" && (
          <>
            <Row label="Topic">
              <select className={inputCls} value={d.topic} onChange={(e) => set({ topic: e.target.value as SpeakingTopic })}>
                {SPEAKING_TOPICS.map((t) => <option key={t} value={t}>{TOPIC_LABEL[t]}</option>)}
              </select>
            </Row>
            <Row label="Question" hint="ends with ? or .">
              <textarea className={cx(textareaCls, "min-h-20")} value={d.text} maxLength={400} onChange={(e) => set({ text: e.target.value })} placeholder="What do you usually do to protect the environment?" />
            </Row>
          </>
        )}

        {kind === "repeat" && (
          <Row label="Sentence" hint="numbers written as words">
            <textarea className={cx(textareaCls, "min-h-20")} value={d.text} maxLength={300} onChange={(e) => set({ text: e.target.value })} placeholder="The lecture has been moved to the main hall." />
          </Row>
        )}

        {item && (kind === "spelling" || kind === "repeat" || kind === "interaction") && (
          <p className="mt-4 text-xs text-ink-3">Changing the text creates new audio the next time it is played{kind !== "interaction" ? " and resets this item's progress" : ""}.</p>
        )}
        {error && <p className="mt-4 rounded-md bg-danger-weak px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy && <Spinner />} {item ? "Save changes" : "Add"}</Button>
      </div>
    </form>
  );
}
