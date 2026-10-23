import { handle } from "@/server/http";
import { deleteExercise, exerciseView } from "@/server/exercises";
import { exerciseQueue } from "@/server/exerciseQueue";

export async function GET(_req: Request, ctx: RouteContext<"/api/exercises/sessions/[id]">) {
  return handle(async () => {
    void exerciseQueue.recover();
    const { id } = await ctx.params;
    return Response.json(await exerciseView(id));
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/exercises/sessions/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await deleteExercise(id);
    return new Response(null, { status: 204 });
  });
}
