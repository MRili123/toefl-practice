"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type Cefr, type ExerciseArea, type ExerciseConfig, GRAMMAR_CATEGORY_LABEL, type GrammarCategory, READING_TIME_OPTIONS, SPEAKING_TOPICS,
  type SpeakingTopic, TOEFL_WRITING_SECONDS, TOPIC_LABEL, type WritingType,
} from "@/engine/exercises/types";
import type { ExercisesOverview } from "@/server/exercises";
import { api } from "@/lib/api";
import { Button, cx, Spinner, Toggle } from "@/components/ui/primitives";
import { IconArrowLeft, IconArrowRight, IconHeadphones, IconMic } from "@/components/ui/icons";
import { AREAS } from "./ExercisesHub";
import { Field, LevelStepper, OptionCards } from "./shared";

type SpeakingMode = "interaction" | "repeat";

type MistakeOrder = "mixed" | "first";
const MISTAKE_ORDER_KEY = "spelling-mistake-order";

function HowItWorks({ area, mistakeOrder }: { area: ExerciseArea; mistakeOrder?: MistakeOrder }) {
  const unit = area === "spelling" ? "words and sentences" : area === "grammar" ? "questions" : "sentences";
  // Spelling, Grammar and Listen & Repeat climb a fixed ladder (5 per level up to B1, 10 at B2 and C1, then C2).
  const ladder = area === "spelling" || area === "grammar" || area === "speaking";
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-5 py-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-ink-2">How it works</h2>
      <ol className="mt-3 space-y-2 text-[15px] leading-relaxed">
        <li className="flex gap-3"><span className="font-semibold text-accent tabular">1</span><span>
          {ladder
            ? <>5 {unit} at A1, A2 and B1, then 10 at B2 and C1, then C2 {unit} until the end. The level rises automatically.</>
            : <>First, the {unit} you got wrong before and have not mastered yet come back — from the lowest level up.</>}
        </span></li>
        <li className="flex gap-3"><span className="font-semibold text-accent tabular">2</span><span>
          {ladder
            ? area === "spelling" && mistakeOrder === "mixed"
              ? <>The {unit} you got wrong before and have not mastered yet are mixed in at random within their level — they count in that level’s 5 or 10.</>
              : <>Within each level, the {unit} you got wrong before and have not mastered yet come first — they count in that level’s 5 or 10.</>
            : <>Then 10 random {unit} from each level: A1 → A2 → B1 → B2 → C1 → C2. The level rises automatically.</>}
        </span></li>
        <li className="flex gap-3"><span className="font-semibold text-accent tabular">3</span><span>There is no question limit: you keep going until you lose all 5 hearts. Every mistake is saved for next time.</span></li>
      </ol>
    </div>
  );
}
/** The learner's last choice (Normal by default). */
function savedMistakeOrder(): MistakeOrder {
  try {
    return localStorage.getItem(MISTAKE_ORDER_KEY) === "first" ? "first" : "mixed";
  } catch {
    return "mixed";
  }
}

type Timing = "toefl" | "5" | "7" | "10" | "15" | "20" | "30" | "custom" | "none";

export function ExerciseSetup({ area, focus, mode: initialMode }: { area: ExerciseArea; focus?: GrammarCategory; mode?: SpeakingMode }) {
  const router = useRouter();
  const meta = AREAS.find((a) => a.id === area)!;
  const [overview, setOverview] = useState<ExercisesOverview | null>(null);
  const [level, setLevel] = useState<Cefr | null>(null);
  const [count, setCount] = useState(area === "speaking" || area === "reading" ? 10 : 20);
  const [readingTime, setReadingTime] = useState<string>("180");
  const [customReadingMinutes, setCustomReadingMinutes] = useState(4);
  const [spellingType, setSpellingType] = useState<"mixed" | "word" | "sentence">("mixed");
  const [mistakeOrder, setMistakeOrder] = useState<MistakeOrder>("mixed");
  const [grammarFocus, setGrammarFocus] = useState<GrammarCategory | undefined>(focus);
  const [writingType, setWritingType] = useState<WritingType>("email");
  const [timing, setTiming] = useState<Timing>("toefl");
  const [customMinutes, setCustomMinutes] = useState(12);
  const [mode, setMode] = useState<SpeakingMode | null>(initialMode ?? null);
  const [topic, setTopic] = useState<SpeakingTopic>("environment");
  const [progressive, setProgressive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.exercises().then((o) => {
      setOverview(o);
      setMistakeOrder(savedMistakeOrder());
      const a = o.areas[area];
      setLevel((l) => l ?? a.recommended ?? a.level ?? "B1");
    }, () => {
      setLevel((l) => l ?? "B1");
      setMistakeOrder(savedMistakeOrder());
    });
  }, [area]);

  const recommended = overview?.areas[area].recommended ?? null;
  // Spelling, Grammar and Listen & Repeat choose the level automatically and run until the hearts are gone.
  const adaptive = area === "spelling" || area === "grammar" || (area === "speaking" && mode === "repeat");
  const toeflTimingAvailable = writingType !== "essay";
  const effectiveTiming: Timing = timing === "toefl" && !toeflTimingAvailable ? "20" : timing;

  const start = async () => {
    if (!level && !adaptive) return;
    setBusy(true);
    setError(null);
    const config: Partial<ExerciseConfig> =
      area === "reading"
        ? {
            kind: "reading", level: level ?? undefined, count,
            timeLimit: readingTime === "none" ? null : readingTime === "custom" ? customReadingMinutes * 60 : Number(readingTime),
          }
      : area === "spelling" ? { kind: "spelling", spellingType, mistakeOrder }
        : area === "grammar" ? { kind: "grammar", focus: grammarFocus }
          : area === "writing"
            ? {
                kind: "writing", level: level ?? undefined, writingType,
                timeLimit: effectiveTiming === "none" ? null : effectiveTiming === "toefl" ? TOEFL_WRITING_SECONDS[writingType]! : effectiveTiming === "custom" ? customMinutes * 60 : Number(effectiveTiming) * 60,
              }
            : mode === "repeat" ? { kind: "speaking-repeat" }
              : { kind: "speaking-interaction", level: level ?? undefined, count, topic, progressive: count === 20 && progressive };
    try {
      const v = await api.startExercise(config);
      router.push(`/exercise/${v.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const header = (
    <header className="pb-8">
      <Link href="/exercises" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><IconArrowLeft /> Exercises</Link>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight">
        {area === "speaking" && mode ? (mode === "interaction" ? "Speaking · Interaction Test" : "Speaking · Listen & Repeat") : `${meta.name} Practice`}
      </h1>
      <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">{meta.description}</p>
    </header>
  );

  if (area === "speaking" && !mode) {
    return (
      <>
        {header}
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { id: "interaction" as const, icon: IconMic, title: "Interaction Test", text: "Answer spoken questions on a topic you choose. 15 seconds to prepare, 45 seconds to speak, AI feedback on every answer." },
            { id: "repeat" as const, icon: IconHeadphones, title: "Listen & Repeat", text: "Hear a sentence once, repeat it exactly. Word-by-word comparison shows what you missed; failed sentences come back." },
          ].map((c) => (
            <button key={c.id} type="button" onClick={() => setMode(c.id)} className="group flex flex-col rounded-lg border border-line bg-surface p-6 text-left transition-colors hover:border-accent/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent-weak text-accent"><c.icon width={24} height={24} /></div>
              <h2 className="mt-4 text-lg font-semibold">{c.title}</h2>
              <p className="mt-1 flex-1 text-[15px] leading-relaxed text-ink-2">{c.text}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 font-medium text-accent">Choose <IconArrowRight className="transition-transform group-hover:translate-x-0.5" /></span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="max-w-3xl rounded-xl border border-line bg-surface p-5 sm:p-8">
        {area === "speaking" && (
          <button type="button" onClick={() => setMode(null)} className="-mt-1 mb-6 text-sm text-accent hover:underline">← Change speaking mode</button>
        )}

        {area === "grammar" && grammarFocus && (
          <div className="mb-7 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn-weak px-4 py-3 text-sm">
            <span>Focused practice: <strong>{GRAMMAR_CATEGORY_LABEL[grammarFocus]}</strong> — questions from your level and the levels around it.</span>
            <button type="button" className="text-accent hover:underline" onClick={() => setGrammarFocus(undefined)}>Practise all categories</button>
          </div>
        )}

        {adaptive ? (
          <>
            <HowItWorks area={area} mistakeOrder={mistakeOrder} />
            {area === "spelling" && overview?.areas.spelling.bestScore != null && (
              <p className="mt-3 text-[15px]">
                Your best score: <strong className="tabular">{overview.areas.spelling.bestScore} points</strong>
                <span className="text-ink-3"> · 1 point per correct answer</span>
              </p>
            )}
          </>
        ) : (
          <Field label="Level" hint={area === "writing" ? "Prompts become more demanding from A1 to C2" : area === "reading" ? "Texts and missing words become more academic from A1 to C2" : undefined}>
            {level ? <LevelStepper value={level} onChange={setLevel} recommended={recommended} /> : <div className="h-11 animate-pulse rounded-lg bg-surface-2" />}
          </Field>
        )}

        {area === "spelling" && (
          <Field label="Practice">
            <OptionCards
              label="Spelling type"
              value={spellingType}
              onChange={setSpellingType}
              options={[
                { id: "mixed", label: "Mixed", description: "Words and sentences" },
                { id: "word", label: "Words", description: "Single words" },
                { id: "sentence", label: "Sentences", description: "Full dictation" },
              ]}
            />
          </Field>
        )}

        {area === "spelling" && (
          <Field label="Your mistakes">
            <OptionCards
              label="Order of the words you got wrong before"
              columns={2}
              value={mistakeOrder}
              onChange={(v) => {
                setMistakeOrder(v);
                try {
                  localStorage.setItem(MISTAKE_ORDER_KEY, v);
                } catch {
                  // remembering the choice is a convenience
                }
              }}
              options={[
                { id: "mixed", label: "Normal", description: "Mixed in at random" },
                { id: "first", label: "Prioritise mistakes", description: "First in each level" },
              ]}
            />
          </Field>
        )}

        {area === "writing" && (
          <>
            <Field label="Task">
              <OptionCards
                label="Writing type"
                value={writingType}
                onChange={setWritingType}
                options={[
                  { id: "email", label: "Write an Email", description: "TOEFL-style task" },
                  { id: "discussion", label: "Academic Discussion", description: "TOEFL-style task" },
                  { id: "essay", label: "General Writing", description: "Custom essay practice" },
                ]}
              />
            </Field>
            <Field label="Time">
              <OptionCards
                label="Time limit"
                columns={4}
                value={effectiveTiming}
                onChange={setTiming}
                options={[
                  { id: "toefl", label: "TOEFL timing", description: toeflTimingAvailable ? `${TOEFL_WRITING_SECONDS[writingType]! / 60} min (official)` : "Not for essays", disabled: !toeflTimingAvailable },
                  ...(["5", "7", "10", "15", "20", "30"] as const).map((m) => ({ id: m, label: `${m} min` })),
                  { id: "custom", label: "Custom" },
                  { id: "none", label: "No timer" },
                ]}
              />
              {effectiveTiming === "custom" && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="number" min={1} max={120} value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
                    className="h-10 w-20 rounded-md border border-line-strong bg-surface px-3 text-[15px] tabular outline-none focus:border-accent"
                  />
                  minutes
                </label>
              )}
            </Field>
          </>
        )}

        {area === "reading" && (
          <Field label="Time per passage" hint="When the time is up, your answers are checked automatically">
            <OptionCards
              label="Time per passage"
              columns={4}
              value={readingTime}
              onChange={setReadingTime}
              options={[
                ...READING_TIME_OPTIONS.map((sec) => ({ id: String(sec), label: `${sec / 60} min` })),
                { id: "custom", label: "Custom" },
                { id: "none", label: "No timer" },
              ]}
            />
            {readingTime === "custom" && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="number" min={1} max={30} value={customReadingMinutes}
                  onChange={(e) => setCustomReadingMinutes(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                  className="h-10 w-20 rounded-md border border-line-strong bg-surface px-3 text-[15px] tabular outline-none focus:border-accent"
                />
                minutes per passage
              </label>
            )}
          </Field>
        )}

        {area === "speaking" && mode === "interaction" && (
          <Field label="Topic">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Topic">
              {SPEAKING_TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={topic === t}
                  onClick={() => setTopic(t)}
                  className={cx("rounded-full border px-3.5 py-2 text-sm transition-colors", topic === t ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-ink-2 hover:border-accent/60")}
                >
                  {TOPIC_LABEL[t]}
                </button>
              ))}
            </div>
          </Field>
        )}

        {!adaptive && area !== "writing" && (
          <Field label={area === "speaking" && mode === "interaction" ? "Number of questions" : area === "reading" ? "Number of passages" : "Length"}>
            <OptionCards
              label="Length"
              columns={area === "speaking" && mode === "interaction" ? 4 : 3}
              value={String(count)}
              onChange={(v) => setCount(Number(v))}
              options={(area === "speaking" && mode === "interaction" ? [5, 10, 15, 20] : area === "reading" ? [5, 10, 20] : [10, 20, 30]).map((n) => ({
                id: String(n),
                label: `${n} ${area === "speaking" && mode === "interaction" ? "questions" : area === "reading" ? "passages" : "items"}`,
                description: area === "reading" ? `${n * 10} words to complete` : undefined,
              }))}
            />
            {area === "speaking" && mode === "interaction" && count === 20 && (
              <div className="mt-4 rounded-md border border-line bg-surface-2 px-4 py-3">
                <Toggle
                  checked={progressive}
                  onChange={setProgressive}
                  label="Progressive difficulty"
                  description="Easy → Medium → Hard → Very hard: the level rises every 5 questions (a practice setting, not an official TOEFL progression)."
                />
              </div>
            )}
          </Field>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <p className="text-sm text-ink-3">
            {area === "writing"
              ? "No hearts in writing — you get a full evaluation for every response."
              : area === "speaking" && mode === "interaction"
                ? "No hearts — you answer every question and get AI feedback on each answer."
              : area === "reading"
                ? "No hearts · each passage has 10 words to complete · passages you miss come back first next time."
              : adaptive
                ? "5 hearts · no question limit · the practice ends when you lose your last heart."
                : "5 hearts · every mistake costs one · mistakes are saved and come back later."}
          </p>
          <Button variant="primary" size="lg" disabled={(!level && !adaptive) || busy} onClick={() => void start()}>
            {busy && <Spinner />} Start Practice <IconArrowRight />
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
      </div>
    </>
  );
}
