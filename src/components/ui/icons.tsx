import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconCheck = (p: P) => <svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>;
export const IconX = (p: P) => <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const IconDash = (p: P) => <svg {...base(p)}><path d="M6 12h12" /></svg>;
export const IconArrowRight = (p: P) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconArrowLeft = (p: P) => <svg {...base(p)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>;
export const IconClock = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const IconPlay = (p: P) => <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5.5v13l11-6.5z" /></svg>;
export const IconPause = (p: P) => <svg {...base(p)} fill="currentColor" stroke="none"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>;
export const IconReplay = (p: P) => <svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
export const IconVolume = (p: P) => <svg {...base(p)}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>;
export const IconMic = (p: P) => <svg {...base(p)}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const IconNote = (p: P) => <svg {...base(p)}><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h6" /></svg>;
export const IconChevronDown = (p: P) => <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>;
export const IconAlert = (p: P) => <svg {...base(p)}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></svg>;
export const IconChevronRight = (p: P) => <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>;
export const IconLayers = (p: P) => <svg {...base(p)}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></svg>;
export const IconCourse = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9.5 4.5 2.5-4.5 2.5z" /></svg>;
export const IconGrid = (p: P) => <svg {...base(p)}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></svg>;
export const IconUser = (p: P) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
export const IconBookmark = (p: P) => <svg {...base(p)}><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>;
export const IconBookmarkFilled = (p: P) => <svg {...base(p)} fill="currentColor"><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>;
export const IconDocument = (p: P) => <svg {...base(p)}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>;
export const IconHeadphones = (p: P) => <svg {...base(p)}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="7" rx="1.5" /><rect x="17" y="14" width="4" height="7" rx="1.5" /></svg>;
export const IconPen = (p: P) => <svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>;
export const IconSpelling = (p: P) => <svg {...base(p)}><path d="m4 17 4-11 4 11M5.5 13h5" /><path d="M14 17h6M14 13h6" /></svg>;
export const IconGrammar = (p: P) => <svg {...base(p)}><path d="M4 6h10M4 12h7M4 18h10" /><path d="m15 12 2 2 4-4" /></svg>;
export const IconTarget = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>;
export const IconTrash = (p: P) => <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const IconTrendUp = (p: P) => <svg {...base(p)}><path d="m4 16 6-6 4 4 6-6M15 8h5v5" /></svg>;
export const IconTrendDown = (p: P) => <svg {...base(p)}><path d="m4 8 6 6 4-4 6 6M15 16h5v-5" /></svg>;
