import type { SVGProps } from "react";
import type { SectionId } from "@/engine/bank/types";
import { IconDocument, IconGrammar, IconHeadphones, IconMic, IconPen, IconSpelling } from "./icons";

const ICONS = {
  reading: IconDocument, listening: IconHeadphones, writing: IconPen, speaking: IconMic, spelling: IconSpelling, grammar: IconGrammar,
} as const;

export function SectionIcon({ section, ...p }: { section: SectionId | "spelling" | "grammar" } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[section];
  return <Icon {...p} />;
}
