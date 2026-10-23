// Used only by scripts/generate-audio.ts to create the bundled audio once. The app itself never calls ElevenLabs
// and never stores a key: the key is passed to the script when you run it.
import { type SpeechStyle, TtsError, type TtsProvider } from "./types";

const API = "https://api.elevenlabs.io/v1";
/** "Rachel" — a clear, neutral US English premade voice. Override with TTS_VOICE_ID. */
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
/** Flash v2.5 costs half the credits per character of the multilingual models. */
const DEFAULT_MODEL = "eleven_flash_v2_5";

async function failure(res: Response): Promise<TtsError> {
  let detail = "";
  try {
    const body = (await res.json()) as { detail?: { status?: string; message?: string; code?: string; type?: string } | string };
    detail = typeof body.detail === "string" ? body.detail : `${body.detail?.type ?? ""} ${body.detail?.code ?? ""} ${body.detail?.status ?? ""} ${body.detail?.message ?? ""}`;
  } catch {
    /* no JSON body */
  }
  if (/api_key_id_used_as_api_key/.test(detail)) {
    return new TtsError("tts_auth", "The saved ElevenLabs value is a key ID, not the secret key. Create or rotate a key in ElevenLabs and use the value that starts with “sk_”.", 503);
  }
  if (/authentication_error|invalid_api_key/.test(detail)) {
    return new TtsError("tts_auth", "The text-to-speech key was rejected. Check the ElevenLabs key you passed to the script.", 503);
  }
  if (res.status === 401) {
    return /quota/i.test(detail)
      ? new TtsError("tts_quota", "The text-to-speech quota is used up for this month. Audio that was already generated still plays.", 503)
      : new TtsError("tts_auth", "The text-to-speech key was rejected. Check the ElevenLabs key you passed to the script.", 503);
  }
  if (res.status === 429) return new TtsError("tts_busy", "The text-to-speech service is busy. Try again in a moment.", 503);
  if (res.status === 404) return new TtsError("tts_voice", "The configured voice was not found. Check TTS_VOICE_ID.", 503);
  // Never echo the request (it carries the key); the status is enough.
  return new TtsError("tts_failed", `Audio generation failed (HTTP ${res.status}).`, 502);
}

export function elevenLabs(key: string): TtsProvider {
  const voice = process.env.TTS_VOICE_ID || DEFAULT_VOICE;
  const model = process.env.TTS_MODEL_ID || DEFAULT_MODEL;
  return {
    id: "elevenlabs",
    cacheKey: `elevenlabs:${voice}:${model}`,
    format: "mp3",
    async synthesize(text: string, style: SpeechStyle): Promise<Buffer> {
      let res: Response;
      try {
        res = await fetch(`${API}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            text,
            model_id: model,
            // Dictation is a little slower and steadier so every sound is clear.
            voice_settings: style === "dictation"
              ? { stability: 0.75, similarity_boost: 0.75, speed: 0.9 }
              : { stability: 0.6, similarity_boost: 0.75, speed: 1 },
          }),
        });
      } catch {
        throw new TtsError("tts_unreachable", "The text-to-speech service could not be reached. Check your internet connection.", 503);
      }
      if (!res.ok) throw await failure(res);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
