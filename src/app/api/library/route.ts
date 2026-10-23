import { exerciseCounts, listCourses } from "@/engine/content/library";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => Response.json({ courses: listCourses(), exercises: exerciseCounts() }));
}
