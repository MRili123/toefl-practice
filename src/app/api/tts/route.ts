import { EngineError } from "@/engine/errors";
import { handle, readJson } from "@/server/http";
import { speakableText } from "@/server/exercises";
import { itemSpeech } from "@/server/tts";
import { AUDIO_TYPE } from "@/server/tts/practiceAudio";

/**
 * Audio for an exercise item. The browser sends only the session and item ids; the server looks up the text,
 * so the answer (a word to spell, a sentence to repeat) never reaches the client.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { sessionId, itemId } = await readJson<{ sessionId?: string; itemId?: string }>(req);
    if (typeof sessionId !== "string" || typeof itemId !== "string" || !/^[\w-]{1,80}$/.test(itemId)) {
      throw new EngineError("invalid_request", "sessionId and itemId are required.");
    }
    const { text, style, kind } = await speakableText(sessionId, itemId);
    const { audio, format, cached } = await itemSpeech(kind, itemId, text, style);
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": AUDIO_TYPE[format],
        "Content-Length": String(audio.length),
        "Cache-Control": "private, max-age=86400",
        "X-Audio-Cache": cached ? "hit" : "miss",
      },
    });
  });
}
