"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientAnswer, ClientTask, CurrentView, SessionView } from "@/engine/session/viewTypes";
import { api, ApiError, type SessionAction } from "@/lib/api";
import { SECTION_LABEL } from "@/lib/format";
import { Button, Modal, Spinner } from "@/components/ui/primitives";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/icons";
import { WritingEvaluation } from "@/components/results/EvaluationViews";
import { ExamFooter, ExamHeader, ExitDialog, TimeUpOverlay } from "./ExamShell";
import { useAnswerSync, useCountdown } from "./hooks";
import { BookmarkButton, useRegister } from "@/components/register/Bookmark";
import { BlockIntro, SectionIntro } from "./Intros";
import { McqQuestion } from "./Mcq";
import { CompleteTheWords } from "./reading/CompleteTheWords";
import { DailyLifeText, PassageText } from "./reading/ReadingMaterial";
import { ExamAudioPlayer } from "./listening/ExamAudioPlayer";
import { NotesPanel } from "./listening/NotesPanel";
import { PracticeTranscriptCheck } from "./speaking/PracticeTranscriptCheck";
import { SpeakingTask } from "./speaking/SpeakingTask";
import { useMicrophone } from "./speaking/useMicrophone";
import { BuildSentence } from "./writing/BuildSentence";
import { DiscussionTaskView, EmailTaskView } from "./writing/EssayTasks";

const EMPTY: Record<string, ClientAnswer> = {};

type McqTask = Extract<ClientTask, { questions: unknown }>;
const hasQuestions = (t: ClientTask): t is McqTask => "questions" in t;
const isListening = (t: ClientTask) =>
  t.kind === "choose_response" || t.kind === "conversation" || t.kind === "announcement" || t.kind === "academic_talk";

/** ETS task directions for Read in Daily Life ("Read a notice."). */
const READ_DIRECTIONS: Record<string, string> = {
  email: "Read an email.",
  notice: "Read a notice.",
  text_chain: "Read a chain of text messages.",
};

const LISTEN_TITLE: Record<string, string> = {
  choose_response: "Listen to the speaker and choose the best response.",
  conversation: "Listen to a conversation.",
  announcement: "Listen to an announcement.",
  academic_talk: "Listen to an academic talk.",
};

function scoredCount(t: ClientTask): number {
  if (t.kind === "complete_the_words") return t.blanks.length;
  if (hasQuestions(t)) return t.questions.length;
  return 1;
}

/** What the learner will see after the current task — shown in the footer. */
function nextStepLabel(view: SessionView, cur: CurrentView, lastInner: boolean): string {
  const block = cur.blocks[cur.blockIndex];
  if (!lastInner || cur.taskIndex < block.end - 1) return "Next: the next question";
  if (cur.blockIndex < cur.blocks.length - 1) return `Next: ${cur.blocks[cur.blockIndex + 1].label}`;
  if (cur.module && cur.module.stage === 1 && cur.module.stageCount === 2) return "Next: Module 2";
  const idx = view.sections.findIndex((s) => s.id === cur.section);
  const nextSection = view.sections[idx + 1];
  return nextSection ? `Next: ${SECTION_LABEL[nextSection.id]} section` : "Next: your results";
}

export function ExamRunner({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const mic = useMicrophone();
  const [view, setView] = useState<SessionView | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [inner, setInner] = useState(0);
  const [audioDone, setAudioDone] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: SessionAction } | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const innerOnArrive = useRef<"first" | "last">("first");

  const apply = useCallback(
    (v: SessionView) => {
      setOffset(v.serverNow - Date.now());
      setView(v);
      if (v.status === "completed") router.replace(`/results/${v.id}`);
    },
    [router],
  );

  const refresh = useCallback(() => {
    api.view(sessionId).then(apply, (e) => setError((e as Error).message));
  }, [sessionId, apply]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const cur = view?.current ?? null;
  const { answers, setAnswer, flush } = useAnswerSync(sessionId, cur?.answers ?? EMPTY, refresh);
  const register = useRegister(sessionId);

  const act = useCallback(
    async (action: SessionAction) => {
      setBusy(true);
      try {
        await flush();
        apply(await api.action(sessionId, action));
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) refresh();
        else setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [flush, apply, refresh, sessionId],
  );

  // Reset the in-task question index when the task changes.
  const taskKey = `${cur?.section}:${cur?.module?.id}:${cur?.taskIndex}`;
  useEffect(() => {
    const t = cur?.module?.tasks[cur.taskIndex];
    setInner(innerOnArrive.current === "last" && t ? scoredCount(t) - 1 : 0);
    innerOnArrive.current = "first";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on task change
  }, [taskKey]);

  const running = cur?.status === "active" && cur.blockStarted;
  const deadline = running
    ? [cur.sectionDeadline, cur.blockDeadline, cur.question && !cur.question.paused ? cur.question.deadline : null]
        .filter((d): d is number => d !== null)
        .sort((a, b) => a - b)[0] ?? null
    : null;

  const onExpire = useCallback(async () => {
    setExpired(true);
    try {
      await flush();
      apply(await api.action(sessionId, { type: "timeout" }));
    } catch {
      refresh();
    } finally {
      setExpired(false);
    }
  }, [flush, apply, refresh, sessionId]);
  const remaining = useCountdown(deadline, offset, onExpire);

  // Timed Listening (real or practice): each question's own clock starts when the question appears (after the recording).
  const perQuestionMode = !!view && view.config.timed && cur?.section === "listening";
  const questionToStart = (() => {
    if (!perQuestionMode || !cur || cur.status !== "active" || !cur.blockStarted || !cur.module) return null;
    const t = cur.module.tasks[cur.taskIndex];
    // Nothing to start while a question is on screen (running, or checked in practice).
    if (!t || !hasQuestions(t) || cur.lockedTasks.includes(t.id) || cur.question) return null;
    const started = t.questions.some((x) => cur.lockedItems.includes(x.id));
    if (!audioDone[t.id] && !started) return null;
    return t.questions.find((x) => !cur.lockedItems.includes(x.id))?.id ?? null;
  })();
  const requestedStart = useRef<string | null>(null);
  useEffect(() => {
    if (!questionToStart || requestedStart.current === questionToStart) return;
    requestedStart.current = questionToStart;
    void act({ type: "startQuestion", itemId: questionToStart });
  }, [questionToStart, act]);

  // Practice mode: the spoken answer whose transcript is being checked before the next task appears.
  const [reviewItem, setReviewItem] = useState<string | null>(null);
  const endReview = useCallback(() => setReviewItem(null), []);

  // Poll while an instant-correction evaluation is pending.
  const pendingEval = useMemo(
    () => Object.values(cur?.evaluations ?? {}).some((e) => e.status === "queued" || e.status === "running"),
    [cur?.evaluations],
  );
  useEffect(() => {
    if (!pendingEval) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [pendingEval, refresh]);

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-danger">{error}</p>
        <Button onClick={() => router.push("/")}>Back to dashboard</Button>
      </main>
    );
  }
  if (!view || !cur) {
    return (
      <main className="flex flex-1 items-center justify-center gap-2 text-ink-3">
        <Spinner /> {view?.status === "completed" ? "Opening your results…" : "Loading test…"}
      </main>
    );
  }

  const saveAndExit = async () => {
    setExiting(true);
    try {
      await flush();
    } finally {
      router.push("/");
    }
  };
  const discardAndExit = async () => {
    setExiting(true);
    try {
      await api.deleteSession(sessionId);
      router.push("/");
    } catch (e) {
      setError((e as Error).message);
      setExiting(false);
    }
  };
  const openExit = () => setExitOpen(true);
  const exitDialog = (
    <ExitDialog
      open={exitOpen}
      busy={exiting}
      timerRunning={cur.status === "active" && (cur.sectionDeadline !== null || !!cur.question)}
      onCancel={() => setExitOpen(false)}
      onSaveAndExit={() => void saveAndExit()}
      onDiscard={() => void discardAndExit()}
    />
  );

  if (cur.status === "ready") {
    return (
      <>
        <SectionIntro
          view={view}
          busy={busy}
          mic={mic}
          onExit={openExit}
          onBegin={async () => {
            if (cur.section === "speaking" && mic.status === "idle") await mic.request();
            void act({ type: "beginSection" });
          }}
        />
        {exitDialog}
      </>
    );
  }
  const block = cur.blocks[cur.blockIndex];
  if (!cur.blockStarted) {
    return (
      <>
        <BlockIntro
          label={block.label}
          seconds={block.seconds}
          timed={view.config.timed}
          busy={busy}
          onExit={openExit}
          onBegin={() => void act({ type: "beginBlock" })}
        />
        {exitDialog}
      </>
    );
  }

  const mod = cur.module!;
  const task = mod.tasks[cur.taskIndex];
  const real = view.config.mode === "real";
  // 2026 rules: Reading lets you move freely inside the current module even in Real Test Conditions;
  // Listening times every question separately and is forward-only.
  const freeNav = (!real || cur.section === "reading") && !perQuestionMode;
  const perQuestion = perQuestionMode;
  const instant = view.config.instantCorrection;
  const nQ = scoredCount(task);
  const multiQ = hasQuestions(task) && task.questions.length > 1;
  // In per-question mode the server decides which question is open (the first one not yet submitted).
  // (the running/checked question, otherwise the first one not yet submitted).
  const serverQ =
    perQuestion && hasQuestions(task)
      ? Math.max(0, task.questions.findIndex((x) => (cur.question ? x.id === cur.question.itemId : !cur.lockedItems.includes(x.id))))
      : null;
  const qIndex = serverQ !== null ? serverQ : multiQ ? Math.min(inner, nQ - 1) : 0;
  const lastInner = !multiQ || qIndex >= nQ - 1;
  const taskLocked = cur.lockedTasks.includes(task.id);
  const disabled = busy || expired || taskLocked;
  const firstNumber = cur.itemNumbers[cur.taskIndex];
  const number = firstNumber + qIndex;
  const counter =
    task.kind === "complete_the_words"
      ? `Questions ${firstNumber}–${firstNumber + nQ - 1} / ${cur.sectionItemTotal}`
      : `Question ${number} / ${cur.sectionItemTotal}`;
  const progress = (firstNumber - 1 + qIndex) / cur.sectionItemTotal;
  const subLabel = mod.stageCount === 2 ? `Module ${mod.stage} of 2` : cur.section === "writing" ? block.label : null;
  const listeningTask = isListening(task);
  // A recording is never replayed after a reload once its questions have started.
  const questionsStarted = perQuestion && hasQuestions(task) && (!!cur.question || task.questions.some((x) => cur.lockedItems.includes(x.id)));
  const needsAudio = listeningTask && !audioDone[task.id] && !questionsStarted;
  const q = hasQuestions(task) ? task.questions[qIndex] : null;
  const qAnswer = q ? answers[q.id] : undefined;
  const qFeedback = q ? cur.feedback[q.id] ?? null : null;

  const selectMcq = (itemId: string, optionId: string) => setAnswer(itemId, { kind: "mcq", optionId }, 0);

  /* ---------- footer controls ---------- */

  const atBlockStart = cur.taskIndex === block.start && qIndex === 0;
  const atBlockEnd = cur.taskIndex === block.end - 1 && lastInner;
  const unansweredHere = q
    ? !qAnswer
    : task.kind === "complete_the_words"
      ? task.blanks.some((b) => !(answers[b.id]?.kind === "text" && (answers[b.id] as { value: string }).value))
      : task.kind === "build_a_sentence"
        ? !(answers[task.id]?.kind === "order" && (answers[task.id] as { chunks: string[] }).chunks.length > 0)
        : task.kind === "write_email" || task.kind === "academic_discussion"
          ? !(answers[task.id]?.kind === "essay" && (answers[task.id] as { text: string }).text.trim())
          : false;

  // Nothing typed/selected at all (a partly completed Complete-the-Words can still be checked).
  const nothingEntered =
    task.kind === "complete_the_words"
      ? task.blanks.every((b) => !(answers[b.id]?.kind === "text" && (answers[b.id] as { value: string }).value))
      : unansweredHere;

  /** Next question; `wholeTask` skips the rest of a multi-question task (e.g. a recording and its questions). */
  const moveOn = (wholeTask = false) => {
    if (perQuestion && wholeTask) return void act({ type: "submitTask", taskId: task.id, advance: true });
    if (perQuestion && q) return void act({ type: "submitQuestion", itemId: q.id });
    if (!wholeTask && !lastInner) return setInner(qIndex + 1);
    if (!freeNav) return void act({ type: "submitTask", taskId: task.id, advance: true });
    if (cur.taskIndex < block.end - 1) return void act({ type: "goto", taskIndex: cur.taskIndex + 1 });
    const endsModule = cur.blockIndex === cur.blocks.length - 1;
    setConfirm({
      title: endsModule ? (mod.stageCount === 2 ? `Finish Module ${mod.stage}?` : `Finish ${SECTION_LABEL[cur.section]}?`) : `Finish ${block.label}?`,
      body: "You will not be able to return to these questions. Unanswered questions count as incorrect.",
      action: { type: "next" },
    });
  };
  const goNext = () => moveOn(false);
  const goBack = () => {
    if (qIndex > 0) return setInner(qIndex - 1);
    innerOnArrive.current = "last";
    void act({ type: "goto", taskIndex: cur.taskIndex - 1 });
  };

  type FooterButton = { label: string; onClick: () => void; disabled: boolean; primary: boolean; arrow: boolean };
  const buttons: FooterButton[] = [];
  const blocked = busy || expired;
  if (real && !freeNav) {
    // Real Test Conditions (forward-only sections): an answer is required before moving on (the timer still auto-submits).
    buttons.push({ label: atBlockEnd ? "Submit" : "Next", onClick: goNext, disabled: blocked || needsAudio || unansweredHere, primary: true, arrow: true });
  } else if (needsAudio) {
    buttons.push({ label: "Skip", onClick: () => moveOn(true), disabled: blocked, primary: false, arrow: true });
  } else {
    const checkable = instant && !taskLocked && (q ? !qFeedback : true);
    const nextLabel = atBlockEnd ? "Finish" : "Next";
    if (checkable) {
      const essay = task.kind === "write_email" || task.kind === "academic_discussion";
      buttons.push({ label: atBlockEnd ? "Skip and finish" : "Skip", onClick: goNext, disabled: blocked, primary: false, arrow: true });
      buttons.push({
        label: essay ? "Submit for evaluation" : "Check answer",
        onClick: () =>
          void act(q ? { type: "checkItem", itemId: q.id } : { type: "submitTask", taskId: task.id, advance: false }),
        disabled: blocked || nothingEntered,
        primary: true,
        arrow: false,
      });
    } else {
      buttons.push({ label: nextLabel, onClick: goNext, disabled: blocked, primary: true, arrow: true });
    }
  }

  const hint = expired
    ? "Time is up."
    : needsAudio
      ? real
        ? "Questions appear after the recording ends."
        : "Questions appear after the recording ends. You can also skip this recording and its questions."
      : perQuestion && unansweredHere
        ? "This question has its own timer. Answer before it ends; you cannot return to it."
        : real && !freeNav && unansweredHere
        ? task.kind === "complete_the_words"
          ? "Complete every word to continue. You cannot return to this text later."
          : "Answer the question to continue. You cannot return to it later."
        : freeNav && unansweredHere
          ? block.end - block.start > 1 || multiQ
            ? "Not answered yet. You can skip it and come back with Back before finishing."
            : "Not answered yet. If you finish without answering, this task scores 0."
          : nextStepLabel(view, cur, lastInner);

  /* ---------- body ---------- */

  const mark = (key: string) => <BookmarkButton saved={register.isSaved(key)} onToggle={() => void register.toggle(key)} />;

  let body: ReactNode;
  if (task.kind === "complete_the_words") {
    body = (
      <CompleteTheWords
        task={task}
        answers={answers}
        onChange={(id, value) => setAnswer(id, { kind: "text", value })}
        disabled={disabled}
        feedback={cur.feedback}
        firstNumber={firstNumber}
        bookmark={mark(task.id)}
      />
    );
  } else if (task.kind === "daily_life" || task.kind === "academic_passage") {
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="max-h-[48vh] overflow-y-auto rounded-lg lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-170px)]">
          <p className="mb-3 text-[15px] text-ink-2">
            {task.kind === "daily_life" ? READ_DIRECTIONS[task.textType] ?? "Read the text." : "Read an academic passage."}
          </p>
          {task.kind === "daily_life" ? <DailyLifeText task={task} /> : <PassageText task={task} highlightText={q?.highlightText ?? null} stem={q?.stem ?? null} />}
        </div>
        <div>
          {q && (
            <McqQuestion
              key={q.id}
              q={q}
              number={number}
              selected={qAnswer?.kind === "mcq" ? qAnswer.optionId : null}
              onSelect={(o) => selectMcq(q.id, o)}
              disabled={disabled || !!qFeedback}
              feedback={qFeedback}
              bookmark={mark(q.id)}
            />
          )}
        </div>
      </div>
    );
  } else if (listeningTask && hasQuestions(task)) {
    const t = task as Extract<ClientTask, { kind: "choose_response" | "conversation" | "announcement" | "academic_talk" }>;
    body = (
      <div className="mx-auto max-w-4xl">
        <p className="mb-4 text-[15px] text-ink-2">{"title" in t ? t.title : LISTEN_TITLE[t.kind]}</p>
        {needsAudio ? (
          <div className="mx-auto max-w-xl">
            {t.image && (
              // eslint-disable-next-line @next/next/no-img-element -- local speaker photo
              <img src={t.image} alt="" className="mx-auto mb-4 aspect-[4/3] w-full max-w-md rounded-lg border border-line object-cover object-top" />
            )}
            <ExamAudioPlayer
              key={t.id}
              src={t.audio}
              mode={real ? "once" : "free"}
              onEnded={() => setAudioDone((d) => ({ ...d, [t.id]: true }))}
            />
            {!real && (
              <button className="mt-3 text-sm text-accent hover:underline" onClick={() => setAudioDone((d) => ({ ...d, [t.id]: true }))}>
                Skip to the question{nQ > 1 ? "s" : ""}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div className="space-y-3">
              {t.image && (
                // eslint-disable-next-line @next/next/no-img-element -- local speaker photo
                <img src={t.image} alt="" className="aspect-[4/3] w-full rounded-lg border border-line object-cover object-top" />
              )}
              {!real && <ExamAudioPlayer key={`${t.id}-replay`} src={t.audio} mode="free" autoPlay={false} label="Replay recording" />}
            </div>
            {q && (
              <McqQuestion
                key={q.id}
                q={q}
                number={number}
                selected={qAnswer?.kind === "mcq" ? qAnswer.optionId : null}
                onSelect={(o) => selectMcq(q.id, o)}
                disabled={disabled || !!qFeedback}
                feedback={qFeedback}
                directions={t.kind === "choose_response" ? undefined : "Choose the best response."}
                bookmark={mark(q.id)}
              />
            )}
          </div>
        )}
      </div>
    );
  } else if (task.kind === "build_a_sentence") {
    const a = answers[task.id];
    body = (
      <BuildSentence
        key={task.id}
        task={task}
        chunks={a?.kind === "order" ? a.chunks : []}
        onChange={(chunks) => setAnswer(task.id, { kind: "order", chunks }, 300)}
        disabled={disabled}
        feedback={cur.feedback[task.id] ?? null}
        bookmark={mark(task.id)}
      />
    );
  } else if (task.kind === "write_email" || task.kind === "academic_discussion") {
    const a = answers[task.id];
    const text = a?.kind === "essay" ? a.text : "";
    const onText = (v: string) => setAnswer(task.id, { kind: "essay", text: v }, 1200);
    body = (
      <>
        {task.kind === "write_email" ? (
          <EmailTaskView task={task} text={text} onChange={onText} disabled={disabled} bookmark={mark(task.id)} />
        ) : (
          <DiscussionTaskView task={task} text={text} onChange={onText} disabled={disabled} bookmark={mark(task.id)} />
        )}
        {instant && taskLocked && (
          <div className="mt-8 rounded-lg border border-line bg-surface p-5">
            <WritingEvaluation
              response={text}
              evaluation={cur.evaluations[task.id] ?? null}
              onRetry={() => void api.retryEvaluation(sessionId, task.id).then(refresh)}
            />
          </div>
        )}
      </>
    );
  } else if (task.kind === "listen_and_repeat" || task.kind === "interview") {
    const firstInterview = task.kind === "interview" && mod.tasks.findIndex((t) => t.kind === "interview") === cur.taskIndex;
    body = reviewItem ? (
      <PracticeTranscriptCheck
        key={`check-${reviewItem}`}
        evaluation={cur.evaluations[reviewItem] ?? null}
        recordingUrl={`/api/recordings/${sessionId}/${encodeURIComponent(reviewItem)}`}
        onValidate={async (text) => {
          await api.confirmTranscript(sessionId, reviewItem, text);
          endReview();
          refresh();
        }}
        onRetry={() => void api.retryEvaluation(sessionId, reviewItem).then(refresh)}
        onContinue={endReview}
      />
    ) : (
      <SpeakingTask
        key={task.id}
        task={task}
        meta={cur.speaking!}
        mic={mic}
        showIntro={firstInterview}
        practice={!real}
        number={number}
        bookmark={mark(task.id)}
        onUpload={async (blob, durationMs) => {
          apply(await api.uploadRecording(sessionId, task.id, blob, durationMs));
          if (!real) setReviewItem(task.id); // check its transcript before the next task
        }}
        onSkip={() => act({ type: "submitTask", taskId: task.id, advance: true })}
      />
    );
  }

  const speaking = cur.section === "speaking";

  return (
    <div className="flex min-h-screen flex-col">
      <ExamHeader
        section={SECTION_LABEL[cur.section]}
        counter={counter}
        remainingMs={remaining}
        timerLabel={perQuestion ? "Time for this question" : undefined}
        progress={progress}
        subLabel={subLabel}
        onExit={openExit}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{body}</main>
      {!speaking && (
        <ExamFooter
          hint={hint}
          left={
            freeNav && (
              <Button onClick={goBack} disabled={atBlockStart || busy || expired}>
                <IconArrowLeft /> Back
              </Button>
            )
          }
          right={buttons.map((b) => (
            <Button key={b.label} variant={b.primary ? "primary" : "secondary"} onClick={b.onClick} disabled={b.disabled}>
              {busy && b.primary && <Spinner />} {b.label} {b.arrow && !(busy && b.primary) && <IconArrowRight />}
            </Button>
          ))}
        />
      )}
      {speaking && (
        <ExamFooter hint="Responses are submitted automatically when the response time ends. You cannot return to previous questions." right={null} />
      )}
      {cur.section === "listening" && <NotesPanel initial={cur.notes} onSave={(text) => void api.action(sessionId, { type: "notes", text }).catch(() => undefined)} />}
      {expired && <TimeUpOverlay />}
      {exitDialog}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""}>
        {confirm && (
          <div className="p-6">
            <h2 className="text-lg font-semibold">{confirm.title}</h2>
            <p className="mt-2 text-[15px] text-ink-2">{confirm.body}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const a = confirm.action;
                  setConfirm(null);
                  void act(a);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
