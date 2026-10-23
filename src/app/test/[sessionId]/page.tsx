import { ExamRunner } from "@/components/exam/ExamRunner";

export default async function TestPage({ params }: PageProps<"/test/[sessionId]">) {
  const { sessionId } = await params;
  return <ExamRunner sessionId={sessionId} />;
}
