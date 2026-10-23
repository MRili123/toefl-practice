/**
 * Builds the question bank from the toefl_scraper output.
 *   raw data : <scraper>/toefl_data/raw/<section>_test<N>.json
 *   media    : <scraper>/{listening,speaking}/{audios,pics}/test-<N>/*
 * Writes data/bank/test-NN.json + data/bank/index.json and copies media to public/media/.
 *
 * Usage: npm run import-bank   (TOEFL_SCRAPER_DIR overrides the scraper location)
 */
import fs from "node:fs";
import path from "node:path";
import type {
  AcademicPassageTask, BankTest, BuildSentenceTask, ChooseResponseTask, CompleteTheWordsTask,
  DailyLifeTask, DiscussionTask, EmailTask, InterviewTask, ListenRepeatTask, ListeningSetTask,
  McqItem, Module, SceneRegion, Section, Skill, Task, TestMeta,
} from "../src/engine/bank/types";
import { moduleItems } from "../src/engine/bank/items";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRAPER = path.resolve(process.env.TOEFL_SCRAPER_DIR ?? path.join(ROOT, "..", "toefl_scraper"));
const RAW = path.join(SCRAPER, "toefl_data", "raw");
const OUT_BANK = path.join(ROOT, "data", "bank");
const CACHE = path.join(ROOT, "data", "cache");
const PUBLIC_MEDIA = path.join(ROOT, "public", "media");
const SITE = "https://www.toeflmocktests.com";
const TESTS = Array.from({ length: 20 }, (_, i) => i + 1);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const pad = (n: number) => String(n).padStart(2, "0");
const basename = (u: string) => u.split("/").pop()!;
const warnings: string[] = [];
const warn = (m: string) => warnings.push(m);

function readRaw(section: string, n: number): Raw {
  const file = path.join(RAW, `${section}_test${n}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return Object.values(data).find((v) => v && typeof v === "object")!;
}

function copyMedia(src: string, destRel: string): string | null {
  if (!fs.existsSync(src)) {
    warn(`missing media ${src}`);
    return null;
  }
  const dest = path.join(PUBLIC_MEDIA, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(src).size) fs.copyFileSync(src, dest);
  return "/media/" + destRel.replaceAll("\\", "/");
}

async function fetchCached(urlPath: string, cacheRel: string): Promise<Buffer | null> {
  const cached = path.join(CACHE, cacheRel);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const res = await fetch(SITE + urlPath, { headers: { "User-Agent": "Mozilla/5.0 (toefl-practice importer)" } });
  if (!res.ok) {
    warn(`fetch ${urlPath} -> ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, buf);
  return buf;
}

const imageCache = new Map<string, string | null>();
async function sharedImage(raw: string | undefined, kind: "listening" | "writing"): Promise<string | null> {
  if (!raw) return null;
  const urlPath = raw.startsWith("/") ? raw : `/img/${kind}/${raw}`;
  if (imageCache.has(urlPath)) return imageCache.get(urlPath)!;
  const rel = urlPath.replace(/^\//, "");
  const dest = path.join(PUBLIC_MEDIA, rel);
  let result: string | null = "/media/" + rel;
  if (!fs.existsSync(dest)) {
    const buf = await fetchCached(urlPath, rel);
    if (buf) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    } else result = null;
  }
  imageCache.set(urlPath, result);
  return result;
}

/* ---------- skills ---------- */

const AP_SKILL: Record<string, Skill> = {
  factual: "Detail",
  vocabulary: "Vocabulary",
  inference: "Inference",
  paragraph_relationships: "Organization",
  important_idea: "Main idea",
};

export function inferSkill(stem: string): Skill {
  const s = stem.toLowerCase();
  if (/closest in meaning|the word .* (refers|means)/.test(s)) return "Vocabulary";
  if (/purpose of|why does the (speaker|writer|professor|author|woman|man) mention|in order to/.test(s)) return "Purpose";
  if (/why .*(receiv|sent|send|writ|post)\w* .*(email|message|notice|announcement)/.test(s)) return "Purpose";
  if (/(mainly|primarily) (about|discuss|explain|describ|focus)|main (topic|idea|point|purpose)|best summar|focus of/.test(s)) return "Main idea";
  if (/\bnext\b/.test(s)) return "Prediction";
  if (/infer|impl(y|ied|ies)|suggest|most likely|probably|conclude/.test(s)) return "Inference";
  if (/mean by|what does .* mean|what is meant/.test(s)) return "Context";
  return "Detail";
}

/* ---------- converters ---------- */

function mcq(q: Raw, skill: Skill): McqItem {
  const correct = q.options.filter((o: Raw) => o.correct);
  if (correct.length !== 1) warn(`question ${q.id} has ${correct.length} correct options`);
  return {
    id: q.id,
    stem: q.stem,
    highlightText: q.highlightText ?? null,
    options: q.options.map((o: Raw) => ({ id: String(o.id), text: o.text })),
    correctOptionId: String(correct[0]?.id ?? ""),
    explanation: q.explanation ?? "",
    skill,
  };
}

function ctw(raw: Raw): CompleteTheWordsTask {
  const parts: string[] = raw.paragraph.split(/_{2,}/);
  const words = [...raw.words].sort((a: Raw, b: Raw) => a.position - b.position);
  if (parts.length !== words.length + 1) warn(`ctw ${raw.id}: ${parts.length - 1} gaps vs ${words.length} words`);
  const segments = parts.map((seg, i) => {
    const w = words[i];
    if (!w) return seg;
    if (!seg.endsWith(w.displayText)) {
      warn(`ctw ${raw.id}: segment does not end with prefix "${w.displayText}"`);
      return seg;
    }
    return seg.slice(0, seg.length - w.displayText.length);
  });
  return {
    kind: "complete_the_words",
    id: raw.id,
    segments,
    blanks: words.map((w: Raw) => ({ id: w.id, prefix: w.displayText, answer: w.answer, fullWord: w.fullWord })),
  };
}

function dailyLife(raw: Raw): DailyLifeTask {
  const isEmail = raw.textType === "email";
  return {
    kind: "daily_life",
    id: raw.id,
    textType: raw.textType,
    title: raw.title ?? null,
    email: isEmail
      ? {
          to: raw.to ?? "",
          from: raw.from ?? "",
          date: raw.date ?? "",
          subject: raw.subject ?? "",
          body: raw.body ?? "",
          signoff: raw.signoff ?? "",
          senderName: raw.senderName ?? "",
        }
      : null,
    messages: raw.messages ?? null,
    text: raw.text ?? null,
    questions: raw.questions.map((q: Raw) => mcq(q, inferSkill(q.stem))),
  };
}

function academicPassage(raw: Raw): AcademicPassageTask {
  return {
    kind: "academic_passage",
    id: raw.id,
    title: raw.title,
    paragraphs: String(raw.text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    questions: raw.questions.map((q: Raw) => mcq(q, AP_SKILL[q.type] ?? inferSkill(q.stem))),
  };
}

function readingModule(raw: Raw, id: string, stage: 1 | 2, difficulty: Module["difficulty"]): Module {
  return {
    id,
    stage,
    difficulty,
    introAudio: null,
    tasks: [
      ...raw.completeTheWords.map(ctw),
      ...raw.dailyLife.map(dailyLife),
      ...raw.academicPassages.map(academicPassage),
    ],
  };
}

async function listeningModule(raw: Raw, n: number, id: string, stage: 1 | 2, difficulty: Module["difficulty"]): Promise<Module> {
  const audioDir = path.join(SCRAPER, "listening", "audios", `test-${n}`);
  const audio = (u: string) => copyMedia(path.join(audioDir, basename(u)), `t${pad(n)}/listening/${basename(u)}`) ?? "";
  const tasks: Task[] = [];
  for (const cr of raw.chooseResponse ?? []) {
    const t: ChooseResponseTask = {
      kind: "choose_response",
      id: cr.id,
      audio: audio(cr.audio),
      image: await sharedImage(cr.image, "listening"),
      transcript: cr.transcript,
      questions: [mcq(cr, "Response choice")],
    };
    tasks.push(t);
  }
  const sets: [string, ListeningSetTask["kind"]][] = [
    ["conversations", "conversation"],
    ["announcements", "announcement"],
    ["academicTalks", "academic_talk"],
  ];
  for (const [key, kind] of sets) {
    for (const s of raw[key] ?? []) {
      tasks.push({
        kind,
        id: s.id,
        title: s.title,
        audio: audio(s.audio),
        image: await sharedImage(s.image, "listening"),
        transcript: s.transcript,
        questions: s.questions.map((q: Raw) => mcq(q, inferSkill(q.stem))),
      });
    }
  }
  return { id, stage, difficulty, introAudio: raw.introAudio ? audio(raw.introAudio) : null, tasks };
}

async function writingSection(raw: Raw): Promise<Section> {
  const tasks: Task[] = [];
  for (const b of raw.buildASentence) {
    const t: BuildSentenceTask = {
      kind: "build_a_sentence",
      id: b.id,
      context: b.context,
      speakerName: b.speakerName,
      speakerImage: await sharedImage(b.speakerImage, "writing"),
      speakerLine: b.speakerLine,
      respondentName: b.respondentName,
      respondentImage: await sharedImage(b.respondentImage, "writing"),
      answerPrefix: b.answerPrefix ?? "",
      answerSuffix: b.answerSuffix ?? "",
      numBlanks: b.numBlanks,
      chunks: b.wordChunks,
      correctOrder: b.correctOrder,
      acceptedOrders: b.acceptedOrders ?? [],
      correctSentence: b.correctSentence,
      explanation: b.explanation,
      grammarPattern: b.grammarPattern,
    };
    tasks.push(t);
  }
  const e = raw.writeAnEmail;
  const email: EmailTask = {
    kind: "write_email",
    id: e.id,
    directions: e.directions,
    situation: e.situation,
    taskInstructions: e.taskInstructions,
    requiredPoints: e.requiredPoints,
    recipient: e.recipient,
    subject: e.subject,
    targetWords: e.targetWords,
    rubric: e.scoringRubric,
  };
  const d = raw.academicDiscussion;
  const discussion: DiscussionTask = {
    kind: "academic_discussion",
    id: d.id,
    topicIntro: d.topicIntro,
    directions: d.directions,
    professor: {
      name: d.professorPrompt.name,
      image: await sharedImage(d.professorPrompt.image, "writing"),
      text: d.professorPrompt.text,
    },
    students: await Promise.all(
      d.studentResponses.map(async (s: Raw) => ({ name: s.name, image: await sharedImage(s.image, "writing"), text: s.text })),
    ),
    targetWords: d.targetWords,
    rubric: d.scoringRubric,
  };
  tasks.push(email, discussion);
  return { id: "writing", modules: [{ id: "w-m1", stage: 1, difficulty: "medium", introAudio: null, tasks }] };
}

let partMapping: Raw = null;

async function speakingSection(raw: Raw, n: number): Promise<Section> {
  const mediaDir = path.join(SCRAPER, "speaking", "audios", `test-${n}`);
  const picDir = path.join(SCRAPER, "speaking", "pics", `test-${n}`);
  const media = (u: string) => copyMedia(path.join(mediaDir, basename(u)), `t${pad(n)}/speaking/${basename(u)}`) ?? "";

  if (!partMapping) {
    const buf = await fetchCached("/assets/images/speaking/part-mapping.json", "speaking/part-mapping.json");
    partMapping = buf ? JSON.parse(buf.toString("utf8")) : {};
  }
  let sceneSize: { width: number; height: number } | null = null;
  let partRegions: (SceneRegion | null)[] = [];
  const traceBuf = raw.sceneTrace ? await fetchCached(raw.sceneTrace, `speaking/test-${n}.trace.json`) : null;
  if (traceBuf) {
    const trace = JSON.parse(traceBuf.toString("utf8"));
    sceneSize = { width: trace.width, height: trace.height };
    const map: (number | null)[] = partMapping[`test-${n}`]?.partToRegionIndex ?? [];
    partRegions = (raw.sceneParts as string[]).map((_, p) => {
      const r = map[p];
      const part = r == null ? null : trace.parts[r];
      return part ? { path: part.path, bbox: part.bbox } : null;
    });
  }

  const tasks: Task[] = [];
  for (const it of raw.listenAndRepeat) {
    const t: ListenRepeatTask = {
      kind: "listen_and_repeat",
      id: it.id,
      sentence: it.sentence,
      audio: media(it.audioSrc),
      responseSeconds: it.recordingTime,
      partIndex: it.partIndex,
      rubric: it.scoringCriteria,
    };
    tasks.push(t);
  }
  for (const q of raw.interview.questions) {
    const t: InterviewTask = {
      kind: "interview",
      id: q.id,
      prompt: q.prompt,
      video: media(q.videoSrc),
      questionType: q.questionType,
      prepSeconds: q.prepTime ?? 0,
      responseSeconds: q.responseTime,
      rubric: q.scoringRubric,
    };
    tasks.push(t);
  }
  return {
    id: "speaking",
    modules: [{ id: "s-m1", stage: 1, difficulty: "medium", introAudio: null, tasks }],
    speaking: {
      sceneImage: raw.sceneImage
        ? copyMedia(path.join(picDir, basename(raw.sceneImage)), `t${pad(n)}/speaking/${basename(raw.sceneImage)}`)
        : null,
      sceneTheme: raw.sceneTheme ?? "",
      sceneSize,
      partRegions,
      interview: {
        topic: raw.interview.topic,
        interviewerName: raw.interview.interviewerName,
        scenario: raw.interview.scenario,
        introVideo: raw.interview.introVideo ? media(raw.interview.introVideo) : null,
      },
    },
  };
}

/* ---------- readability ---------- */

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

function fleschKincaid(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / Math.max(1, words.length)) - 15.59;
}

function readingText(section: Section): string {
  return section.modules
    .flatMap((m) => m.tasks)
    .map((t) => (t.kind === "academic_passage" ? t.paragraphs.join(" ") : ""))
    .join(" ");
}

/* ---------- main ---------- */

async function buildTest(n: number): Promise<BankTest> {
  const r = readRaw("reading", n);
  const reading: Section = {
    id: "reading",
    modules: [
      readingModule(r, "r-m1", 1, "medium"),
      readingModule(r.module2Hard, "r-m2-hard", 2, "hard"),
      readingModule(r.module2Easy, "r-m2-easy", 2, "easy"),
    ],
  };
  const l = readRaw("listening", n);
  const listening: Section = {
    id: "listening",
    modules: [
      await listeningModule(l.modules[0], n, "l-m1", 1, "medium"),
      await listeningModule(l.modules[1], n, "l-m2-hard", 2, "hard"),
      await listeningModule(l.module2Easy, n, "l-m2-easy", 2, "easy"),
    ],
  };
  const writing = await writingSection(readRaw("writing", n));
  const speaking = await speakingSection(readRaw("speaking", n), n);

  // ids must be unique across the whole test: answers are keyed by item id
  const seen = new Set<string>();
  for (const s of [reading, listening, writing, speaking]) {
    for (const m of s.modules) {
      for (const it of moduleItems(m)) {
        if (seen.has(it.id)) warn(`test ${n}: duplicate item id ${it.id}`);
        seen.add(it.id);
      }
    }
  }
  const meta: TestMeta = { number: n, estDifficulty: "Standard", readabilityGrade: fleschKincaid(readingText(reading)) };
  return { meta, sections: { reading, listening, writing, speaking } };
}

async function main() {
  if (!fs.existsSync(RAW)) throw new Error(`Scraper raw data not found at ${RAW} (set TOEFL_SCRAPER_DIR)`);
  fs.mkdirSync(OUT_BANK, { recursive: true });

  const tests: BankTest[] = [];
  for (const n of TESTS) {
    process.stdout.write(`test ${n}… `);
    tests.push(await buildTest(n));
    console.log("ok");
  }

  // Relative difficulty: tertiles of readability grade across the 20 tests.
  const grades = tests.map((t) => t.meta.readabilityGrade).sort((a, b) => a - b);
  const t1 = grades[Math.floor(grades.length / 3)];
  const t2 = grades[Math.floor((2 * grades.length) / 3)];
  for (const t of tests) {
    const g = t.meta.readabilityGrade;
    t.meta.estDifficulty = g < t1 ? "Standard" : g < t2 ? "Moderate" : "Challenging";
    t.meta.readabilityGrade = Math.round(g * 10) / 10;
    fs.writeFileSync(path.join(OUT_BANK, `test-${pad(t.meta.number)}.json`), JSON.stringify(t));
  }
  fs.writeFileSync(path.join(OUT_BANK, "index.json"), JSON.stringify(tests.map((t) => t.meta), null, 2));

  console.log(`\nWrote ${tests.length} tests to ${OUT_BANK}`);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log("  - " + w);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
