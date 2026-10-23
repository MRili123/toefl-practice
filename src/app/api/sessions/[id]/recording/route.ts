import fs from "node:fs/promises";
import path from "node:path";
import { EngineError } from "@/engine/errors";
import { RECORDINGS_DIR } from "@/engine/paths";
import { saveAnswer, submitTask } from "@/engine/session/session";
import { buildView } from "@/engine/session/view";
import { loadTest } from "@/engine/bank/loader";
import { handle } from "@/server/http";
import { mutateSession } from "@/server/service";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav" };

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/recording">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const itemId = String(form.get("itemId") ?? "");
    const durationMs = Math.max(0, Math.round(Number(form.get("durationMs") ?? 0)));
    const file = form.get("file");
    if (!/^[\w-]{1,80}$/.test(itemId)) throw new EngineError("invalid_item", "Invalid item id.");
    if (!(file instanceof File) || file.size === 0) throw new EngineError("invalid_recording", "The recording is empty.");
    if (file.size > MAX_BYTES) throw new EngineError("invalid_recording", "The recording is too large.");
    const mime = file.type.split(";")[0];
    const ext = EXT[mime];
    if (!ext) throw new EngineError("invalid_recording", `Unsupported audio type ${file.type}.`);

    const rel = path.join(id, `${itemId}.${ext}`);
    const abs = path.join(RECORDINGS_DIR, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));

    try {
      const session = await mutateSession(id, (s, test, now) => {
        const ref = test.sections.speaking.modules.flatMap((m) => m.tasks).find((t) => t.id === itemId);
        if (!ref || (ref.kind !== "listen_and_repeat" && ref.kind !== "interview")) {
          throw new EngineError("invalid_item", "Not a speaking task.");
        }
        const capMs = (ref.responseSeconds + 3) * 1000;
        saveAnswer(s, test, itemId, { kind: "recording", file: rel, mimeType: mime, durationMs: Math.min(durationMs, capMs) }, now);
        submitTask(s, test, itemId, true, now);
      });
      return Response.json(buildView(session, loadTest(session.testNumber), Date.now()));
    } catch (e) {
      await fs.rm(abs, { force: true });
      throw e;
    }
  });
}
