import { buildView } from "@/engine/session/view";
import { handle } from "@/server/http";
import { deleteSession, readSession } from "@/server/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { session, test } = await readSession(id);
    return Response.json(buildView(session, test, Date.now()));
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await deleteSession(id);
    return new Response(null, { status: 204 });
  });
}
