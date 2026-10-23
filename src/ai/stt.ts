import { AI_CONFIG } from "./config";

export interface SttWord {
  w: string;
  start: number;
  end: number;
  p: number;
}

export interface SttResult {
  text: string;
  language: string;
  duration: number;
  words: SttWord[];
}

export async function sttHealth(): Promise<{ ok: boolean; ready: boolean; model: string | null; error: string | null }> {
  try {
    const res = await fetch(`${AI_CONFIG.sttUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const body = (await res.json()) as { ready: boolean; model: string; error: string | null };
    return { ok: true, ready: body.ready, model: body.model, error: body.error ?? (body.ready ? null : "Whisper model is loading") };
  } catch (e) {
    return { ok: false, ready: false, model: null, error: `Speech-to-text service not reachable at ${AI_CONFIG.sttUrl}: ${(e as Error).message}` };
  }
}

/**
 * `hint`: for Listen & Repeat, the sentence to repeat. It helps Whisper hear soft words correctly without
 * hiding real mistakes (checked on recordings with known errors); free speech is transcribed without one.
 */
export async function transcribe(filePath: string, hint?: string): Promise<SttResult> {
  const res = await fetch(`${AI_CONFIG.sttUrl}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(AI_CONFIG.sttTimeoutMs),
    body: JSON.stringify({ path: filePath, hint }),
  });
  const body = (await res.json()) as SttResult & { error?: string };
  if (!res.ok) throw new Error(`Speech-to-text failed: ${body.error ?? res.status}`);
  return body;
}
