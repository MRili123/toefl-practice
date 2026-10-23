"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Health } from "@/lib/api";
import { cx } from "@/components/ui/primitives";

/** Local AI services used for Speaking/Writing evaluation. */
export function ServiceStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    // Services start alongside the app (the speech model takes a few seconds to load): re-check until ready.
    let stop = false;
    let tries = 0;
    const check = () =>
      api.health().then(
        (h) => {
          if (stop) return;
          setHealth(h);
          const ready = h.ollama.ok && h.ollama.modelInstalled && h.stt.ok && h.stt.ready;
          if (!ready && ++tries < 12) setTimeout(check, 5000);
        },
        () => undefined,
      );
    void check();
    return () => {
      stop = true;
    };
  }, []);
  const items = health
    ? [
        { label: "AI evaluator", ok: health.ollama.ok && health.ollama.modelInstalled, detail: health.ollama.error ?? health.ollama.model },
        { label: "Speech-to-text", ok: health.stt.ok && health.stt.ready, detail: health.stt.error ?? health.stt.model ?? "" },
      ]
    : [];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3" aria-live="polite">
      {health === null && <span>Checking AI services…</span>}
      {items.map((i) => (
        <span key={i.label} title={i.detail} className="inline-flex items-center gap-1.5">
          <span className={cx("h-2 w-2 rounded-full", i.ok ? "bg-success" : "bg-warn")} />
          {i.label} {i.ok ? "ready" : "unavailable"}
        </span>
      ))}
      {health !== null && items.some((i) => !i.ok) && (
        <Link href="/setup" className="font-medium text-accent hover:underline">Set up AI →</Link>
      )}
    </div>
  );
}
