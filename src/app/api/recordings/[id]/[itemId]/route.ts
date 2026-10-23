import fs from "node:fs/promises";
import path from "node:path";
import { EngineError } from "@/engine/errors";
import { RECORDINGS_DIR } from "@/engine/paths";
import { sessions } from "@/engine/session/store";
import { handle } from "@/server/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/recordings/[id]/[itemId]">) {
  return handle(async () => {
    const { id, itemId } = await ctx.params;
    const s = await sessions.get(id);
    const answer = s?.answers[itemId];
    if (!s || answer?.kind !== "recording") throw new EngineError("recording_not_found", "Recording not found", 404);
    const abs = path.resolve(RECORDINGS_DIR, answer.file);
    if (!abs.startsWith(path.resolve(RECORDINGS_DIR) + path.sep)) throw new EngineError("recording_not_found", "Recording not found", 404);
    const data = await fs.readFile(abs);
    return new Response(data, {
      headers: { "Content-Type": answer.mimeType, "Content-Length": String(data.length), "Cache-Control": "private, max-age=3600" },
    });
  });
}
