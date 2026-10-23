"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Cefr, CEFR_LEVELS } from "@/engine/exercises/types";
import { api } from "@/lib/api";
import { formatClock } from "@/lib/format";
import { Button, cx, Spinner } from "@/components/ui/primitives";
import { IconArrowLeft, IconClock, IconPause, IconPlay, IconReplay, IconVolume } from "@/components/ui/icons";

/* ---------- hearts ---------- */

function Heart({ filled, losing }: { filled: boolean; losing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden className={cx("transition-colors duration-300", losing && "heart-lose", filled ? "text-danger" : "text-line-strong")}>
      <path
        d="M12 20.3 4.6 13.2a4.6 4.6 0 0 1 6.5-6.6l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.6Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Five hearts; a lost heart fades/shrinks into an outline. */
export function Hearts({ hearts, max }: { hearts: number; max: number }) {
  const prev = useRef(hearts);
  const [losing, setLosing] = useState<number | null>(null);
  useEffect(() => {
    if (hearts < prev.current) {
      setLosing(hearts);
      const t = setTimeout(() => setLosing(null), 450);
      prev.current = hearts;
      return () => clearTimeout(t);
    }
    prev.current = hearts;
  }, [hearts]);
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${hearts} of ${max} hearts left`}>
      {Array.from({ length: max }, (_, i) => (
        <Heart key={i} filled={i < hearts} losing={losing === i} />
      ))}
    </div>
  );
}

/* ---------- HUD ---------- */

/** One compact, stable header for every exercise: exit · name · level · progress · hearts · timer. */
export function ExerciseHud({
  title,
  subtitle,
  level,
  progress,
  counter,
  hearts,
  maxHearts,
  remainingMs,
  score,
  onExit,
}: {
  title: string;
  subtitle?: string | null;
  level: Cefr;
  progress: number | null;
  counter: string | null;
  hearts: number | null;
  maxHearts: number;
  remainingMs?: number | null;
  /** Spelling: points so far (1 per correct answer) and the best score to beat. */
  score?: { points: number; best: number; previousBest: number | null } | null;
  onExit: () => void;
}) {
  const low = remainingMs != null && remainingMs <= 60_000;
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <button type="button" onClick={onExit} className="-ml-2 flex h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-ink-2 hover:bg-black/[0.04] hover:text-ink">
          <IconArrowLeft /> <span className="hidden sm:inline">Exit</span>
        </button>
        <span className="h-5 w-px bg-line" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold leading-tight">{title}</div>
          {subtitle && <div className="truncate text-xs text-ink-3">{subtitle}</div>}
        </div>
        <LevelBadge level={level} />
        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          {counter && <span className="text-sm text-ink-2 tabular" aria-live="polite">{counter}</span>}
          {score && (
            <span className="flex items-baseline gap-1.5 rounded-full bg-accent-weak px-3 py-1 tabular" aria-live="polite" aria-label={`Score ${score.points} points`}>
              <span key={score.points} className="settle text-[15px] font-semibold text-accent">{score.points}</span>
              <span className="text-xs text-accent">pts</span>
              {score.previousBest !== null && (
                <span className={cx("hidden text-xs sm:inline", score.points > score.previousBest ? "font-semibold text-success" : "text-ink-3")}>
                  {score.points > score.previousBest ? "· new best!" : `· best ${score.previousBest}`}
                </span>
              )}
            </span>
          )}
          {remainingMs != null && (
            <span className={cx("flex items-center gap-1 font-mono text-[15px] tabular", low ? "text-danger" : "text-ink")} aria-label={`Time remaining ${formatClock(remainingMs)}`}>
              <IconClock className="text-ink-3" /> {formatClock(remainingMs)}
            </span>
          )}
          {hearts !== null && <Hearts hearts={hearts} max={maxHearts} />}
        </div>
      </div>
      {progress !== null && (
        <div className="h-[3px] w-full bg-line" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </header>
  );
}

export function LevelBadge({ level, muted }: { level: Cefr; muted?: boolean }) {
  return (
    <span className={cx("rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold", muted ? "border-line text-ink-3" : "border-accent/30 bg-accent-weak text-accent")}>
      {level}
    </span>
  );
}

/* ---------- level selector ---------- */

/** A1 → C2 stepper; the selected level is filled, the recommended one marked. */
export function LevelStepper({ value, onChange, recommended }: { value: Cefr; onChange: (l: Cefr) => void; recommended?: Cefr | null }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Level" className="grid grid-cols-6 gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {CEFR_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={value === l}
            onClick={() => onChange(l)}
            className={cx(
              "relative h-11 rounded-md font-mono text-sm font-semibold transition-colors duration-150",
              value === l ? "bg-accent text-white shadow-sm" : "text-ink-2 hover:bg-surface hover:text-ink",
            )}
          >
            {l}
            {recommended === l && value !== l && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success" aria-label="recommended" />}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between px-1 text-xs text-ink-3">
        <span>Beginner</span>
        {recommended && <span className="text-success">● Recommended: {recommended}</span>}
        <span>Proficient</span>
      </div>
    </div>
  );
}

export function OptionCards<T extends string>({
  options,
  value,
  onChange,
  label,
  columns = 3,
}: {
  options: { id: T; label: string; description?: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("grid gap-2", columns === 2 ? "sm:grid-cols-2" : columns === 3 ? "sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={cx(
            "rounded-md border px-4 py-3 text-left transition-colors disabled:opacity-45",
            value === o.id ? "border-accent bg-accent-weak" : "border-line bg-surface hover:border-line-strong",
          )}
        >
          <span className="block text-[15px] font-medium">{o.label}</span>
          {o.description && <span className="mt-0.5 block text-sm text-ink-3">{o.description}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-7 first:mt-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">{label}</h2>
        {hint && <span className="text-xs text-ink-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ---------- TTS audio ---------- */

type AudioState = "idle" | "loading" | "playing" | "paused" | "error";

/**
 * Plays server-generated speech for an exercise item (the text itself is never sent to the browser).
 * The blob is cached per item for instant replays.
 */
export function useItemAudio(sessionId: string, itemId: string | null, { autoPlay = false }: { autoPlay?: boolean } = {}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<{ itemId: string; url: string } | null>(null);
  const [state, setState] = useState<AudioState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [plays, setPlays] = useState(0);
  const playRef = useRef<(fromStart?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    const t = autoPlay && itemId ? setTimeout(() => void playRef.current(true), 300) : null;
    return () => {
      if (t) clearTimeout(t);
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current.url);
      urlRef.current = null;
      setState("idle");
      setPlays(0);
      setError(null);
    };
  }, [itemId, autoPlay]);

  const ensure = async (): Promise<HTMLAudioElement> => {
    if (!itemId) throw new Error("No item");
    if (!urlRef.current || urlRef.current.itemId !== itemId) {
      const blob = await api.tts(sessionId, itemId);
      urlRef.current = { itemId, url: URL.createObjectURL(blob) };
    }
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (a.src !== urlRef.current.url) a.src = urlRef.current.url;
    a.onended = () => setState("idle");
    a.onpause = () => setState((s) => (s === "playing" ? "paused" : s));
    return a;
  };

  const play = async (fromStart = false) => {
    setError(null);
    try {
      if (!urlRef.current) setState("loading");
      const a = await ensure();
      if (fromStart) a.currentTime = 0;
      await a.play();
      setState("playing");
      if (fromStart || a.currentTime < 0.2) setPlays((n) => n + 1);
    } catch (e) {
      // Autoplay before any click is blocked by browsers: stay idle and let the learner press Play.
      if ((e as Error).name === "NotAllowedError") {
        setState("idle");
        return;
      }
      setState("error");
      setError((e as Error).message || "Audio could not be played.");
    }
  };
  useEffect(() => {
    playRef.current = play;
  });
  const pause = () => audioRef.current?.pause();
  return { state, error, plays, play, pause };
}

/** Large, calm audio control: Play / Pause, Replay, loading and retry states. */
export function AudioControl({ audio, label = "Play audio", big }: { audio: ReturnType<typeof useItemAudio>; label?: string; big?: boolean }) {
  const { state, error, plays, play, pause } = audio;
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => (state === "playing" ? pause() : void play(false))}
        disabled={state === "loading"}
        aria-label={state === "playing" ? "Pause" : label}
        className={cx(
          "flex items-center justify-center rounded-full bg-accent text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-95 disabled:opacity-70",
          big ? "h-24 w-24" : "h-16 w-16",
        )}
      >
        {state === "loading" ? <Spinner /> : state === "playing" ? <IconPause width={big ? 34 : 26} height={big ? 34 : 26} /> : plays === 0 ? <IconVolume width={big ? 36 : 26} height={big ? 36 : 26} /> : <IconPlay width={big ? 34 : 26} height={big ? 34 : 26} />}
      </button>
      <div className="mt-3 text-sm text-ink-3" aria-live="polite">
        {state === "loading" ? "Loading audio…" : state === "playing" ? "Playing…" : state === "paused" ? "Paused" : plays === 0 ? label : `Played ${plays}×`}
      </div>
      {plays > 0 && state !== "loading" && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => void play(true)}>
          <IconReplay /> Replay
        </Button>
      )}
      {state === "error" && (
        <div className="mt-2 flex max-w-sm flex-col items-center gap-2 text-center text-sm text-danger" role="alert">
          {error}
          <Button size="sm" onClick={() => void play(true)}>Retry</Button>
        </div>
      )}
    </div>
  );
}

export function PercentBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "success" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", tone === "success" ? "bg-success" : "bg-accent")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
