import { evaluationQueue } from "@/ai/jobs";
import { EngineError } from "@/engine/errors";
import { sessions } from "@/engine/session/store";
import { handle } from "@/server/http";

/** Re-runs a failed (or finished) evaluation, e.g. after starting Ollama or the speech-to-text service. */
export async function POST(_req: Request, ctx: RouteContext<"/api/sessions/[id]/evaluations/[itemId]">) {
  return handle(async () => {
    const { id, itemId } = await ctx.params;
    await sessions.update(id, (s) => {
      const rec = s.evaluations[itemId];
      if (!rec) throw new EngineError("evaluation_not_found", "No evaluation for this item.", 404);
      if (rec.status === "running" || rec.status === "queued" || rec.status === "review") return; // a transcript awaiting review is validated, not retried
      Object.assign(rec, { status: "queued", stage: null, error: null, updatedAt: Date.now() });
    });
    evaluationQueue.enqueue(id, [itemId]);
    return Response.json({ ok: true });
  });
}
