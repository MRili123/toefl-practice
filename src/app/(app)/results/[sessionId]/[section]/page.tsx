import { notFound } from "next/navigation";
import type { SectionId } from "@/engine/bank/types";
import { SectionDetail } from "@/components/results/SectionDetail";

const SECTIONS: SectionId[] = ["reading", "listening", "writing", "speaking"];

export default async function SectionResultsPage({ params, searchParams }: PageProps<"/results/[sessionId]/[section]">) {
  const { sessionId, section } = await params;
  const { item, back } = await searchParams;
  if (!SECTIONS.includes(section as SectionId)) notFound();
  return <SectionDetail sessionId={sessionId} sectionId={section as SectionId} focus={typeof item === "string" ? item : undefined} backTo={typeof back === "string" ? back : undefined} />;
}
