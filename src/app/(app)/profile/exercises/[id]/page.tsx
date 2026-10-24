import { ExerciseReview } from "@/components/exercises/ExerciseReview";

export default async function ExerciseReviewPage({ params, searchParams }: PageProps<"/profile/exercises/[id]">) {
  const { id } = await params;
  const { item, back } = await searchParams;
  const focus = Number(item);
  return <ExerciseReview id={id} focus={Number.isInteger(focus) && focus > 0 ? focus : undefined} backTo={typeof back === "string" ? back : undefined} />;
}
