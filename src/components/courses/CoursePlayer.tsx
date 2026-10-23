"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Course } from "@/engine/content/library";
import { cx, EmptyState, PageHeader } from "@/components/ui/primitives";
import { IconArrowLeft, IconCheck, IconCourse, IconPlay } from "@/components/ui/icons";
import { CATEGORY_LABEL, clock, duration } from "./format";

/** Where the learner stopped, and the chapters they played through to the end. */
type Progress = { t: number; done: string[] };
const storageKey = (id: string) => `course-progress:${id}`;

function loadProgress(id: string): Progress {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey(id)) ?? "null") as Progress | null;
    return v && Number.isFinite(v.t) && Array.isArray(v.done) ? v : { t: 0, done: [] };
  } catch {
    return { t: 0, done: [] };
  }
}
function saveProgress(id: string, p: Progress) {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(p));
  } catch {
    // progress is a convenience; the course plays without it
  }
}

/** A course video with its chapter list: the current chapter follows playback, and a chapter jumps the video there. */
export function CoursePlayer({ course }: { course: Course }) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const lastTime = useRef(0);
  const lastSave = useRef(0);
  const total = course.lessons.reduce((n, l) => n + l.durationSeconds, 0);
  const chaptered = !!course.video && course.lessons.every((l) => l.startSeconds !== undefined);
  const current = chaptered ? course.lessons.findLastIndex((l) => time >= (l.startSeconds ?? 0)) : -1;

  // Resume where the learner stopped last time (unless they had reached the end).
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const p = loadProgress(course.id);
    const resume = () => {
      if (p.t > 3 && p.t < v.duration - 5) v.currentTime = p.t;
      lastTime.current = v.currentTime;
      setDone(p.done);
      setTime(v.currentTime);
    };
    if (v.readyState >= 1) resume();
    else v.addEventListener("loadedmetadata", resume, { once: true });
    return () => v.removeEventListener("loadedmetadata", resume);
  }, [course.id]);

  const onTime = () => {
    const v = video.current;
    if (!v) return;
    const now = v.currentTime, before = lastTime.current;
    lastTime.current = now;
    setTime(now);
    // A chapter is finished when playback runs through its end (a jump past it does not count).
    let finished = done;
    if (now > before && now - before < 1.5) {
      const ends = course.lessons.filter((l) => !done.includes(l.id) && l.startSeconds !== undefined)
        .filter((l) => { const end = l.startSeconds! + l.durationSeconds; return end > before && end <= now + 0.5; });
      if (ends.length) setDone((finished = [...done, ...ends.map((l) => l.id)]));
    }
    if (Math.abs(now - lastSave.current) > 2 || v.ended || finished !== done) {
      lastSave.current = now;
      saveProgress(course.id, { t: v.ended ? 0 : now, done: finished });
    }
  };

  const jump = (start: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = start;
    void v.play().catch(() => undefined);
  };

  return (
    <>
      <Link href="/courses" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <IconArrowLeft /> Courses
      </Link>
      <PageHeader eyebrow={CATEGORY_LABEL[course.category]} title={course.title} description={course.description} />

      {!course.video ? (
        <EmptyState icon={<IconCourse />} title="This course has no video yet" text="Its lessons are listed below." />
      ) : null}

      <div className={cx("grid gap-6", course.video && "lg:grid-cols-[minmax(0,1fr)_340px]")}>
        {course.video && (
          <div>
            <video
              ref={video}
              src={course.video}
              poster={course.thumbnail ?? undefined}
              controls
              preload="metadata"
              playsInline
              onTimeUpdate={onTime}
              onPause={onTime}
              onEnded={onTime}
              className="aspect-video w-full rounded-lg border border-line bg-black"
            />
            <p className="mt-3 text-sm text-ink-3">
              {course.instructor} · {duration(total)} · Narrated, with chapters
            </p>
          </div>
        )}

        <section aria-label="Lessons" className="self-start rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">{chaptered ? "Chapters" : "Lessons"}</h2>
            <span className="text-xs text-ink-3">{course.lessons.length} · {duration(total)}</span>
          </div>
          <ol className="p-1.5">
            {course.lessons.map((l, i) => {
              const start = l.startSeconds;
              const finished = chaptered && done.includes(l.id);
              const active = i === current;
              const body = (
                <>
                  <span
                    className={cx(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                      active ? "bg-accent text-white" : finished ? "bg-success-weak text-success" : "bg-surface-2 text-ink-3",
                    )}
                  >
                    {active ? <IconPlay width={12} height={12} /> : finished ? <IconCheck width={14} height={14} /> : i + 1}
                  </span>
                  <span className={cx("flex-1 text-sm leading-snug", active ? "font-semibold text-ink" : "text-ink-2")}>{l.title}</span>
                  <span className="text-xs tabular-nums text-ink-3">{start !== undefined ? clock(start) : duration(l.durationSeconds)}</span>
                </>
              );
              return (
                <li key={l.id}>
                  {chaptered && start !== undefined ? (
                    <button
                      type="button"
                      onClick={() => jump(start)}
                      aria-current={active ? "step" : undefined}
                      className={cx("flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left hover:bg-surface-2", active && "bg-accent-weak hover:bg-accent-weak")}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-2.5 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </>
  );
}
