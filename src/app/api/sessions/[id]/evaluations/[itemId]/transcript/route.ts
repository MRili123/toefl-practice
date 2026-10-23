import { confirmTranscript } from "@/ai/jobs";
import { EngineError } from "@/engine/errors";
import { handle, readJson } from "@/server/http";

/** The learner validates (or corrects) the speech-to-text transcript of a spoken answer; scoring then starts. */
export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/evaluations/[itemId]/transcript">) {
  return handle(async () => {
    const { id, itemId } = await ctx.params;
    const { text } = await readJson<{ text?: unknown }>(req);
    if (typeof text !== "string") throw new EngineError("invalid_transcript", "Send the transcript text.");
    if (!(await confirmTranscript(id, itemId, text))) {
      throw new EngineError("not_in_review", "This answer is not waiting for a transcript check.", 409);
    }
    return Response.json({ ok: true });
  });
}
