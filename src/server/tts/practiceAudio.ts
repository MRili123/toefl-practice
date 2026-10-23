// Server-side only. Exercise audio lives in practice_audios/<kind>/<itemId>.mp3 (pre-generated with ElevenLabs by
// `npm run generate-audio`) or <itemId>.wav (made later with the computer's own voice, for items added afterwards).
import fs from "node:fs/promises";
import path from "node:path";
import type { SpeechStyle, TtsProvider } from "./types";

export const PRACTICE_AUDIO_DIR = path.resolve(process.env.PRACTICE_AUDIO_DIR ?? path.join(process.cwd(), "practice_audios"));
/** Where audio created later is saved (the desktop app's bundled folder is read-only). */
export const PRACTICE_AUDIO_WRITE_DIR = path.resolve(process.env.PRACTICE_AUDIO_WRITE_DIR ?? PRACTICE_AUDIO_DIR);
export type AudioKind = "spelling" | "repeat" | "speaking";

const SAFE_ID = /^[\w-]{1,80}$/;
export type AudioFormat = "mp3" | "wav";
export const AUDIO_TYPE: Record<AudioFormat, string> = { mp3: "audio/mpeg", wav: "audio/wav" };

export const audioFile = (kind: AudioKind, itemId: string, root = PRACTICE_AUDIO_WRITE_DIR, format: AudioFormat = "mp3") => {
  if (!SAFE_ID.test(itemId)) throw new Error("invalid item id");
  return path.join(root, kind, `${itemId}.${format}`);
};

/** The saved audio of an item, if any (the ElevenLabs mp3 first, then a wav made with the computer's voice). */
export async function readPracticeAudio(kind: AudioKind, itemId: string): Promise<{ audio: Buffer; format: AudioFormat } | null> {
  for (const format of ["mp3", "wav"] as const) {
    for (const root of new Set([PRACTICE_AUDIO_DIR, PRACTICE_AUDIO_WRITE_DIR])) {
      try {
        return { audio: await fs.readFile(audioFile(kind, itemId, root, format)), format };
      } catch {
        /* try the next file */
      }
    }
  }
  return null;
}

/** Synthesizes and stores one item's audio (used by the generator script and for items created later, e.g. from writing). */
export async function createPracticeAudio(p: TtsProvider, kind: AudioKind, itemId: string, text: string, style: SpeechStyle): Promise<Buffer> {
  const audio = await p.synthesize(text, style);
  const file = audioFile(kind, itemId, PRACTICE_AUDIO_WRITE_DIR, p.format);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, audio);
  return audio;
}
