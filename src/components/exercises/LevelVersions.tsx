"use client";

import { useEffect, useState } from "react";
import { CEFR_LEVELS, type Cefr, type WritingLevels } from "@/engine/exercises/types";
import { diffWords } from "@/lib/wordDiff";
import { cx, Spinner } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";

/**
 * The AI's improved version with its CEFR level: the rated level's button is blue; another level shows the same
 * text rewritten at that level, with what changed highlighted and explained.
 */
export function LevelVersions({ load, improved, initial, hideBase, what = "improved version" }: {
  /** Fetches the rated level (no argument) or the text rewritten at `level`. */
  load: (level?: Cefr) => Promise<WritingLevels>;
  improved: string;
  initial?: WritingLevels;
  /** Do not repeat the text itself while its own level is selected (the page already shows it). */
  hideBase?: boolean;
  /** What the rated text is, for the label ("improved version", "corrected answer"…). */
  what?: string;
}) {
  const [levels, setLevels] = useState<WritingLevels | null>(initial?.estimated ? initial : null);
  const [selected, setSelected] = useState<Cefr | null>(initial?.estimated ?? null);
  const [loading, setLoading] = useState<Cefr | "rate" | null>(initial?.estimated ? null : "rate");
  const [error, setError] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(true);

  // Rate the improved version once (kept with the session afterwards).
  useEffect(() => {
    if (initial?.estimated) return;
    let live = true;
    load().then(
      (l) => {
        if (!live) return;
        setLevels(l);
        setSelected(l.estimated);
        setLoading(null);
      },
      (e) => {
        if (!live) return;
        setError((e as Error).message);
        setLoading(null);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rate once per text; `load` is a new function every render
  }, [improved, initial?.estimated]);

  const choose = async (level: Cefr) => {
    setSelected(level);
    setError(null);
    if (!levels || level === levels.estimated || levels.versions[level]) return;
    setLoading(level);
    try {
      setLevels(await load(level));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading((l) => (l === level ? null : l));
    }
  };

  const version = selected && levels && selected !== levels.estimated ? levels.versions[selected] : undefined;

  return (
    <div className={hideBase ? "mt-3" : undefined}>
      <div className="mb-4 rounded-lg border border-line bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {loading === "rate" ? (
              <span className="inline-flex items-center gap-2 text-ink-3"><Spinner /> Rating the level of this version…</span>
            ) : levels?.estimated ? (
              <>Level of this {what}: <strong className="text-accent">{levels.estimated}</strong> <span className="text-ink-3">· AI estimate</span></>
            ) : (
              <span className="text-ink-3">Level not rated yet.</span>
            )}
          </p>
          <div role="radiogroup" aria-label="See this text at another level" className="flex flex-wrap gap-1.5">
            {CEFR_LEVELS.map((l) => {
              const rated = l === levels?.estimated;
              const on = l === selected;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!levels || loading !== null}
                  onClick={() => void choose(l)}
                  title={rated ? `The level of this ${what}` : `Rewrite it at ${l} level`}
                  className={cx(
                    "h-9 min-w-11 rounded-md border px-2.5 text-sm font-semibold tabular transition-colors disabled:cursor-not-allowed",
                    // The level of the improved version is always blue; the level being viewed is outlined in blue.
                    rated ? "border-accent bg-accent text-white"
                      : on ? "border-2 border-accent bg-accent-weak text-accent"
                        : "border-line-strong bg-surface text-ink-2 hover:border-accent hover:text-accent disabled:opacity-60",
                  )}
                >
                  {loading === l ? <Spinner className="h-3.5 w-3.5" /> : l}
                </button>
              );
            })}
          </div>
        </div>
        {levels?.reason && selected === levels.estimated && <p className="mt-2 text-sm text-ink-2">{levels.reason}</p>}
        {levels?.estimated && selected === levels.estimated && (
          <p className="mt-1 text-xs text-ink-3">Click another level to see the same text written at that level.</p>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-danger" role="alert">{error}</p>}

      {loading && loading !== "rate" ? (
        <p className="flex items-center gap-2 py-6 text-sm text-ink-3"><Spinner /> Writing the {loading} version…</p>
      ) : version && selected && levels?.estimated ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-3">
              The same text at <strong className="text-ink">{selected}</strong> level, compared with the {levels.estimated} version.
            </p>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} className="accent-[var(--color-accent)]" />
              Highlight the changes
            </label>
          </div>
          <div className="whitespace-pre-wrap break-words text-[16px] leading-[1.9]">
            {showChanges
              ? diffWords(improved, version.text).map((p, i) =>
                  p.op === "same" ? <span key={i}>{p.text}</span>
                    : p.op === "add" ? <mark key={i} className="rounded-sm bg-success-weak px-0.5 text-success">{p.text}</mark>
                      : <del key={i} className="text-danger/70 decoration-danger/50">{p.text}</del>,
                )
              : version.text}
          </div>
          {version.changes.length > 0 && (
            <section className="mt-6">
              <h4 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">What changed for {selected}</h4>
              <ol className="mt-2 space-y-2">
                {version.changes.map((c, i) => (
                  <li key={i} className="rounded-lg border border-line px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold tabular text-ink-3">{i + 1}.</span>
                      {c.before && <span className="text-danger line-through decoration-danger/50">{c.before}</span>}
                      <IconArrowRight width={13} height={13} className="text-ink-3" />
                      <span className="font-medium text-success">{c.after}</span>
                    </div>
                    {c.why && <p className="mt-1 text-ink-2">{c.why}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      ) : hideBase ? null : (
        <div className="whitespace-pre-wrap break-words text-[16px] leading-[1.9]">{improved || <span className="italic text-ink-3">Not available</span>}</div>
      )}
    </div>
  );
}
