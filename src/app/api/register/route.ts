import type { NextRequest } from "next/server";
import { EngineError } from "@/engine/errors";
import { handle, readJson } from "@/server/http";
import { saveQuestion, savedKeysForSession } from "@/server/service";

/** Saved questions of one test attempt, as { key: savedId }. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId) throw new EngineError("missing_session", "sessionId is required.");
    return Response.json(await savedKeysForSession(sessionId));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { sessionId, key } = await readJson<{ sessionId: string; key: string }>(req);
    if (typeof sessionId !== "string" || typeof key !== "string") throw new EngineError("invalid", "sessionId and key are required.");
    return Response.json(await saveQuestion(sessionId, key), { status: 201 });
  });
}
