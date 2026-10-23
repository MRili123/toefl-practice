import type { CourseCategory } from "@/engine/content/library";

export const CATEGORY_LABEL: Record<CourseCategory, string> = {
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  strategy: "TOEFL Strategy",
};

/** Course length: "3m", "1h 20m". */
export function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** A position in a video: "2:05". */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
