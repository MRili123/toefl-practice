import { buildResults } from "@/engine/results/results";
import { handle } from "@/server/http";
import { readSession } from "@/server/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]/results">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { session, test } = await readSession(id);
    return Response.json(buildResults(session, test));
  });
}
