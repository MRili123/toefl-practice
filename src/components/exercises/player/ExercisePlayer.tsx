"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { areaOf, GRAMMAR_CATEGORY_LABEL, KIND_LABEL, TOPIC_LABEL, WRITING_TYPE_LABEL } from "@/engine/exercises/types";
import type { ExerciseView } from "@/server/exercises";
import { api, type ExerciseAction } from "@/lib/api";
import { pad2 } from "@/lib/format";
import { Button, EmptyState, Modal, Spinner } from "@/components/ui/primitives";
import { ExerciseHud } from "../shared";
import { EndScreen } from "./EndScreen";
import { GrammarPlayer } from "./GrammarPlayer";
import { ReadingPlayer } from "./ReadingPlayer";
import { SpeakingPlayer } from "./SpeakingPlayer";
import { SpellingPlayer } from "./SpellingPlayer";
import { WritingPlayer } from "./WritingPlayer";

export type Act = (action: ExerciseAction) => Promise<ExerciseView | null>;

const formatMinutes = (sec: number) => (sec % 60 ? `${Math.floor(sec / 60)}:${pad2(sec % 60)} min` : `${sec / 60} min`);

export function subtitleOf(v: ExerciseView): string | null {
  if (v.kind === "reading") return v.config.timeLimit ? `${formatMinutes(v.config.timeLimit)} per passage` : "No timer";
  if (v.kind === "writing" && v.config.writingType) return WRITING_TYPE_LABEL[v.config.writingType];
  if (v.kind === "speaking-interaction" && v.config.topic) return `${TOPIC_LABEL[v.config.topic]}${v.config.progressive ? " · progressive" : ""}`;
  if (v.kind === "grammar" && v.config.focus) return `Focus: ${GRAMMAR_CATEGORY_LABEL[v.config.focus]}`;
  if (v.kind === "spelling") return v.config.spellingType === "word" ? "Words" : v.config.spellingType === "sentence" ? "Sentences" : "Words & sentences";
  return null;
}

export function ExercisePlayer({ id }: { id: string }) {
  const router = useRouter();
  const [view, setView] = useState<ExerciseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The player keeps showing an item's feedback until the learner continues, even though the server moved on. */
  const [holding, setHolding] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const load = useCallback(() => api.exercise(id).then(setView, (e) => setError((e as Error).message)), [id]);
  useEffect(() => {
    void load();
  }, [load]);

  // Poll while an AI evaluation is running.
  // (not while a transcript waits for the learner's check: nothing changes until they validate it)
  const pending = !!view?.attempts.some((a) => a.ai && a.ai.stage !== "done" && a.ai.stage !== "error" && a.ai.stage !== "review");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void api.exercise(id).then(setView, () => undefined), 1500);
    return () => clearInterval(t);
  }, [pending, id]);

  const act: Act = useCallback(
    async (action) => {
      setBusy(true);
      try {
        const r = await api.exerciseAction(id, action);
        if ("deleted" in r) return null;
        setView(r);
        return r;
      } finally {
        setBusy(false);
      }
    },
    [id],
  );

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24">
        <EmptyState title="This practice session could not be opened" text={error} action={<Button onClick={() => router.push("/exercises")}>Back to Exercises</Button>} />
      </main>
    );
  }
  if (!view) return <div className="flex min-h-dvh items-center justify-center gap-2 text-ink-3"><Spinner /> Loading…</div>;

  const area = areaOf(view.kind);
  const finished = view.status !== "active" && !holding;
  const answered = view.attempts.length;
  const level = view.current?.level ?? view.attempts[view.attempts.length - 1]?.level ?? view.config.level;
  const writing = view.kind === "writing";
  const timed = writing || view.kind === "reading";
  // Adaptive runs have no fixed length: show the question number, not "07 / 20".
  const progress = writing || view.endless ? null : Math.min(1, answered / Math.max(1, view.total));
  const counter = writing
    ? (answered ? `${answered} submitted` : null)
    : view.endless
      ? `Question ${answered + (holding || finished ? 0 : 1)}`
      : `${pad2(Math.min(view.total, answered + (holding || finished ? 0 : 1)))} / ${pad2(view.total)}`;

  const exit = async () => {
    setBusy(true);
    try {
      const r = await api.exerciseAction(id, { type: "exit" });
      if ("deleted" in r) router.push(`/exercises/${area}`);
      else {
        setView(r);
        setExiting(false);
        setHolding(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <ExerciseHud
        title={KIND_LABEL[view.kind].replace("Speaking · ", "Speaking · ")}
        subtitle={subtitleOf(view)}
        level={level}
        progress={finished ? 1 : progress}
        counter={finished ? null : counter}
        hearts={view.hearts}
        maxHearts={view.maxHearts}
        remainingMs={timed && !finished && !holding ? remainingMs : null}
        score={finished ? null : view.score}
        onExit={() => (finished ? router.push(`/exercises/${area}`) : answered === 0 ? void exit() : setExiting(true))}
      />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {finished ? (
          <EndScreen view={view} />
        ) : view.kind === "reading" ? (
          <ReadingPlayer view={view} act={act} busy={busy} setHolding={setHolding} setRemainingMs={setRemainingMs} />
        ) : view.kind === "spelling" ? (
          <SpellingPlayer view={view} act={act} busy={busy} setHolding={setHolding} />
        ) : view.kind === "grammar" ? (
          <GrammarPlayer view={view} act={act} busy={busy} setHolding={setHolding} />
        ) : view.kind === "writing" ? (
          <WritingPlayer view={view} act={act} busy={busy} setRemainingMs={setRemainingMs} onFinish={() => void exit()} />
        ) : (
          <SpeakingPlayer view={view} act={act} busy={busy} setHolding={setHolding} onRefresh={setView} />
        )}
      </main>

      <Modal open={exiting} onClose={() => setExiting(false)} title="Leave practice">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Leave this practice session?</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            {writing ? "Your submitted responses and their feedback are kept in your exercise history." : `Your ${answered} answer${answered === 1 ? " is" : "s are"} saved and your mistakes are remembered. The session ends here.`}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setExiting(false)} disabled={busy}>Keep practising</Button>
            <Button variant="primary" onClick={() => void exit()} disabled={busy}>{busy && <Spinner />} Leave</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
