import { EngineError } from "@/engine/errors";
import { CEFR_LEVELS, type Cefr } from "@/engine/exercises/types";
import { handle, readJson } from "@/server/http";
import { seriesWritingLevels } from "@/server/seriesLevels";

/** The CEFR level of the corrected version of a writing response, or (with `level`) that text rewritten at another level. */
export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/evaluations/[itemId]/levels">) {
  return handle(async () => {
    const { id, itemId } = await ctx.params;
    const { level } = await readJson<{ level?: unknown }>(req);
    if (level !== undefined && level !== null && !CEFR_LEVELS.includes(level as Cefr)) throw new EngineError("invalid_level", "Unknown level.");
    return Response.json(await seriesWritingLevels(id, itemId, (level as Cefr | null | undefined) ?? undefined));
  });
}
