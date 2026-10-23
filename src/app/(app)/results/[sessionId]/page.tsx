import { ResultsDashboard } from "@/components/results/ResultsDashboard";

export default async function ResultsPage({ params }: PageProps<"/results/[sessionId]">) {
  const { sessionId } = await params;
  return <ResultsDashboard sessionId={sessionId} />;
}
