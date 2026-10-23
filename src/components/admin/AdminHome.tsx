"use client";

import Link from "next/link";
import { type ComponentType, type SVGProps, useEffect, useState } from "react";
import { type AdminSummary, api } from "@/lib/api";
import { cardInteractive, cx, EmptyState, PageHeader, Spinner } from "@/components/ui/primitives";
import { IconAlert, IconArrowRight, IconDocument, IconGrammar, IconMic, IconPen, IconSpelling } from "@/components/ui/icons";
import { ADMIN_AREAS, type AdminArea } from "./areas";

export const AREA_META: Record<AdminArea, { name: string; description: string; icon: ComponentType<SVGProps<SVGSVGElement>> }> = {
  reading: { name: "Reading Practice", description: "Complete the Words passages: title, text and the 10 words to complete.", icon: IconDocument },
  spelling: { name: "Spelling", description: "Dictation words and sentences, including words learned from your mistakes.", icon: IconSpelling },
  grammar: { name: "Grammar", description: "Multiple-choice questions by category, including AI questions made from your mistakes.", icon: IconGrammar },
  writing: { name: "Writing", description: "Email, academic discussion and general writing prompts.", icon: IconPen },
  speaking: { name: "Speaking", description: "Interaction Test questions by topic, and Listen & Repeat sentences.", icon: IconMic },
};

function count(s: AdminSummary, a: AdminArea): string {
  const c = s.content;
  if (a === "speaking") return `${c.interaction} questions · ${c.repeat} sentences`;
  const n = c[a];
  const unit = a === "reading" ? "passage" : a === "spelling" ? "item" : a === "grammar" ? "question" : "prompt";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export function AdminHome() {
  const [data, setData] = useState<AdminSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.adminSummary().then(setData, (e) => setError((e as Error).message));
  }, []);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Content & mistakes" description="Add, edit and delete the questions of every exercise, and review every mistake you have not mastered yet." />
      {error ? (
        <EmptyState title="The admin data could not be loaded" text={error} />
      ) : !data ? (
        <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ADMIN_AREAS.map((a) => {
            const m = AREA_META[a];
            return (
              <Link key={a} href={`/admin/${a}`} className={cx(cardInteractive, "group flex flex-col p-6")}>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-weak text-accent"><m.icon width={22} height={22} /></div>
                <h2 className="mt-4 text-lg font-semibold tracking-tight">{m.name}</h2>
                <p className="mt-1 flex-1 text-[15px] leading-relaxed text-ink-2">{m.description}</p>
                <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                  <span className="text-sm text-ink-3 tabular">{count(data, a)}</span>
                  <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent">
                    Manage <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
          <Link href="/admin/mistakes" className={cx(cardInteractive, "group flex flex-col border-danger/30 p-6")}>
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-danger-weak text-danger"><IconAlert width={22} height={22} /></div>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">Non-mastered mistakes</h2>
            <p className="mt-1 flex-1 text-[15px] leading-relaxed text-ink-2">
              Spelling and grammar mistakes from your series tests and practice, with the AI questions made from your writing mistakes.
            </p>
            <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm text-ink-3 tabular">
                {data.mistakes.open} to master · {data.mistakes.spelling} spelling · {data.mistakes.grammar} grammar
              </span>
              <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent">
                Review <IconArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        </div>
      )}
    </>
  );
}
