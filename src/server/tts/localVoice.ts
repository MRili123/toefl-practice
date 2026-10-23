// Server-side only. Free, offline neural speech (Kokoro) served by the local speech service — no account or key.
import { AI_CONFIG } from "@/ai/config";
import { type SpeechStyle, TtsError, type TtsProvider } from "./types";

async function synthesizeLocal(text: string, style: SpeechStyle): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(`${AI_CONFIG.sttUrl}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ text, style }),
    });
  } catch {
    throw new TtsError("tts_local_unavailable", "The audio voice is part of the speech service, which is not running. Restart the app and try again.", 503);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new TtsError("tts_local_failed", `The audio could not be created (${(body.error ?? res.status).toString().slice(0, 140)}).`, 503);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** The Kokoro neural voice of the local speech service (offline, free). Produces WAV. */
export function localVoice(): TtsProvider {
  return { id: "kokoro", cacheKey: "kokoro:af_heart", format: "wav", synthesize: synthesizeLocal };
}
