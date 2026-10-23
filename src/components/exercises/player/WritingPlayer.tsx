"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type WritingPrompt, WRITING_MIN_WORDS } from "@/engine/exercises/types";
import type { ExerciseView } from "@/server/exercises";
import { countWords } from "@/lib/format";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { Avatar } from "@/components/exam/writing/Avatar";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import { WritingEvaluationView } from "../feedback";
import type { Act } from "./ExercisePlayer";

/** Word count against the minimum for the task and level, with how many words are still missing. */
function WordGoal({ words, characters, min, official }: { words: number; characters: number; min: number; official: boolean }) {
  const done = words >= min;
  return (
    <div className="min-w-0 flex-1" aria-live="polite">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm tabular">
        <span className={cx("font-semibold", done ? "text-success" : "text-ink")}>
          {words} / {min} words {done ? "✓" : "minimum"}
        </span>
        <span className="text-ink-3">{characters} characters</span>
        <span className={cx(done ? "text-success" : "text-ink-3")}>
          {done ? "Minimum reached" : `${min - words} more word${min - words === 1 ? "" : "s"} to go`}
          {official ? " · the TOEFL asks for at least 100" : ""}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-line" aria-hidden>
        <div className={cx("h-full rounded-full transition-[width] duration-300", done ? "bg-success" : "bg-accent")} style={{ width: `${Math.min(100, Math.round((words / min) * 100))}%` }} />
      </div>
    </div>
  );
}

function store(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function PromptPanel({ prompt }: { prompt: WritingPrompt }) {
  if (prompt.type === "email") {
    return (
      <div className="space-y-4 text-[15px] leading-relaxed">
        <p>{prompt.situation}</p>
        <div>
          <p className="font-medium">In your email, do the following:</p>
          <ul className="mt-2 space-y-1.5">
            {prompt.tasks.map((t, i) => (
              <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-ink-3">Write as much as you can and in complete sentences.</p>
      </div>
    );
  }
  if (prompt.type === "discussion") {
    return (
      <div className="space-y-4 text-[15px] leading-relaxed">
        <p className="text-ink-2">Your professor is teaching a class. Write a post responding to the professor&apos;s question. In your response, express and support your opinion and make a contribution to the discussion.</p>
        <div className="rounded-lg border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Avatar src={null} name={prompt.professor.name} size={28} /> {prompt.professor.name}</div>
          <p className="mt-2">{prompt.professor.text}</p>
        </div>
        {prompt.students.map((s) => (
          <div key={s.name} className="ml-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Avatar src={null} name={s.name} size={28} /> {s.name}</div>
            <p className="mt-2">{s.text}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      <p className="text-lg">{prompt.prompt}</p>
      <p className="text-ink-3">Give your opinion and support it with reasons and examples. Write at least {WRITING_MIN_WORDS.essay[prompt.level]} words at {prompt.level}.</p>
    </div>
  );
}

function Editor({
  view,
  prompt,
  act,
  busy,
  setRemainingMs,
}: {
  view: ExerciseView;
  prompt: WritingPrompt;
  act: Act;
  busy: boolean;
  setRemainingMs: (ms: number | null) => void;
}) {
  const key = `toefl-writing-${view.id}-${prompt.id}`;
  const [text, setText] = useState(() => store(`${key}-text`) ?? "");
  const [subject, setSubject] = useState(() => store(`${key}-subject`) ?? "");
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);
  const reg = useRegister(view.id);
  const limit = view.config.timeLimit ?? null;

  useEffect(() => {
    store(`${key}-text`, text);
    store(`${key}-subject`, subject);
  }, [key, text, subject]);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setError(null);
    try {
      await act({ type: "writing", itemId: prompt.id, text, subject: prompt.type === "email" ? subject : undefined });
      store(`${key}-text`, null);
      store(`${key}-subject`, null);
      setRemainingMs(null);
    } catch (e) {
      submitted.current = false;
      setError((e as Error).message);
    }
  }, [act, prompt, text, subject, key, setRemainingMs]);

  // Timer starts when the prompt first opens (kept across reloads) and submits automatically at 0.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    if (!limit) {
      setRemainingMs(null);
      return;
    }
    const startKey = `${key}-start`;
    const started = Number(store(startKey)) || Date.now();
    store(startKey, String(started));
    const tick = () => {
      const left = Math.max(0, started + limit * 1000 - Date.now());
      setRemainingMs(left);
      if (left <= 0) void submitRef.current();
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [key, limit, setRemainingMs]);

  const words = countWords(text);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="min-w-0 rounded-xl border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-24 lg:self-start">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            {prompt.type === "email" ? "Write an Email" : prompt.type === "discussion" ? "Academic Discussion" : "General Writing · custom practice"}
          </div>
          <BookmarkButton saved={reg.isSaved(prompt.id)} onToggle={() => void reg.toggle(prompt.id)} label="prompt" />
        </div>
        <PromptPanel prompt={prompt} />
      </section>

      <section className="flex min-w-0 flex-col">
        {prompt.type === "email" && (
          <div className="mb-3 space-y-2 text-[15px]">
            <div className="flex items-center gap-3 border-b border-line pb-2"><span className="w-16 text-ink-3">To</span><span>{prompt.to}</span></div>
            <label className="flex items-center gap-3 border-b border-line pb-2">
              <span className="w-16 text-ink-3">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Your subject" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
            </label>
          </div>
        )}
        {prompt.type === "discussion" && <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">Your Response</h2>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your response here…"
          aria-label="Your response"
          spellCheck={false}
          autoCorrect="off"
          className="min-h-[46vh] w-full flex-1 resize-y rounded-xl border border-line bg-surface px-5 py-4 text-[17px] leading-[1.8] outline-none transition-colors focus:border-accent/60"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <WordGoal
            words={words}
            characters={text.length}
            min={WRITING_MIN_WORDS[prompt.type][prompt.level]}
            official={prompt.type === "discussion" && WRITING_MIN_WORDS.discussion[prompt.level] === 100}
          />
          <Button variant="primary" size="lg" disabled={busy || words === 0} onClick={() => void submit()}>
            {busy && <Spinner />} Submit
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-3">The browser&apos;s spell checker is off, as in the real test. Your draft is saved on this device until you submit.</p>
        {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      </section>
    </div>
  );
}

export function WritingPlayer({
  view,
  act,
  busy,
  setRemainingMs,
  onFinish,
}: {
  view: ExerciseView;
  act: Act;
  busy: boolean;
  setRemainingMs: (ms: number | null) => void;
  onFinish: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const last = view.attempts[view.attempts.length - 1];
  const current = view.current?.kind === "writing" ? view.current : null;

  if (current) return <Editor key={current.itemId} view={view} prompt={current.prompt} act={act} busy={busy} setRemainingMs={setRemainingMs} />;
  if (!last) return null;

  const stage = last.ai?.stage;
  if (stage && stage !== "done" && stage !== "error") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface px-6 py-14 text-center">
        <Spinner />
        <h1 className="mt-4 text-xl font-semibold">Evaluating your writing…</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          {stage === "queued" ? "Waiting for the local AI model." : "The local AI model is checking grammar, spelling, vocabulary, organization and task fulfillment."}
        </p>
        <p className="mt-4 text-sm text-ink-3">This usually takes under a minute. You can leave this page; the result will be in your exercise history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Writing Evaluation · Response {view.attempts.length}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your feedback</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={onFinish} disabled={busy}>Finish practice</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => act({ type: "next" }).catch((e) => setError((e as Error).message))}
          >
            {busy && <Spinner />} Next prompt <IconArrowRight />
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      {stage === "error" ? (
        <div className="rounded-xl border border-danger/30 bg-danger-weak px-5 py-4">
          <p className="font-medium text-danger">{last.ai?.error ?? "The evaluation failed."}</p>
          <p className="mt-1 text-sm text-ink-2">Your response is saved. Retry the evaluation when the AI model is available.</p>
          <Button className="mt-3" onClick={() => act({ type: "retry", itemId: last.itemId }).catch((e) => setError((e as Error).message))}>Retry evaluation</Button>
        </div>
      ) : last.feedback?.kind === "writing" ? (
        <WritingEvaluationView fb={last.feedback} text={last.answer ?? ""} subject={last.subject} />
      ) : null}
    </div>
  );
}
