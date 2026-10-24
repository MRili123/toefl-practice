"use client";

import { useEffect, useRef, useState } from "react";
import { type Cefr, CEFR_BAND } from "@/engine/exercises/types";
import type { ExerciseView } from "@/server/exercises";
import { api } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { TranscriptReview } from "@/components/speaking/TranscriptReview";
import { IconArrowRight, IconMic } from "@/components/ui/icons";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import { beep, useMicrophone } from "@/components/exam/speaking/useMicrophone";
import { Waveform } from "@/components/exam/speaking/Waveform";
import { RepeatFeedbackView, SpeakingFeedbackView, Verdict } from "../feedback";
import { AudioControl, useItemAudio } from "../shared";
import type { Act } from "./ExercisePlayer";

const PREP_SECONDS = 15;
const RESPONSE_SECONDS = 45;
/** Longer sentences at higher levels get a longer recording window. */
const REPEAT_SECONDS: Record<Cefr, number> = { A1: 8, A2: 10, B1: 12, B2: 14, C1: 16, C2: 20 };

type Phase = "ready" | "prep" | "record" | "review" | "uploading" | "result";

function useCountdown(active: boolean, seconds: number, onDone: () => void) {
  const [left, setLeft] = useState(seconds * 1000);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!active) return;
    const endsAt = Date.now() + seconds * 1000;
    let fired = false;
    const t = setInterval(() => {
      const l = Math.max(0, endsAt - Date.now());
      setLeft(l);
      if (l <= 0 && !fired) {
        fired = true;
        clearInterval(t);
        done.current();
      }
    }, 100);
    return () => clearInterval(t);
  }, [active, seconds]);
  return active ? left : seconds * 1000;
}

function Clock({ label, ms, active, tone }: { label: string; ms: number; active: boolean; tone: "accent" | "danger" }) {
  return (
    <div className={cx("rounded-lg border px-4 py-3 text-center transition-colors", active ? (tone === "danger" ? "border-danger/50 bg-danger-weak" : "border-accent bg-accent-weak") : "border-line")}>
      <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="mt-0.5 font-mono text-2xl tabular">{formatClock(ms)}</div>
    </div>
  );
}

export function SpeakingPlayer({
  view,
  act,
  busy,
  setHolding,
  onRefresh,
}: {
  view: ExerciseView;
  act: Act;
  busy: boolean;
  setHolding: (v: boolean) => void;
  onRefresh: (v: ExerciseView) => void;
}) {
  const repeat = view.kind === "speaking-repeat";
  const mic = useMicrophone();
  const reg = useRegister(view.id);
  const [phase, setPhase] = useState<Phase>("ready");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ blob: Blob; url: string; durationMs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = view.current && (view.current.kind === "speaking-interaction" || view.current.kind === "speaking-repeat") ? view.current : null;
  const itemId = submittedId ?? current?.itemId ?? null;
  const attempt = submittedId ? [...view.attempts].reverse().find((a) => a.itemId === submittedId) ?? null : null;
  const question = current?.kind === "speaking-interaction" ? current.text : attempt?.detail && "text" in attempt.detail ? attempt.detail.text : "";
  const audio = useItemAudio(view.id, itemId);

  const { request } = mic;
  useEffect(() => {
    void request();
  }, [request]);

  const stop = async () => {
    const r = await mic.stopRecording();
    if (r) setRecording({ ...r, url: URL.createObjectURL(r.blob) });
    setPhase(r ? "review" : "ready");
    if (!r) setError("Nothing was recorded. Check your microphone and try again.");
  };

  const startRecording = () => {
    setError(null);
    beep();
    setTimeout(() => {
      void mic.startRecording().then((ok) => {
        if (ok) return;
        setPhase("ready");
        setError("The microphone stopped working. Check that it is connected and not used by another app, then try again.");
      });
    }, 250);
    setPhase("record");
  };

  // Listen & Repeat: recording starts when the original sentence finishes.
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (!repeat || phase !== "ready") return;
    if (audio.state === "playing") wasPlaying.current = true;
    if (audio.state === "idle" && wasPlaying.current && mic.status === "ready") {
      wasPlaying.current = false;
      const t = setTimeout(startRecording, 400);
      return () => clearTimeout(t);
    }
  });

  const prepLeft = useCountdown(phase === "prep", PREP_SECONDS, startRecording);
  const recLeft = useCountdown(phase === "record" && mic.recording, repeat ? REPEAT_SECONDS[current?.level ?? view.config.level] : RESPONSE_SECONDS, () => void stop());

  const submit = async () => {
    if (!current || !recording) return;
    setPhase("uploading");
    setError(null);
    try {
      const v = await api.exerciseRecording(view.id, current.itemId, recording.blob, recording.durationMs);
      setSubmittedId(current.itemId);
      setHolding(true);
      onRefresh(v);
      setPhase("result");
    } catch (e) {
      setError((e as Error).message);
      setPhase("review");
    }
  };

  const next = () => {
    if (recording) URL.revokeObjectURL(recording.url);
    setRecording(null);
    setSubmittedId(null);
    setPhase("ready");
    setHolding(false);
  };

  if (!current && !submittedId) return null;
  const level = attempt?.level ?? current?.level ?? view.config.level;
  const stage = attempt?.ai?.stage;
  const evaluating = phase === "result" && stage !== "done" && stage !== "error" && stage !== "review";
  const micProblem = mic.status === "denied" || mic.status === "unsupported";

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="min-w-0 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            {repeat ? "Listen and repeat only once" : `Question ${view.attempts.length + (phase === "result" ? 0 : 1)}`}
          </div>
          {itemId && <BookmarkButton saved={reg.isSaved(itemId)} onToggle={() => void reg.toggle(itemId)} label={repeat ? "sentence" : "question"} />}
        </div>

        {repeat ? (
          <div className="mt-6">
            {phase === "result" && attempt?.feedback?.kind === "repeat" ? (
              <RepeatFeedbackView fb={attempt.feedback} recordingUrl={recording?.url} />
            ) : (
              <>
                <AudioControl audio={audio} big label={audio.plays ? "Original" : "Play the sentence"} />
                <p className="mt-6 text-center text-[15px] text-ink-2">
                  {audio.plays === 0 ? "Press play, listen carefully, then repeat the sentence exactly. Recording starts automatically." : "Repeat the sentence exactly as you heard it."}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 text-2xl font-medium leading-snug">{question}</p>
            <div className="mt-5 flex items-center gap-3">
              <AudioControl audio={audio} label="Listen to the question" />
            </div>
            {phase === "result" && attempt?.feedback?.kind === "speaking" && (
              <div className="mt-8 border-t border-line pt-7">
                <SpeakingFeedbackView fb={attempt.feedback} recordingUrl={recording?.url} levels={{ sessionId: view.id, itemId: attempt.itemId, initial: attempt.levels }} />
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col rounded-xl border border-line bg-surface p-6">
        {!repeat && (
          <div className="grid grid-cols-2 gap-3">
            <Clock label="Preparation" ms={phase === "prep" ? prepLeft : PREP_SECONDS * 1000} active={phase === "prep"} tone="accent" />
            <Clock label="Recording" ms={phase === "record" && mic.recording ? recLeft : RESPONSE_SECONDS * 1000} active={phase === "record"} tone="danger" />
          </div>
        )}
        {repeat && phase === "record" && <Clock label="Recording" ms={recLeft} active tone="danger" />}

        <div className="mt-5 flex items-center gap-2 text-sm font-medium" aria-live="polite">
          {micProblem ? (
            <span className="text-danger">Microphone unavailable{mic.error ? ` — ${mic.error}` : ""}</span>
          ) : mic.status !== "ready" ? (
            <span className="flex items-center gap-2 text-ink-3"><Spinner /> Waiting for microphone permission…</span>
          ) : mic.recording ? (
            <span className="flex items-center gap-2 text-danger"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> Recording</span>
          ) : (
            <span className="flex items-center gap-2 text-ink-3"><IconMic /> Microphone ready</span>
          )}
        </div>
        <div className="mt-3 rounded-lg border border-line bg-surface-2 px-2">
          <Waveform level={mic.level} active={mic.recording} height={64} />
        </div>

        <div className="mt-6 flex flex-1 flex-col justify-end gap-3">
          {phase === "ready" && !repeat && (
            <Button variant="primary" size="lg" disabled={mic.status !== "ready"} onClick={() => setPhase("prep")} className="h-14">
              <IconMic /> Start ({PREP_SECONDS}s preparation)
            </Button>
          )}
          {phase === "ready" && repeat && audio.plays > 0 && audio.state !== "playing" && (
            <Button variant="primary" size="lg" disabled={mic.status !== "ready"} onClick={startRecording} className="h-14">
              <IconMic /> Start Recording
            </Button>
          )}
          {phase === "prep" && (
            <Button size="lg" onClick={startRecording} className="h-14"><IconMic /> Start speaking now</Button>
          )}
          {phase === "record" && (
            <Button variant="primary" size="lg" disabled={!mic.recording} onClick={() => void stop()} className="h-14">
              <span className="h-3 w-3 rounded-sm bg-white" /> Stop recording
            </Button>
          )}
          {phase === "review" && recording && (
            <>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">Your recording</div>
                <audio controls src={recording.url} className="w-full" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => { setRecording(null); setPhase(repeat ? "ready" : "prep"); }}>Record again</Button>
                <Button variant="primary" className="flex-1" onClick={() => void submit()}>Submit Response</Button>
              </div>
            </>
          )}
          {phase === "uploading" && <div className="flex items-center justify-center gap-2 py-3 text-ink-2"><Spinner /> Uploading…</div>}
          {evaluating && (
            <div className="rounded-lg border border-line bg-surface-2 px-4 py-4 text-center">
              <div className="flex items-center justify-center gap-2 font-medium"><Spinner /> {stage === "transcribing" ? "Transcribing your answer…" : stage === "evaluating" ? (repeat ? "Comparing with the original…" : "Evaluating with the local AI…") : "Waiting for evaluation…"}</div>
              <p className="mt-1 text-sm text-ink-3">{repeat ? "Takes a few seconds." : "Usually under a minute."}</p>
            </div>
          )}
          {phase === "result" && stage === "review" && attempt && (
            <TranscriptReview
              key={attempt.at}
              transcript={attempt.transcript ?? ""}
              recordingUrl={recording?.url ?? `/api/exercises/recordings/${view.id}/${attempt.answer}`}
              onValidate={async (text) => {
                await act({ type: "transcript", itemId: attempt.itemId, text });
              }}
              compact
            />
          )}
          {phase === "result" && stage === "done" && attempt?.transcriptEdited && attempt.stt && (
            <p className="text-center text-xs text-ink-3">Scored on your corrected transcript. Speech-to-text heard: <span className="italic">“{attempt.stt.text || "(nothing)"}”</span></p>
          )}
          {phase === "result" && stage === "error" && (
            <div className="rounded-lg border border-danger/30 bg-danger-weak px-4 py-3 text-sm">
              <p className="font-medium text-danger">{attempt?.ai?.error}</p>
              <p className="mt-1 text-ink-2">No heart was lost. You can retry the evaluation or continue.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void act({ type: "retry", itemId: attempt!.itemId })}>Retry</Button>
                <Button size="sm" variant="primary" onClick={next}>Continue</Button>
              </div>
            </div>
          )}
          {phase === "result" && stage === "done" && attempt && (
            <div className="space-y-3">
              <Verdict
                correct={attempt.correct === true}
                labels={repeat ? ["Well repeated", "Not quite"] : [`Meets the ${level} target`, `Below the ${level} target`]}
              />
              <p className="text-sm text-ink-3">
                {repeat
                  ? attempt.heartLost ? "One heart lost · this sentence will come back." : "Repeated with at least 90% of the words."
                  : attempt.correct ? `An estimated ${Math.max(1, CEFR_BAND[level] - 0.5).toFixed(1)} or higher is the ${level} target.` : `Aim for an estimated ${Math.max(1, CEFR_BAND[level] - 0.5).toFixed(1)} or higher at ${level}.`}
              </p>
              <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={next}>
                {view.status === "active" ? "Continue" : "See results"} <IconArrowRight />
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          {micProblem && phase === "ready" && (
            <p className="text-sm text-ink-3">Allow microphone access in the browser&apos;s address bar, then reload the page.</p>
          )}
        </div>
      </section>
    </div>
  );
}
