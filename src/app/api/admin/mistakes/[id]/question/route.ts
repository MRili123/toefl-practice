import { EngineError } from "@/engine/errors";
import { requestMistakeQuestion } from "@/server/admin/mistakes";
import { handle } from "@/server/http";

/** Generates (or retries) the AI grammar question of one writing mistake. */
export async function POST(_req: Request, ctx: RouteContext<"/api/admin/mistakes/[id]/question">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (!/^[0-9a-f]{16}$/.test(id)) throw new EngineError("mistake_not_found", "This mistake no longer exists.", 404);
    return Response.json(await requestMistakeQuestion(id));
  });
}
