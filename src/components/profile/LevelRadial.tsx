import type { SectionId } from "@/engine/bank/types";
import type { LevelSummary } from "@/engine/profile/level";
import { cefr } from "@/engine/scoring/concordance";
import { formatBand, SECTION_LABEL } from "@/lib/format";

/** Quadrant layout: Reading top, Listening right, Speaking bottom, Writing left. */
const QUADRANTS: { skill: SectionId; center: number }[] = [
  { skill: "reading", center: -90 },
  { skill: "listening", center: 0 },
  { skill: "speaking", center: 90 },
  { skill: "writing", center: 180 },
];

const SIZE = 360;
const C = SIZE / 2;
const R = 118;
const STROKE = 14;
const SPAN = 74; // degrees per skill arc; the rest is spacing between quadrants

const polar = (deg: number, r = R) => {
  const rad = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
};

function arc(fromDeg: number, toDeg: number) {
  const a = polar(fromDeg);
  const b = polar(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${R} ${R} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** Radial level dashboard: overall level in the centre, one arc per skill filled to band / 6. */
export function LevelRadial({ level }: { level: LevelSummary }) {
  const overall = level.overall;
  const known = QUADRANTS.map((q) => level.skills[q.skill].level).filter((x): x is NonNullable<typeof x> => x !== null);
  const weakest = known.length > 1 ? Math.min(...known) : null;

  return (
    <figure className="relative mx-auto w-full max-w-[360px]" aria-label="Current level by skill">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" role="img" aria-labelledby="radial-desc">
        <desc id="radial-desc">
          {overall !== null ? `Current level ${formatBand(overall)}. ` : "Current level not established. "}
          {QUADRANTS.map((q) => `${SECTION_LABEL[q.skill]} ${level.skills[q.skill].level ?? "no data"}`).join(", ")}
        </desc>
        <circle cx={C} cy={C} r={R - 34} fill="var(--surface-2)" stroke="var(--line)" />
        {QUADRANTS.map((q) => {
          const from = q.center - SPAN / 2;
          const to = q.center + SPAN / 2;
          const band = level.skills[q.skill].level;
          const fill = band === null ? null : from + ((to - from) * band) / 6;
          const isWeak = band !== null && weakest !== null && band === weakest && known.some((k) => k > weakest);
          const label = polar(q.center, R + 42);
          return (
            <g key={q.skill}>
              <path d={arc(from, to)} fill="none" stroke="var(--line)" strokeWidth={STROKE} strokeLinecap="round" />
              {fill !== null && (
                <path d={arc(from, fill)} fill="none" stroke={isWeak ? "var(--warn)" : "var(--accent)"} strokeWidth={STROKE} strokeLinecap="round" />
              )}
              <text x={label.x} y={label.y - 8} textAnchor="middle" className="fill-[var(--ink-3)] text-[11px] font-semibold uppercase tracking-[0.08em]">
                {SECTION_LABEL[q.skill]}
              </text>
              <text x={label.x} y={label.y + 12} textAnchor="middle" className="fill-[var(--ink)] text-[17px] font-semibold tabular">
                {band === null ? "—" : formatBand(band)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {overall !== null ? (
          <>
            <span className="text-[44px] font-semibold leading-none tracking-tight tabular">{formatBand(overall)}</span>
            <span className="mt-1.5 text-sm font-medium text-ink-2">Current Level</span>
            <span className="text-xs text-ink-3">CEFR {cefr(overall)}</span>
          </>
        ) : (
          <>
            <span className="text-[15px] font-semibold">Not enough data</span>
            <span className="mt-1 max-w-[150px] text-xs leading-snug text-ink-3">Complete a practice test to establish your level.</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
