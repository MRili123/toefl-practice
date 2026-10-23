"use client";

import { useEffect, useRef, useState } from "react";
import type { ExerciseView, RevealedAttempt } from "@/server/exercises";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import { SpellingFeedbackView, Verdict } from "../feedback";
import { AudioControl, useItemAudio } from "../shared";
import type { Act } from "./ExercisePlayer";

export function SpellingPlayer({ view, act, busy, setHolding }: { view: ExerciseView; act: Act; busy: boolean; setHolding: (v: boolean) => void }) {
  const [shown, setShown] = useState<RevealedAttempt | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cont = useRef<HTMLButtonElement>(null);
  const reg = useRegister(view.id);

  const current = view.current?.kind === "spelling" ? view.current : null;
  const itemId = shown?.itemId ?? current?.itemId ?? null;
  const audio = useItemAudio(view.id, itemId, { autoPlay: !shown && view.attempts.length > 0 });
  const isSentence = shown ? shown.detail !== null && "type" in shown.detail && shown.detail.type === "sentence" : current?.type === "sentence";

  useEffect(() => {
    if (shown) cont.current?.focus();
    else input.current?.focus();
  }, [shown, itemId]);

  const submit = async (answer: string) => {
    if (!current || busy) return;
    setError(null);
    try {
      const v = await act({ type: "answer", itemId: current.itemId, value: answer });
      const a = v?.attempts[v.attempts.length - 1];
      if (a) {
        setShown(a);
        setHolding(true);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const next = () => {
    setShown(null);
    setValue("");
    setHolding(false);
  };

  if (!current && !shown) return null;
  const correct = shown?.correct === true;

  return (
    <div className="mx-auto max-w-2xl">
      <div key={shown ? `fb-${shown.itemId}` : itemId} className={cx("relative rounded-xl border border-line bg-surface px-5 py-8 sm:px-10 sm:py-10", shown && !correct && "shake")}>
        {itemId && (
          <div className="absolute right-3 top-3">
            <BookmarkButton saved={reg.isSaved(itemId)} onToggle={() => void reg.toggle(itemId)} label={isSentence ? "sentence" : "word"} />
          </div>
        )}
        <div className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{isSentence ? "Sentence" : "Word"}</div>
        <h1 className="mt-1 text-center text-xl font-semibold">{shown ? "Listen again and compare" : "Listen carefully"}</h1>
        <div className="mt-7">
          <AudioControl audio={audio} big label="Play audio" />
        </div>

        {!shown ? (
          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) void submit(value);
            }}
          >
            <label htmlFor="spelling-answer" className="sr-only">Type what you hear</label>
            {isSentence ? (
              <textarea
                id="spelling-answer"
                ref={(el) => {
                  input.current = el;
                }}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (value.trim()) void submit(value);
                  }
                }}
                rows={3}
                placeholder="Type what you hear"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                className="w-full resize-none rounded-lg border border-line-strong bg-surface px-4 py-3 text-lg leading-relaxed outline-none transition-colors focus:border-accent"
              />
            ) : (
              <input
                id="spelling-answer"
                ref={(el) => {
                  input.current = el;
                }}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Type what you hear"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                autoComplete="off"
                className="h-16 w-full rounded-lg border border-line-strong bg-surface px-5 text-center text-2xl tracking-wide outline-none transition-colors focus:border-accent"
              />
            )}
            <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void submit("")}>I don&apos;t know</Button>
              <Button type="submit" variant="primary" size="lg" disabled={!value.trim() || busy}>
                {busy && <Spinner />} Submit
              </Button>
            </div>
            {error && <p className="mt-3 text-center text-sm text-danger" role="alert">{error}</p>}
          </form>
        ) : (
          <div className="mt-8 border-t border-line pt-7">
            <div className="flex justify-center"><Verdict correct={correct} /></div>
            {shown.heartLost && <p className="mt-1 text-center text-sm text-ink-3">One heart lost · this {isSentence ? "sentence" : "word"} will come back for review.</p>}
            <div className="mt-6">{shown.feedback?.kind === "spelling" && <SpellingFeedbackView fb={shown.feedback} correct={correct} />}</div>
            <div className="mt-8 flex justify-end">
              <Button ref={cont} variant="primary" size="lg" onClick={next}>
                {view.status === "active" ? "Continue" : "See results"} <IconArrowRight />
              </Button>
            </div>
          </div>
        )}
      </div>
      {!shown && <p className="mt-4 text-center text-sm text-ink-3">Capitalization and punctuation are not counted.</p>}
    </div>
  );
}
