import { EngineError } from "@/engine/errors";
import type { Answer } from "@/engine/evaluation/objective";
import { saveAnswer } from "@/engine/session/session";
import { handle, readJson } from "@/server/http";
import { mutateSession } from "@/server/service";

export async function PUT(req: Request, ctx: RouteContext<"/api/sessions/[id]/answer">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { itemId, answer } = await readJson<{ itemId: string; answer: Answer }>(req);
    // Recordings are only accepted through the upload endpoint.
    if (!answer || typeof itemId !== "string" || answer.kind === "recording") {
      throw new EngineError("invalid_answer", "Invalid answer payload.");
    }
    await mutateSession(id, (s, test, now) => saveAnswer(s, test, itemId, answer, now));
    return Response.json({ ok: true });
  });
}
