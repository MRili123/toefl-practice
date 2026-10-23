"use client";

import type { SessionView } from "@/engine/session/viewTypes";
import { Button, Eyebrow, Spinner } from "@/components/ui/primitives";
import { IconMic } from "@/components/ui/icons";
import type { Microphone } from "./speaking/useMicrophone";
import { LevelMeter } from "./speaking/Waveform";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular sm:text-lg">{value}</dd>
    </div>
  );
}

export function SectionIntro({
  view,
  onBegin,
  busy,
  mic,
  onExit,
}: {
  view: SessionView;
  onBegin: () => void;
  busy: boolean;
  mic: Microphone;
  onExit: () => void;
}) {
  const cur = view.current!;
  const { intro } = cur;
  const index = view.sections.findIndex((s) => s.id === cur.section);
  const real = view.config.mode === "real";
  const timed = view.config.timed;
  const speaking = cur.section === "speaking";
  const writing = cur.section === "writing";
  const timeText = !timed ? "No limit" : `≈ ${intro.minutes} min`;

  const notes: string[] = [];
  if (timed && cur.section === "reading") notes.push("Each module has its own timer: Module 1 21 minutes, Module 2 9 minutes. The timer starts when you select Begin.");
  if (timed && cur.section === "listening") {
    notes.push(
      "Each question has its own timer: 20 seconds for Listen and Choose a Response, 30 seconds for the other questions. It starts when the question appears, after the recording. When it ends, your answer is submitted and you cannot return to it.",
    );
  }
  if (timed && writing) notes.push("Each writing task has its own timer: Build a Sentence 6 minutes, Write an Email 7 minutes, Write for an Academic Discussion 10 minutes.");
  if (speaking) notes.push("Each response is recorded automatically and stops when its response time ends.");
  if (intro.adaptive) notes.push("This section is adaptive: your Module 1 performance selects the Module 2 you receive (TOEFL-style simulation).");
  if (real && cur.section === "reading") {
    notes.push("You can move back and forth between questions within a module. Once you finish Module 1, you cannot return to it. Feedback is shown only after the test.");
  } else if (real) notes.push("You cannot return to a previous question. Feedback is shown only after the test.");
  else if (view.config.instantCorrection) notes.push("Instant Correction is on: check each answer to see feedback immediately.");
  if (cur.section === "listening") notes.push(real ? "Each recording plays once." : "You can pause and replay recordings in practice mode.");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl border border-line bg-surface p-5 sm:p-9">
        <Eyebrow>
          Section {index + 1} of {view.sections.length} · Series {String(view.testNumber).padStart(2, "0")} · {real ? "Real Test Conditions" : "Practice"}
        </Eyebrow>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{intro.title}</h1>
        <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-line py-4">
          <Fact label="Questions" value={String(intro.itemCount)} />
          <Fact label="Time" value={timeText} />
          <Fact label="Modules" value={intro.adaptive ? "2 (adaptive)" : "1"} />
        </dl>
        <div className="mt-5">
          <div className="text-sm font-semibold text-ink-2">Tasks</div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {intro.taskTypes.map((t) => (
              <li key={t} className="rounded-md border border-line px-2.5 py-1 text-sm">{t}</li>
            ))}
          </ul>
        </div>
        <ul className="mt-5 space-y-1.5 text-[15px] text-ink-2">
          {notes.map((n) => <li key={n} className="flex gap-2"><span className="text-ink-3">–</span>{n}</li>)}
        </ul>

        {speaking && (
          <div className="mt-6 rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex items-center gap-2 font-medium"><IconMic /> Microphone check</div>
            {mic.status === "ready" ? (
              <div className="mt-3">
                <p className="mb-2 text-sm text-ink-2">Say a few words — the bar should move.</p>
                <LevelMeter level={mic.level} />
              </div>
            ) : (
              <div className="mt-2 text-sm text-ink-2">
                {mic.status === "denied" || mic.status === "unsupported" ? (
                  <p className="text-warn">{mic.error} You can still continue; tasks without a recording score as no response.</p>
                ) : (
                  <p>Allow microphone access so your responses can be recorded.</p>
                )}
                <Button size="sm" className="mt-3" onClick={() => void mic.request()} disabled={mic.status === "requesting"}>
                  {mic.status === "requesting" && <Spinner />} {mic.status === "denied" ? "Try again" : "Enable microphone"}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onExit} disabled={busy}>Exit</Button>
          <Button variant="primary" size="lg" onClick={onBegin} disabled={busy}>
            {busy && <Spinner />} Begin {intro.title}
          </Button>
        </div>
      </div>
    </main>
  );
}

const BLOCK_INFO: Record<string, string> = {
  "Build a Sentence": "Put the words in order to make an appropriate reply. One word in each set is not needed.",
  "Write an Email": "Read the situation and write an email that does everything the task asks. Write as much as you can and in complete sentences.",
  "Write for an Academic Discussion": "Read the professor's question and the students' posts, then contribute your own opinion with support. Write at least 100 words.",
};

export function BlockIntro({
  label,
  seconds,
  timed,
  onBegin,
  busy,
  onExit,
}: {
  label: string;
  seconds: number | null;
  timed: boolean;
  onBegin: () => void;
  busy: boolean;
  onExit: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-xl border border-line bg-surface p-5 sm:p-9">
        <Eyebrow>Writing · Next task</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{label}</h1>
        <p className="mt-3 text-[15px] text-ink-2">{BLOCK_INFO[label]}</p>
        {timed && seconds && (
          <p className="mt-4 text-[15px]">
            Time: <span className="font-mono font-medium">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span> — starts when you select Begin.
          </p>
        )}
        <div className="mt-8 flex justify-between gap-3">
          <Button variant="ghost" onClick={onExit} disabled={busy}>Exit</Button>
          <Button variant="primary" size="lg" onClick={onBegin} disabled={busy}>
            {busy && <Spinner />} Begin
          </Button>
        </div>
      </div>
    </main>
  );
}
