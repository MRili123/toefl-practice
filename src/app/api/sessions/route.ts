import type { SessionConfig } from "@/engine/session/types";
import { handle, readJson } from "@/server/http";
import { startSession } from "@/server/service";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ testNumber: number; config: Partial<SessionConfig> }>(req);
    const s = await startSession(Number(body.testNumber), body.config ?? {});
    return Response.json({ id: s.id }, { status: 201 });
  });
}
