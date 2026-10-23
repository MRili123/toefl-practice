import { EngineError } from "@/engine/errors";

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof EngineError) {
      return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
    }
    console.error(e);
    return Response.json({ error: { code: "internal", message: "Something went wrong on the server." } }, { status: 500 });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new EngineError("invalid_json", "Request body must be JSON.");
  }
}
