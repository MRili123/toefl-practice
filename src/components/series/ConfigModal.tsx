"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SectionId } from "@/engine/bank/types";
import type { DashboardTest } from "@/server/service";
import { api } from "@/lib/api";
import { pad2, SECTION_LABEL } from "@/lib/format";
import { Button, cx, Eyebrow, Modal, Spinner, Toggle } from "@/components/ui/primitives";
import { IconCheck } from "@/components/ui/icons";

const ORDER: SectionId[] = ["reading", "listening", "writing", "speaking"];
const MINUTES: Record<SectionId, number> = { reading: 30, listening: 29, writing: 23, speaking: 8 };
const TASKS: Record<SectionId, string> = {
  reading: "Complete the Words · Daily Life · Academic Passage",
  listening: "Choose a Response · Conversation · Announcement · Academic Talk",
  writing: "Build a Sentence · Email · Academic Discussion",
  speaking: "Listen and Repeat · Interview",
};

export function ConfigModal({ test, onClose }: { test: DashboardTest | null; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"real" | "practice">("real");
  const [sections, setSections] = useState<SectionId[]>(ORDER);
  const [instant, setInstant] = useState(false);
  const [timed, setTimed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!test) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const toggleSection = (s: SectionId) =>
    setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : ORDER.filter((x) => x === s || cur.includes(x))));
  const minutes = sections.reduce((n, s) => n + MINUTES[s], 0);
  const practice = mode === "practice";

  async function start() {
    setBusy(true);
    setError(null);
    try {
      if (test!.inProgress) await api.deleteSession(test!.inProgress.sessionId);
      const { id } = await api.createSession(test!.number, { mode, sections, instantCorrection: practice && instant, timed: !practice || timed });
      router.push(`/test/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Configure Series ${pad2(test.number)}`}>
      <div className="flex items-baseline justify-between border-b border-line px-6 py-4">
        <div>
          <Eyebrow>Configure</Eyebrow>
          <h2 className="text-xl font-semibold">Series {pad2(test.number)}</h2>
        </div>
        <button onClick={onClose} className="text-sm text-ink-3 hover:text-ink">Close</button>
      </div>

      <div className="max-h-[70vh] space-y-7 overflow-y-auto px-6 py-5">
        {test.inProgress && (
          <div className="rounded-md border border-warn/30 bg-warn-weak px-4 py-3 text-sm">
            <p className="font-medium text-warn">You have an unfinished attempt on this test.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => router.push(`/test/${test.inProgress!.sessionId}`)}>
                Resume attempt
              </Button>
              <span className="self-center text-ink-2">Starting a new attempt below discards it.</span>
            </div>
          </div>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink-2">Test mode</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["real", "Real Test Conditions", "Timed sections, fixed task order, adaptive modules, forward-only, no feedback until the end."],
              ["practice", "Practice Mode", "Flexible timing, move between questions, optional instant correction."],
            ] as const).map(([value, title, desc]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                aria-label={title}
                className={cx(
                  "rounded-lg border p-4 text-left transition-colors",
                  mode === value ? "border-accent bg-accent-weak" : "border-line hover:border-line-strong",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="font-semibold">{title}</span>
                  {mode === value && <IconCheck className="text-accent" />}
                </span>
                <span className="mt-1 block text-sm text-ink-2">{desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink-2">Sections</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {ORDER.map((s) => {
              const on = sections.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSection(s)}
                  aria-pressed={on}
                  aria-label={`${SECTION_LABEL[s]}, ${MINUTES[s]} minutes`}
                  className={cx(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    on ? "border-accent bg-accent-weak" : "border-line text-ink-3 hover:border-line-strong",
                  )}
                >
                  <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", on ? "border-accent bg-accent text-white" : "border-line-strong")}>
                    {on && <IconCheck width={14} height={14} strokeWidth={3} />}
                  </span>
                  <span>
                    <span className={cx("block font-medium", on && "text-ink")}>
                      {SECTION_LABEL[s]} <span className="font-normal text-ink-3">· {MINUTES[s]} min</span>
                    </span>
                    <span className="block text-xs text-ink-3">{TASKS[s]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={cx(!practice && "opacity-60")}>
          <h3 className="mb-1 text-sm font-semibold text-ink-2">Practice settings</h3>
          {!practice && <p className="mb-3 text-sm text-ink-3">Real Test Conditions always run timed with feedback after completion.</p>}
          <div className="space-y-4 rounded-lg border border-line p-4">
            <Toggle
              label="Instant Correction"
              description="Show correct/incorrect, the answer and an explanation right after each submission."
              checked={practice && instant}
              onChange={setInstant}
              disabled={!practice}
            />
            <div className={cx("flex items-start justify-between gap-4", !practice && "opacity-50")}>
              <span>
                <span className="block text-[15px] font-medium">Timing</span>
                <span className="block text-sm text-ink-3">Timed uses the 2026 section timings.</span>
              </span>
              <div className="flex shrink-0 rounded-md border border-line-strong p-0.5 text-sm" role="radiogroup" aria-label="Timing">
                {([["Timed", true], ["No time limit", false]] as const).map(([label, v]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={(!practice || timed) === v}
                    disabled={!practice}
                    onClick={() => setTimed(v)}
                    className={cx("rounded px-3 py-1", (!practice || timed) === v ? "bg-accent text-white" : "text-ink-2")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <p className="text-xs leading-relaxed text-ink-3">
          Reading and Listening use a TOEFL-style adaptive simulation: your Module 1 performance selects a harder or easier Module 2.
          This approximates the 2026 multistage design; it is not ETS&apos;s proprietary algorithm. All scores are estimated practice scores.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
        <span className="text-sm text-ink-2">
          {sections.length} section{sections.length === 1 ? "" : "s"} · ≈ {minutes} min
          {error && <span className="ml-3 text-danger">{error}</span>}
        </span>
        <Button variant="primary" size="lg" disabled={sections.length === 0 || busy} onClick={start}>
          {busy && <Spinner />} Start test
        </Button>
      </div>
    </Modal>
  );
}
