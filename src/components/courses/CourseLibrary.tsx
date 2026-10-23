"use client";

/* eslint-disable @next/next/no-img-element -- course thumbnails come from local content files */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Course, CourseCategory } from "@/engine/content/library";
import { api } from "@/lib/api";
import { cardInteractive, ChipGroup, cx, EmptyState, PageHeader, Spinner } from "@/components/ui/primitives";
import { IconCourse, IconPlay } from "@/components/ui/icons";
import { duration } from "./format";

type Filter = "all" | CourseCategory;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reading", label: "Reading" },
  { id: "listening", label: "Listening" },
  { id: "speaking", label: "Speaking" },
  { id: "writing", label: "Writing" },
  { id: "grammar", label: "Grammar" },
  { id: "vocabulary", label: "Vocabulary" },
  { id: "strategy", label: "TOEFL Strategy" },
];

function CourseCard({ course }: { course: Course }) {
  const total = course.lessons.reduce((n, l) => n + l.durationSeconds, 0);
  return (
    <Link href={`/courses/${course.id}`} className={cx(cardInteractive, "group flex flex-col overflow-hidden")}>
      <div className="relative flex aspect-video items-center justify-center bg-surface-2 text-ink-3">
        {course.thumbnail ? <img src={course.thumbnail} alt="" className="h-full w-full object-cover" /> : <IconCourse width={32} height={32} />}
        {course.video && (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-black/55 text-white transition-transform duration-150 group-hover:scale-105">
                <IconPlay width={22} height={22} />
              </span>
            </span>
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">{duration(total)}</span>
          </>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[17px] font-semibold leading-snug">{course.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink-2">{course.description}</p>
        <p className="mt-3 text-sm text-ink-3">
          {course.instructor} · {course.lessons.length} {course.video ? "chapters" : "lessons"} · {duration(total)}
        </p>
      </div>
    </Link>
  );
}

export function CourseLibrary() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api.library().then((l) => setCourses(l.courses), () => setCourses([]));
  }, []);

  const shown = useMemo(() => (courses ?? []).filter((c) => filter === "all" || c.category === filter), [courses, filter]);

  return (
    <>
      <PageHeader eyebrow="Learn" title="Courses" description="Video lessons for each TOEFL skill, from grammar foundations to test strategy." />
      <div className="mb-6">
        <ChipGroup label="Course category" options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      {!courses && <div className="flex items-center gap-2 py-16 text-ink-3"><Spinner /> Loading courses…</div>}
      {courses && courses.length === 0 && (
        <EmptyState icon={<IconCourse />} title="No Courses Yet" text="Your courses will appear here." />
      )}
      {courses && courses.length > 0 && shown.length === 0 && (
        <EmptyState compact title="No courses in this category yet" />
      )}
      {shown.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => <CourseCard key={c.id} course={c} />)}
        </div>
      )}
    </>
  );
}
