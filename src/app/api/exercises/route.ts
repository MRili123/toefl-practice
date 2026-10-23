import { handle } from "@/server/http";
import { exercisesOverview } from "@/server/exercises";

export async function GET() {
  return handle(async () => Response.json(await exercisesOverview()));
}
