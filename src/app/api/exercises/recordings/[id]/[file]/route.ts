import fs from "node:fs/promises";
import path from "node:path";
import { EngineError } from "@/engine/errors";
import { EXERCISE_RECORDINGS_DIR, exerciseSessions } from "@/engine/exercises/store";
import { handle } from "@/server/http";

const MIME: Record<string, string> = { webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/mp4", wav: "audio/wav" };

export async function GET(_req: Request, ctx: RouteContext<"/api/exercises/recordings/[id]/[file]">) {
  return handle(async () => {
    const { id, file } = await ctx.params;
    const s = await exerciseSessions.get(id);
    if (!s || !s.attempts.some((a) => a.answer === file) || !/^[\w-]+\.(webm|ogg|m4a|wav)$/.test(file)) {
      throw new EngineError("recording_not_found", "Recording not found", 404);
    }
    const data = await fs.readFile(path.join(EXERCISE_RECORDINGS_DIR, id, file));
    return new Response(data, {
      headers: { "Content-Type": MIME[file.split(".").pop()!], "Content-Length": String(data.length), "Cache-Control": "private, max-age=3600" },
    });
  });
}
