import type { SectionId } from "../bank/types";
import { type Band, SECTION_CONCORDANCE, TOTAL_CONCORDANCE } from "../config/toefl2026";

export function bandFromScale30(section: SectionId, scale30: number): Band {
  const s = Math.max(0, Math.min(30, Math.round(scale30)));
  return SECTION_CONCORDANCE[section].find((row) => s >= row.min)!.band;
}

/** Mean of section bands rounded to the nearest half band, halves up (ETS: 5.25 → 5.5). */
export function overallBand(bands: Band[]): Band | null {
  if (bands.length === 0) return null;
  const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
  return (Math.floor(mean * 2 + 0.5) / 2) as Band;
}

/** ETS transition score: midpoint of the band's 0–120 range (rounded half up). */
export function comparable120(band: Band): { score: number; min: number; max: number } {
  const row = TOTAL_CONCORDANCE.find((r) => r.band === band)!;
  return { score: Math.floor((row.min + row.max) / 2 + 0.5), min: row.min, max: row.max };
}

export function cefr(band: Band): string {
  return TOTAL_CONCORDANCE.find((r) => r.band === band)!.cefr;
}
