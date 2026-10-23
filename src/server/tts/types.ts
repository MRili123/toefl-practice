import { EngineError } from "@/engine/errors";

export type SpeechStyle = "dictation" | "natural";

/** Swap providers without touching the exercise system: implement this and register it in index.ts. */
export interface TtsProvider {
  id: string;
  /** Identifies voice + model so cached audio is not reused across voices. */
  cacheKey: string;
  /** Audio format of `synthesize` (ElevenLabs: mp3; the computer's own voice: wav). */
  format: "mp3" | "wav";
  synthesize(text: string, style: SpeechStyle): Promise<Buffer>;
}

export class TtsError extends EngineError {}
