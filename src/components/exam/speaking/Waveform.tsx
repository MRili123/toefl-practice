"use client";

import { useEffect, useRef } from "react";

/** Rolling input-level bars drawn from the live microphone. */
export function Waveform({ level, active, height = 72 }: { level: () => number; active: boolean; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>([]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    let raf = 0;
    let last = 0;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1d3f72";
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--line-strong").trim() || "#c9c9c2";

    const draw = (ts: number) => {
      raf = requestAnimationFrame(draw);
      if (ts - last < 50) return;
      last = ts;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(height * dpr);
      }
      const bars = Math.floor(w / 6);
      history.current.push(active ? level() : 0);
      if (history.current.length > bars) history.current.splice(0, history.current.length - bars);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, height);
      g.fillStyle = active ? accent : muted;
      const offset = bars - history.current.length;
      history.current.forEach((v, i) => {
        const h = Math.max(2, v * (height - 8));
        g.fillRect((offset + i) * 6, (height - h) / 2, 3, h);
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, level, height]);

  return <canvas ref={canvas} style={{ height }} className="block w-full" aria-hidden />;
}

export function LevelMeter({ level }: { level: () => number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (bar.current) bar.current.style.width = `${Math.round(level() * 100)}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [level]);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden>
      <div ref={bar} className="h-full rounded-full bg-success transition-[width] duration-75" />
    </div>
  );
}
