import { handle } from "@/server/http";
import { removeSaved, savedReview } from "@/server/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/register/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json(await savedReview(id));
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/register/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await removeSaved(id);
    return new Response(null, { status: 204 });
  });
}
