"use client";

import { useEffect, useRef, useState } from "react";
import { formatClock } from "@/lib/format";
import { cx } from "@/components/ui/primitives";
import { IconPause, IconPlay, IconReplay, IconVolume } from "@/components/ui/icons";

function storedVolume(): number {
  if (typeof window === "undefined") return 0.9;
  try {
    const v = Number(localStorage.getItem("toefl.volume"));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.9;
  } catch {
    return 0.9;
  }
}

/**
 * Exam audio: in "once" mode the clip plays a single time with no pause or seek (volume only);
 * in "free" mode (practice) the learner can pause and replay. Progress is display-only in both.
 * Give it a `key` per clip so a new clip starts from a fresh state.
 */
export function ExamAudioPlayer({
  src,
  mode,
  onEnded,
  autoPlay = true,
  label = "Audio",
}: {
  src: string;
  mode: "once" | "free";
  onEnded?: () => void;
  autoPlay?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(storedVolume);
  const endedRef = useRef(onEnded);
  useEffect(() => {
    endedRef.current = onEnded;
  });

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.volume = volume;
    try {
      localStorage.setItem("toefl.volume", String(volume));
    } catch {
      /* per-viewer convenience only */
    }
  }, [volume]);

  useEffect(() => {
    const a = ref.current;
    if (!a || !autoPlay) return;
    a.play().catch(() => setBlocked(true));
  }, [src, autoPlay]);

  const start = () => {
    setBlocked(false);
    void ref.current?.play();
  };
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };
  const replay = () => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = 0;
    setEnded(false);
    void a.play();
  };

  const canStart = mode === "free" || (!playing && !ended && (blocked || !autoPlay) && t === 0);
  const pct = dur > 0 ? Math.min(100, (t / dur) * 100) : 0;

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3" aria-label={label}>
      <audio
        ref={ref}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
          endedRef.current?.();
        }}
      />
      <div className="flex items-center gap-3">
        {mode === "free" ? (
          <button
            type="button"
            onClick={ended ? replay : toggle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover"
            aria-label={ended ? "Replay" : playing ? "Pause" : "Play"}
          >
            {ended ? <IconReplay /> : playing ? <IconPause /> : <IconPlay />}
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className={cx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              canStart ? "bg-accent text-white hover:bg-accent-hover" : "bg-line text-ink-3",
            )}
            aria-label={playing ? "Playing" : ended ? "Finished" : "Play"}
          >
            {playing ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" /> : <IconPlay />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between text-xs text-ink-3">
            <span>{ended ? "Finished" : playing ? "Playing" : blocked ? "Select play to start" : t > 0 ? "Paused" : "Ready"}</span>
            <span className="tabular">{formatClock(t * 1000)} / {dur ? formatClock(dur * 1000) : "--:--"}</span>
          </div>
          <div className="h-1.5 rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <label className="hidden items-center gap-2 text-ink-3 sm:flex">
          <IconVolume />
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-20 accent-[var(--accent)]"
            aria-label="Volume"
          />
        </label>
      </div>
    </div>
  );
}
