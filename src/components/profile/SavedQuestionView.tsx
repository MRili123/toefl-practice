"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RegisterReview } from "@/engine/profile/register";
import { api } from "@/lib/api";
import { formatDate, pad2, SECTION_LABEL } from "@/lib/format";
import { Button, EmptyState, Spinner, StatusMark } from "@/components/ui/primitives";
import { IconBookmarkFilled, IconClock } from "@/components/ui/icons";
import { SectionIcon } from "@/components/ui/sectionIcons";
import { ItemDetail } from "@/components/results/SectionDetail";
import { SpeakingEvaluation, WritingEvaluation } from "@/components/results/EvaluationViews";
import { TASK_LABEL } from "./levels";

export function SavedQuestionView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<RegisterReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    api.savedReview(id).then(setData, (e) => setError((e as Error).message));
  }, [id]);

  if (error) {
    return (
      <EmptyState
        title="This saved question is not available"
        text={error}
        action={<Link href="/profile" className="text-sm font-medium text-accent hover:underline">Back to Profile</Link>}
      />
    );
  }
  if (!data) return <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading…</div>;

  const q = data.saved;
  const remove = async () => {
    setRemoving(true);
    await api.removeSaved(q.id);
    router.push("/profile");
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/profile" className="text-sm text-ink-2 hover:text-ink">← Profile</Link>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            <SectionIcon section={q.section} width={14} height={14} />
            {SECTION_LABEL[q.section]} · {TASK_LABEL[q.taskKind] ?? q.taskKind}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{q.numberLabel}</h1>
          <p className="mt-1 text-sm text-ink-3">
            Series {pad2(q.testNumber)} · Saved {formatDate(q.savedAt)}
          </p>
        </div>
        <Button onClick={() => void remove()} disabled={removing}>
          {removing ? <Spinner /> : <IconBookmarkFilled className="text-accent" />} Remove from Register
        </Button>
      </header>

      <div className="mt-6">
        {!data.available ? (
          <EmptyState
            icon={<IconClock />}
            title="Available after you finish this test"
            text="Answers and explanations are shown once the test is complete, so saving a question never reveals it early."
            action={<Link href={`/test/${q.sessionId}`} className="text-sm font-medium text-accent hover:underline">Continue the test</Link>}
          />
        ) : data.items.length === 1 ? (
          <ItemDetail it={data.items[0]} />
        ) : data.items.length > 1 ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              <table className="w-full text-[15px]">
                <thead className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-[0.06em] text-ink-3">
                  <tr>
                    <th className="px-4 py-2 font-semibold">#</th>
                    <th className="px-4 py-2 font-semibold">Your answer</th>
                    <th className="px-4 py-2 font-semibold">Correct word</th>
                    <th className="px-4 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.itemId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 text-ink-3 tabular">{it.number}</td>
                      <td className="px-4 py-2.5">{it.yourAnswer ?? <span className="text-ink-3">No answer</span>}</td>
                      <td className="px-4 py-2.5 font-medium text-success">{it.correctAnswer}</td>
                      <td className="px-4 py-2.5"><StatusMark status={it.correctness} withLabel /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-ink-3">Skill: {data.items[0].skill ?? "—"}</p>
          </div>
        ) : data.task ? (
          <section className="rounded-xl border border-line bg-surface p-5 sm:p-7">
            <h2 className="text-xl font-semibold">{data.task.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{data.task.prompt}</p>
            {data.task.details.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-ink-3">
                {data.task.details.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
            <div className="mt-6">
              {data.task.kind === "write_email" || data.task.kind === "academic_discussion" ? (
                <WritingEvaluation response={data.task.response.text ?? ""} evaluation={data.task.evaluation} />
              ) : (
                <SpeakingEvaluation recordingUrl={data.task.response.recordingUrl} evaluation={data.task.evaluation} />
              )}
            </div>
          </section>
        ) : (
          <EmptyState title="Nothing to review" text="This question has no recorded answer." />
        )}
      </div>
    </div>
  );
}
