import { EngineError } from "@/engine/errors";
import { handle } from "@/server/http";
import { exportBackup, importBackup, parseBackup, summarizeBackup } from "@/server/backup";

/** Download all progress as one file. */
export async function GET() {
  return handle(async () => {
    const file = await exportBackup();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="toefl-progress-${date}.toeflbackup"`,
        "Content-Length": String(file.length),
      },
    });
  });
}

const MAX_BYTES = 500 * 1024 * 1024;

/** Import a backup file. `?preview=1` only summarizes what the file contains. */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new EngineError("invalid_backup", "Choose a backup file.");
    if (file.size > MAX_BYTES) throw new EngineError("invalid_backup", "The backup file is too large.");
    const backup = parseBackup(Buffer.from(await file.arrayBuffer()));
    const preview = new URL(req.url).searchParams.get("preview") === "1";
    return Response.json(preview ? await summarizeBackup(backup) : await importBackup(backup));
  });
}
