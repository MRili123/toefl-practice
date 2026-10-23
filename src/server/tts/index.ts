import "server-only";
import { localVoice } from "./localVoice";
import { type AudioFormat, type AudioKind, createPracticeAudio, readPracticeAudio } from "./practiceAudio";
import type { SpeechStyle } from "./types";

export { TtsError, type SpeechStyle } from "./types";

/**
 * The app never calls a paid text-to-speech service and holds no key. Item audio is the file saved in
 * practice_audios (generated once with ElevenLabs by scripts/generate-audio.ts); an item added later (a word from your
 * mistakes, an Interaction question, an item edited in /admin) is read once by the computer's own voice and
 * saved, so it is free, offline, and never generated twice.
 */
const inflight = new Map<string, Promise<Buffer>>();

export async function itemSpeech(
  kind: AudioKind,
  itemId: string,
  text: string,
  style: SpeechStyle,
): Promise<{ audio: Buffer; format: AudioFormat; cached: boolean }> {
  const saved = await readPracticeAudio(kind, itemId);
  if (saved) return { ...saved, cached: true };
  const key = `${kind}:${itemId}`;
  let job = inflight.get(key);
  if (!job) {
    job = createPracticeAudio(localVoice(), kind, itemId, text, style).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return { audio: await job, format: "wav", cached: false };
}
