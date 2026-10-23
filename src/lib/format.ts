import type { SectionId } from "@/engine/bank/types";

export const SECTION_LABEL: Record<SectionId | "spelling" | "grammar", string> = {
  reading: "Reading",
  listening: "Listening",
  writing: "Writing",
  speaking: "Speaking",
  spelling: "Spelling",
  grammar: "Grammar",
};

export const SECTION_SHORT: Record<SectionId, string> = { reading: "R", listening: "L", writing: "W", speaking: "S" };

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

export function formatBand(b: number | null | undefined): string {
  return b === null || b === undefined ? "—" : b.toFixed(1);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const countWords = (t: string) => (t.trim().match(/\S+/g) ?? []).length;
