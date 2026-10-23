import { SavedQuestionView } from "@/components/profile/SavedQuestionView";

export default async function SavedQuestionPage({ params }: PageProps<"/profile/register/[id]">) {
  const { id } = await params;
  return <SavedQuestionView id={id} />;
}
