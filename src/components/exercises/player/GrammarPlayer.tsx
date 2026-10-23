"use client";

import { useEffect, useRef, useState } from "react";
import { GRAMMAR_CATEGORY_LABEL, type GrammarQuestion } from "@/engine/exercises/types";
import type { ExerciseView, RevealedAttempt } from "@/server/exercises";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import { GrammarExplanation, GrammarOptions, GrammarStem, Verdict } from "../feedback";
import type { Act } from "./ExercisePlayer";

export function GrammarPlayer({ view, act, busy, setHolding }: { view: ExerciseView; act: Act; busy: boolean; setHolding: (v: boolean) => void }) {
  const [shown, setShown] = useState<RevealedAttempt | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cont = useRef<HTMLButtonElement>(null);
  const reg = useRegister(view.id);

  const current = view.current?.kind === "grammar" ? view.current : null;
  const q = shown ? (shown.detail as GrammarQuestion | null) : null;
  const stem = q?.stem ?? current?.stem ?? "";
  const options = q?.options ?? current?.options ?? [];
  const category = q?.category ?? current?.category;
  const generated = q ? q.source === "generated" : current?.generated;
  const itemId = shown?.itemId ?? current?.itemId ?? null;
  const fb = shown?.feedback?.kind === "grammar" ? shown.feedback : null;

  useEffect(() => {
    if (shown) cont.current?.focus();
  }, [shown]);

  // Keyboard: 1–4 / A–D select, Enter submits.
  useEffect(() => {
    if (shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const i = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && i < options.length && e.key.length === 1) setSelected(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, options.length]);

  const submit = async () => {
    if (!current || selected === null || busy) return;
    setError(null);
    try {
      const v = await act({ type: "answer", itemId: current.itemId, value: String(selected) });
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
    setSelected(null);
    setHolding(false);
  };

  if (!current && !shown) return null;
  const correct = shown?.correct === true;

  return (
    <div className="mx-auto max-w-2xl">
      <div key={itemId} className={cx("relative rounded-xl border border-line bg-surface px-5 py-7 sm:px-9 sm:py-9", shown && !correct && "shake")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            Choose the correct answer
            {generated && <span className="rounded-full bg-warn-weak px-2 py-0.5 normal-case tracking-normal text-warn">From your mistakes</span>}
          </div>
          {itemId && <BookmarkButton saved={reg.isSaved(itemId)} onToggle={() => void reg.toggle(itemId)} />}
        </div>
        <div className="mt-4"><GrammarStem stem={stem} /></div>
        <div className="mt-7">
          <GrammarOptions options={options} selected={shown ? Number(shown.answer) : selected} onSelect={shown ? undefined : setSelected} feedback={fb} />
        </div>

        {!shown ? (
          <div className="mt-7 flex items-center justify-between gap-3">
            <span className="hidden text-sm text-ink-3 sm:inline">{category ? GRAMMAR_CATEGORY_LABEL[category] : ""}</span>
            <Button variant="primary" size="lg" disabled={selected === null || busy} onClick={() => void submit()} className="w-full sm:w-auto">
              {busy && <Spinner />} Submit Answer
            </Button>
          </div>
        ) : (
          <div className="mt-7 space-y-5">
            <Verdict correct={correct} labels={["Correct", "Incorrect"]} />
            {shown.heartLost && <p className="-mt-3 text-sm text-ink-3">One heart lost · this question will come back for review.</p>}
            {fb && <GrammarExplanation fb={fb} />}
            <div className="flex justify-end">
              <Button ref={cont} variant="primary" size="lg" onClick={next}>
                {view.status === "active" ? "Continue" : "See results"} <IconArrowRight />
              </Button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}
