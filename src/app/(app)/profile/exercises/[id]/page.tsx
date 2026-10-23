import { ExerciseReview } from "@/components/exercises/ExerciseReview";

export default async function ExerciseReviewPage({ params }: PageProps<"/profile/exercises/[id]">) {
  const { id } = await params;
  return <ExerciseReview id={id} />;
}
