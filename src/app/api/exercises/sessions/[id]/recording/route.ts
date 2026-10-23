import { EngineError } from "@/engine/errors";
import { handle } from "@/server/http";
import { submitRecording } from "@/server/exercises";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav" };

export async function POST(req: Request, ctx: RouteContext<"/api/exercises/sessions/[id]/recording">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const itemId = String(form.get("itemId") ?? "");
    const durationMs = Math.max(0, Math.min(120_000, Math.round(Number(form.get("durationMs") ?? 0))));
    const file = form.get("file");
    if (!/^[\w-]{1,80}$/.test(itemId)) throw new EngineError("invalid_item", "Invalid item id.");
    if (!(file instanceof File) || file.size === 0) throw new EngineError("invalid_recording", "The recording is empty.");
    if (file.size > MAX_BYTES) throw new EngineError("invalid_recording", "The recording is too large.");
    const ext = EXT[file.type.split(";")[0]];
    if (!ext) throw new EngineError("invalid_recording", `Unsupported audio type ${file.type}.`);
    return Response.json(await submitRecording(id, itemId, Buffer.from(await file.arrayBuffer()), ext, durationMs));
  });
}
