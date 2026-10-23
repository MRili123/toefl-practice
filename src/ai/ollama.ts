import { z } from "zod";
import { KeyedMutex } from "@/engine/fsutil";
import { AI_CONFIG } from "./config";

// One model call at a time across exam and exercise evaluations (a local model is CPU/GPU bound).
const g = globalThis as unknown as { __toeflOllamaLane?: KeyedMutex };
const lane = (g.__toeflOllamaLane ??= new KeyedMutex());

export async function ollamaHealth(): Promise<{ ok: boolean; model: string; modelInstalled: boolean; error: string | null }> {
  const model = AI_CONFIG.ollamaModel;
  try {
    const res = await fetch(`${AI_CONFIG.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, model, modelInstalled: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { models?: { name: string }[] };
    const installed = (body.models ?? []).some((m) => m.name === model || m.name === `${model}:latest`);
    return { ok: true, model, modelInstalled: installed, error: installed ? null : `Model ${model} is not installed (ollama pull ${model})` };
  } catch (e) {
    return { ok: false, model, modelInstalled: false, error: `Ollama not reachable at ${AI_CONFIG.ollamaUrl}: ${(e as Error).message}` };
  }
}

/** Chat with a JSON-schema constrained reply, validated with zod (one retry on invalid output). */
export function ollamaJson<T extends z.ZodType>(
  schema: T,
  system: string,
  user: string,
  options: { temperature?: number } = {},
): Promise<z.infer<T>> {
  return lane.run("ollama", () => chatJson(schema, system, user, options.temperature ?? 0.2));
}

async function chatJson<T extends z.ZodType>(schema: T, system: string, user: string, temperature: number): Promise<z.infer<T>> {
  const format = z.toJSONSchema(schema) as Record<string, unknown>;
  delete format.$schema;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${AI_CONFIG.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(AI_CONFIG.ollamaTimeoutMs),
      body: JSON.stringify({
        model: AI_CONFIG.ollamaModel,
        stream: false,
        format,
        options: { temperature, num_ctx: 8192 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: attempt === 0 ? user : `${user}\n\nYour previous reply was invalid (${lastError}). Reply with valid JSON matching the schema.` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string } };
    try {
      return schema.parse(JSON.parse(body.message?.content ?? ""));
    } catch (e) {
      lastError = (e as Error).message.slice(0, 300);
    }
  }
  throw new Error(`Ollama returned invalid JSON twice: ${lastError}`);
}
