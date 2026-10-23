"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { SpeakingMeta } from "@/engine/bank/types";
import type { ClientTask } from "@/engine/session/viewTypes";
import { formatClock } from "@/lib/format";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconMic, IconPlay } from "@/components/ui/icons";
import { ExamAudioPlayer } from "../listening/ExamAudioPlayer";
import { SceneImage } from "./SceneImage";
import { beep, type Microphone } from "./useMicrophone";
import { Waveform } from "./Waveform";

type SpeakingClientTask = Extract<ClientTask, { kind: "listen_and_repeat" | "interview" }>;
type Phase = "intro" | "question" | "listen" | "prep" | "record" | "saving";

function useCountdownSeconds(active: boolean, seconds: number, onDone: () => void) {
  const [left, setLeft] = useState(seconds * 1000);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (!active) return;
    const endsAt = Date.now() + seconds * 1000;
    let fired = false;
    const id = setInterval(() => {
      const l = Math.max(0, endsAt - Date.now());
      setLeft(l);
      if (l <= 0 && !fired) {
        fired = true;
        clearInterval(id);
        doneRef.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [active, seconds]);
  return active ? left : seconds * 1000;
}

function PromptVideo({ src, onEnded, caption }: { src: string; onEnded: () => void; caption: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    ref.current?.play().catch(() => setBlocked(true));
  }, [src]);
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line bg-black">
        <video ref={ref} src={src} playsInline onEnded={onEnded} className="block aspect-video w-full" />
        {blocked && (
          <button
            type="button"
            onClick={() => {
              setBlocked(false);
              void ref.current?.play();
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"
          >
            <span className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-medium"><IconPlay /> Play</span>
          </button>
        )}
      </div>
      {caption && <p className="mt-3 text-[15px] text-ink-2">{caption}</p>}
    </div>
  );
}

export function SpeakingTask({
  task,
  meta,
  mic,
  showIntro,
  practice,
  number,
  bookmark,
  onUpload,
  onSkip,
}: {
  task: SpeakingClientTask;
  meta: SpeakingMeta;
  mic: Microphone;
  showIntro: boolean;
  practice: boolean;
  number: number;
  bookmark?: ReactNode;
  onUpload: (blob: Blob, durationMs: number) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const isRepeat = task.kind === "listen_and_repeat";
  const prepSeconds = task.kind === "interview" ? task.prepSeconds : 0;
  const [phase, setPhase] = useState<Phase>(isRepeat ? "listen" : showIntro && meta.interview.introVideo ? "intro" : "question");
  const [err, setErr] = useState<string | null>(null);

  const finish = useCallback(async () => {
    setPhase("saving");
    try {
      const rec = await mic.stopRecording();
      if (rec) await onUpload(rec.blob, rec.durationMs);
      else await onSkip();
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [mic, onUpload, onSkip]);

  const prepLeft = useCountdownSeconds(phase === "prep", prepSeconds, () => setPhase("record"));
  const respLeft = useCountdownSeconds(phase === "record" && mic.recording, task.responseSeconds, () => void finish());

  const { status: micStatus, recording: micRecording, startRecording } = mic;
  useEffect(() => {
    if (phase !== "record" || micStatus !== "ready" || micRecording) return;
    beep();
    const id = setTimeout(startRecording, 300);
    return () => clearTimeout(id);
  }, [phase, micStatus, micRecording, startRecording]);

  const afterPrompt = () => setPhase(prepSeconds > 0 ? "prep" : "record");
  const recordingPhase = phase === "prep" || phase === "record" || phase === "saving";

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="min-w-0">
        {isRepeat ? (
          <>
            <p className="mb-1 text-[15px] font-medium">Listen and repeat only once.</p>
            {meta.sceneTheme && <p className="mb-3 text-sm text-ink-3">Scene: {meta.sceneTheme}</p>}
            <SceneImage meta={meta} partIndex={task.partIndex} />
          </>
        ) : phase === "intro" ? (
          <>
            <p className="mb-3 text-[15px] text-ink-2">{meta.interview.scenario}</p>
            <PromptVideo src={meta.interview.introVideo!} onEnded={() => setPhase("question")} caption={null} />
          </>
        ) : (
          <>
            <p className="mb-1 text-[15px] font-medium">Please answer the interviewer&apos;s questions.</p>
            <p className="mb-3 text-sm text-ink-3">{meta.interview.scenario}</p>
            <PromptVideo
              src={task.video}
              onEnded={afterPrompt}
              caption={practice && task.kind === "interview" ? task.prompt : null}
            />
          </>
        )}
      </section>

      <section className="flex flex-col rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm text-ink-3">Question {number}</div>
          {bookmark}
        </div>
        <div className="mt-1 text-lg font-semibold">{isRepeat ? "Listen and Repeat" : "Take an Interview"}</div>

        {isRepeat && phase === "listen" && (
          <div className="mt-5">
            <ExamAudioPlayer src={task.audio} mode="once" onEnded={() => setTimeout(() => setPhase("record"), 400)} label="Sentence to repeat" />
          </div>
        )}
        {(phase === "intro" || phase === "question") && (
          <p className="mt-5 text-[15px] text-ink-2">Watch the interviewer. Recording starts when the question ends.</p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-3 text-center">
          <div className={cx("rounded-md border px-3 py-2", phase === "prep" ? "border-accent bg-accent-weak" : "border-line")}>
            <dt className="text-xs uppercase tracking-wide text-ink-3">Preparation</dt>
            <dd className="font-mono text-xl tabular">{formatClock(phase === "prep" ? prepLeft : prepSeconds * 1000)}</dd>
          </div>
          <div className={cx("rounded-md border px-3 py-2", phase === "record" ? "border-danger/50 bg-danger-weak" : "border-line")}>
            <dt className="text-xs uppercase tracking-wide text-ink-3">Response</dt>
            <dd className="font-mono text-xl tabular">{formatClock(phase === "record" && mic.recording ? respLeft : task.responseSeconds * 1000)}</dd>
          </div>
        </dl>

        <div className="mt-5 flex items-center gap-2 text-sm font-medium" aria-live="polite">
          {mic.status !== "ready" ? (
            <span className="text-warn">Microphone unavailable{mic.error ? ` — ${mic.error}` : ""}</span>
          ) : mic.recording ? (
            <span className="flex items-center gap-2 text-danger">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> Recording
            </span>
          ) : phase === "saving" ? (
            <span className="flex items-center gap-2 text-ink-2"><Spinner /> Saving response…</span>
          ) : (
            <span className="flex items-center gap-2 text-ink-3"><IconMic /> Microphone ready</span>
          )}
        </div>

        <div className="mt-3 rounded-md border border-line bg-surface-2 px-2">
          <Waveform level={mic.level} active={mic.recording} />
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-5">
          {err && <span className="mr-auto text-sm text-danger">{err}</span>}
          {recordingPhase && mic.status !== "ready" && phase !== "saving" && (
            <>
              <Button onClick={() => void mic.request()} disabled={mic.status === "requesting"}>
                {mic.status === "requesting" && <Spinner />} Reconnect microphone
              </Button>
              <Button onClick={() => void onSkip()}>Continue without recording</Button>
            </>
          )}
          {phase === "prep" && <Button onClick={() => setPhase("record")}>Start speaking now</Button>}
          <Button variant="primary" disabled={!mic.recording} onClick={() => void finish()}>
            Finish
          </Button>
        </div>
      </section>
    </div>
  );
}
