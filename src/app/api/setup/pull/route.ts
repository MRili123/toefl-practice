import { AI_CONFIG } from "@/ai/config";

/**
 * Downloads the AI model through the local Ollama service and streams its progress (NDJSON lines:
 * { status, total?, completed? }). Ollama resumes interrupted downloads by itself.
 */
export async function POST(req: Request) {
  let res: Response;
  try {
    res = await fetch(`${AI_CONFIG.ollamaUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_CONFIG.ollamaModel, stream: true }),
      signal: req.signal,
    });
  } catch {
    return Response.json({ error: { code: "ollama_unreachable", message: "Ollama is not running. Install or start Ollama, then try again." } }, { status: 503 });
  }
  if (!res.ok || !res.body) {
    return Response.json({ error: { code: "pull_failed", message: `The model download could not start (HTTP ${res.status}).` } }, { status: 502 });
  }
  return new Response(res.body, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
