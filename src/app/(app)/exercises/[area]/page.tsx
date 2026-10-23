import { notFound } from "next/navigation";
import { ExerciseSetup } from "@/components/exercises/ExerciseSetup";
import { EXERCISE_AREAS, type ExerciseArea, GRAMMAR_CATEGORIES, type GrammarCategory } from "@/engine/exercises/types";

export default async function ExerciseSetupPage({ params, searchParams }: PageProps<"/exercises/[area]">) {
  const { area } = await params;
  const sp = await searchParams;
  if (!EXERCISE_AREAS.includes(area as ExerciseArea)) notFound();
  const focus = GRAMMAR_CATEGORIES.find((c) => c === sp.focus) as GrammarCategory | undefined;
  const mode = sp.mode === "repeat" || sp.mode === "interaction" ? sp.mode : undefined;
  return <ExerciseSetup key={`${area}-${focus ?? ""}-${mode ?? ""}`} area={area as ExerciseArea} focus={focus} mode={mode} />;
}
