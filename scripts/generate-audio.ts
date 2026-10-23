/**
 * Pre-generates the exercise audio into practice_audios/ (spelling words and sentences — including the words added
 * to Spelling practice from your mistakes — and Listen & Repeat sentences). An item that only has audio from the
 * computer's offline voice (.wav) gets ElevenLabs audio, which then replaces it.
 * Existing files are skipped, so it can be re-run safely. Usage: npm run generate-audio [-- --only=spelling|repeat]
 * The ElevenLabs key is given only when you run it (it is never stored in the app):
 *   PowerShell:  $env:ELEVENLABS_API_KEY = "sk_..."; npm run generate-audio
 *   bash:        ELEVENLABS_API_KEY=sk_... npm run generate-audio
 */
import fs from "node:fs";
import { exerciseBank } from "../src/engine/exercises/bank";
import { learnerMemory } from "../src/engine/exercises/store";
import { elevenLabs } from "../src/server/tts/elevenlabs";
import { audioFile, createPracticeAudio } from "../src/server/tts/practiceAudio";

async function main() {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    console.error('Set the key for this run only: $env:ELEVENLABS_API_KEY = "sk_..."; npm run generate-audio');
    process.exit(1);
  }
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const bank = exerciseBank();
  const jobs = [
    ...(only && only !== "spelling"
      ? []
      : [...bank.spelling, ...(await learnerMemory.get()).generated.spelling].map((s) => ({ kind: "spelling" as const, id: s.id, text: s.text, style: "dictation" as const }))),
    ...(only && only !== "repeat" ? [] : bank.repeat.map((r) => ({ kind: "repeat" as const, id: r.id, text: r.text, style: "natural" as const }))),
  ];
  const todo = jobs.filter((j) => !fs.existsSync(audioFile(j.kind, j.id)));
  const chars = todo.reduce((n, j) => n + j.text.length, 0);
  console.log(`${jobs.length} items, ${todo.length} to generate (${chars} characters).`);
  const provider = elevenLabs(key);
  let done = 0;
  let failed = 0;
  const queue = [...todo];
  const worker = async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      for (let attempt = 1; ; attempt++) {
        try {
          await createPracticeAudio(provider, j.kind, j.id, j.text, j.style);
          fs.rmSync(audioFile(j.kind, j.id, undefined, "wav"), { force: true }); // the offline-voice version is replaced
          done++;
          if (done % 25 === 0) console.log(`  ${done}/${todo.length}`);
          break;
        } catch (e) {
          const msg = (e as Error).message;
          if (/quota|key/i.test(msg)) throw e;
          if (attempt >= 3) {
            failed++;
            console.error(`  failed ${j.id}: ${msg}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log(`Done: ${done} generated, ${failed} failed, ${jobs.length - todo.length} already existed.`);
}

main().catch((e) => {
  console.error("Stopped:", (e as Error).message);
  process.exit(1);
});
