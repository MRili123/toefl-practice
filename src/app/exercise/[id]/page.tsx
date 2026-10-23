import { ExercisePlayer } from "@/components/exercises/player/ExercisePlayer";

export default async function ExercisePage({ params }: PageProps<"/exercise/[id]">) {
  const { id } = await params;
  return <ExercisePlayer id={id} />;
}
