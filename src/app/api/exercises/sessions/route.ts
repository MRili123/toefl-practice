import type { ExerciseConfig } from "@/engine/exercises/types";
import { handle, readJson } from "@/server/http";
import { startExercise } from "@/server/exercises";

export async function POST(req: Request) {
  return handle(async () => Response.json(await startExercise(await readJson<Partial<ExerciseConfig> & { retryOf?: string }>(req)), { status: 201 }));
}
