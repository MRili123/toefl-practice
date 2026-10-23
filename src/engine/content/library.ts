/**
 * Course and exercise libraries. Built-in courses ship with the app (videos in public/courses); more can be
 * dropped in as JSON under data/courses/*.json, and exercises under data/exercises/{category}.json.
 */
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../paths";

export const COURSE_CATEGORIES = ["reading", "listening", "speaking", "writing", "grammar", "vocabulary", "strategy"] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export interface CourseLesson {
  id: string;
  title: string;
  durationSeconds: number;
  /** Where the lesson starts in the course video (a course with one video split into chapters). */
  startSeconds?: number;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  instructor: string;
  thumbnail: string | null;
  category: CourseCategory;
  lessons: CourseLesson[];
  /** The course video (a path under public/), when the course has one. */
  video?: string;
}

/** Chapters of a single course video: start times in seconds, the last one running to `total`. */
function chapters(total: number, list: [id: string, title: string, start: number][]): CourseLesson[] {
  return list.map(([id, title, start], i) => ({ id, title, startSeconds: start, durationSeconds: (list[i + 1]?.[2] ?? total) - start }));
}

/** Courses that ship with the app (content in public/courses). */
const BUILT_IN_COURSES: Course[] = [
  {
    id: "toefl-exam-guide",
    title: "How the TOEFL iBT Works",
    description:
      "A 3-minute guided tour of the 2026 exam: the four sections and their timing, adaptive testing, every question type, the 1–6 score and its CEFR levels, and test center vs Home Edition.",
    instructor: "TOEFL Practice",
    thumbnail: "/courses/toefl-exam-guide.jpg",
    category: "strategy",
    video: "/courses/toefl-exam-guide.mp4",
    lessons: chapters(195, [
      ["intro", "Introduction", 0],
      ["sections", "The four sections", 24],
      ["timeline", "Exam timeline", 40],
      ["adaptive", "Adaptive testing", 57],
      ["question-types", "Question types", 75],
      ["scoring", "Scoring: 1–6 and CEFR levels", 118],
      ["venue", "Test center vs Home Edition", 153],
      ["summary", "The full picture", 173],
    ]),
  },
];

export const EXERCISE_CATEGORIES = ["spelling", "grammar", "writing", "speaking"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Built-in courses first, then any added as JSON under data/courses/. */
export function listCourses(): Course[] {
  const dir = path.join(DATA_DIR, "courses");
  const added = !fs.existsSync(dir)
    ? []
    : fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => readJson<Course>(path.join(dir, f)))
        .filter((c): c is Course => !!c && Array.isArray(c.lessons) && !BUILT_IN_COURSES.some((b) => b.id === c.id));
  return [...BUILT_IN_COURSES, ...added];
}

export function getCourse(id: string): Course | null {
  return listCourses().find((c) => c.id === id) ?? null;
}

export function exerciseCounts(): Record<ExerciseCategory, number> {
  const counts = {} as Record<ExerciseCategory, number>;
  for (const cat of EXERCISE_CATEGORIES) {
    const items = readJson<unknown[]>(path.join(DATA_DIR, "exercises", `${cat}.json`));
    counts[cat] = Array.isArray(items) ? items.length : 0;
  }
  return counts;
}
