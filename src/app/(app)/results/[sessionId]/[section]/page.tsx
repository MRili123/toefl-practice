import { notFound } from "next/navigation";
import type { SectionId } from "@/engine/bank/types";
import { SectionDetail } from "@/components/results/SectionDetail";

const SECTIONS: SectionId[] = ["reading", "listening", "writing", "speaking"];

export default async function SectionResultsPage({ params }: PageProps<"/results/[sessionId]/[section]">) {
  const { sessionId, section } = await params;
  if (!SECTIONS.includes(section as SectionId)) notFound();
  return <SectionDetail sessionId={sessionId} sectionId={section as SectionId} />;
}
