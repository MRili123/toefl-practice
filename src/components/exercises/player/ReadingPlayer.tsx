"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadingFeedback } from "@/engine/exercises/types";
import type { ClientAnswer, ItemFeedback } from "@/engine/session/viewTypes";
import type { ClientItem, ExerciseView, RevealedAttempt } from "@/server/exercises";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import { CompleteTheWords } from "@/components/exam/reading/CompleteTheWords";
import { Verdict } from "../feedback";
import type { Act } from "./ExercisePlayer";

type Passage = Extract<ClientItem, { kind: "reading" }>;

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

function loadDraft(key: string): Record<string, string> {
  try {
    return key ? JSON.parse(store(`${key}-answers`) ?? "{}") : {};
  } catch {
    return {};
  }
}

/** The exam's Complete the Words view, fed from an exercise passage (and its corrected answers, once checked). */
export function ReadingPassageView({
  passage,
  values,
  onChange,
  feedback,
  bookmark,
}: {
  passage: { itemId: string; segments: string[]; blanks: { id: string; prefix: string; letters: number }[] };
  values: Record<string, string>;
  onChange?: (blankId: string, value: string) => void;
  feedback: ReadingFeedback | null;
  bookmark?: React.ReactNode;
}) {
  const task = useMemo(
    () => ({ kind: "complete_the_words" as const, id: passage.itemId, segments: passage.segments, blanks: passage.blanks }),
    [passage],
  );
  const answers = useMemo(
    () => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { kind: "text", value: v } as ClientAnswer])),
    [values],
  );
  const fb = useMemo<Record<string, ItemFeedback>>(
    () =>
      Object.fromEntries(
        (feedback?.blanks ?? []).map((b) => [
          b.id,
          { correctness: b.correct ? "correct" : b.given ? "incorrect" : "unanswered", correctOptionId: null, yourAnswer: b.given ? b.prefix + b.given : null, correctAnswer: b.fullWord, explanation: null },
        ]),
      ),
    [feedback],
  );
  return <CompleteTheWords task={task} answers={answers} onChange={onChange ?? (() => undefined)} disabled={!onChange || !!feedback} feedback={fb} firstNumber={1} bookmark={bookmark} />;
}

/** Turns a stored attempt back into the passage shape the view needs (review screens). */
export function passageFromFeedback(itemId: string, fb: ReadingFeedback, segments: string[]) {
  return {
    passage: { itemId, segments, blanks: fb.blanks.map((b) => ({ id: b.id, prefix: b.prefix, letters: b.answer.length })) },
    values: Object.fromEntries(fb.blanks.map((b) => [b.id, b.given])),
  };
}

export function ReadingPlayer({
  view,
  act,
  busy,
  setHolding,
  setRemainingMs,
}: {
  view: ExerciseView;
  act: Act;
  busy: boolean;
  setHolding: (v: boolean) => void;
  setRemainingMs: (ms: number | null) => void;
}) {
  const current = view.current?.kind === "reading" ? view.current : null;
  const [shown, setShown] = useState<{ attempt: RevealedAttempt; passage: Passage } | null>(null);
  const passage = shown?.passage ?? current;
  const key = passage ? `toefl-reading-${view.id}-${passage.itemId}` : "";
  // What was typed for the passage on screen (also kept in storage, so a reload does not lose it).
  const [draft, setDraft] = useState<{ itemId: string; values: Record<string, string> } | null>(null);
  const values = passage && draft?.itemId === passage.itemId ? draft.values : loadDraft(key);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);
  const cont = useRef<HTMLButtonElement>(null);
  const reg = useRegister(view.id);
  const limit = view.config.timeLimit ?? null;

  const update = (blankId: string, v: string) => {
    if (!passage) return;
    const next = { ...values, [blankId]: v };
    store(`${key}-answers`, JSON.stringify(next));
    setDraft({ itemId: passage.itemId, values: next });
  };

  const submit = useCallback(
    async (timedOut: boolean) => {
      if (!current || submitted.current) return;
      submitted.current = true;
      setError(null);
      try {
        const v = await act({ type: "answer", itemId: current.itemId, value: JSON.stringify({ answers: values, timedOut }) });
        const a = v?.attempts[v.attempts.length - 1];
        store(`${key}-answers`, null);
        store(`${key}-start`, null);
        setRemainingMs(null);
        if (a) {
          setShown({ attempt: a, passage: current });
          setHolding(true);
        }
      } catch (e) {
        submitted.current = false;
        setError((e as Error).message);
      }
    },
    [act, current, values, key, setHolding, setRemainingMs],
  );

  // Per-passage timer: starts when the passage first opens (kept across reloads) and submits at 0.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  const timedItem = !shown && current && limit ? current.itemId : null;
  useEffect(() => {
    if (!timedItem || !limit) {
      setRemainingMs(null);
      return;
    }
    const startKey = `toefl-reading-${view.id}-${timedItem}-start`;
    const started = Number(store(startKey)) || Date.now();
    store(startKey, String(started));
    const tick = () => {
      const left = Math.max(0, started + limit * 1000 - Date.now());
      setRemainingMs(left);
      if (left <= 0) void submitRef.current(true);
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [timedItem, limit, view.id, setRemainingMs]);

  useEffect(() => {
    if (shown) cont.current?.focus();
  }, [shown]);

  const next = () => {
    submitted.current = false;
    setShown(null);
    setDraft(null);
    setHolding(false);
  };

  if (!passage) return null;
  const fb = shown?.attempt.feedback?.kind === "reading" ? shown.attempt.feedback : null;
  const filled = passage.blanks.filter((b) => (values[b.id] ?? "").length > 0).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <span className="font-medium text-ink">{passage.title}</span>
        {passage.review && <span className="rounded-full bg-warn-weak px-2 py-0.5 text-xs text-warn">From your mistakes</span>}
      </div>
      <div className={cx(fb && fb.correct < fb.total && "shake")}>
        <ReadingPassageView
          passage={passage}
          values={fb ? Object.fromEntries(fb.blanks.map((b) => [b.id, b.given])) : values}
          onChange={fb ? undefined : update}
          feedback={fb}
          bookmark={<BookmarkButton saved={reg.isSaved(passage.itemId)} onToggle={() => void reg.toggle(passage.itemId)} />}
        />
      </div>

      {!fb ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink-3 tabular">{filled} / {passage.blanks.length} words completed</span>
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void submit(false)} className="w-full sm:w-auto">
            {busy && <Spinner />} Check Answers
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Verdict correct={fb.correct === fb.total} labels={["All words correct", `${fb.correct} / ${fb.total} words correct`]} />
          {fb.timedOut && <p className="-mt-2 text-sm text-ink-3">Time was up — your answers were checked automatically.</p>}
          {fb.correct < fb.total && <p className="-mt-2 text-sm text-ink-3">This passage is saved to your mistakes and will come back until you complete it perfectly.</p>}
          <div className="flex justify-end">
            <Button ref={cont} variant="primary" size="lg" onClick={next}>
              {view.status === "active" ? "Next Passage" : "See results"} <IconArrowRight />
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
