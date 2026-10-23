export type SectionId = "reading" | "listening" | "writing" | "speaking";
export const SECTION_ORDER: SectionId[] = ["reading", "listening", "writing", "speaking"];

export type Difficulty = "medium" | "hard" | "easy";
export type ModuleStage = 1 | 2;

export type Skill =
  | "Vocabulary"
  | "Main idea"
  | "Detail"
  | "Inference"
  | "Purpose"
  | "Context"
  | "Prediction"
  | "Organization"
  | "Response choice";

export interface Option {
  id: string;
  text: string;
}

export interface McqItem {
  id: string;
  stem: string;
  highlightText: string | null;
  options: Option[];
  correctOptionId: string;
  explanation: string;
  skill: Skill;
}

export interface CtwBlank {
  id: string;
  prefix: string;
  answer: string;
  fullWord: string;
}

export interface CompleteTheWordsTask {
  kind: "complete_the_words";
  id: string;
  /** Paragraph split around blanks: segments.length === blanks.length + 1 */
  segments: string[];
  blanks: CtwBlank[];
}

export interface DailyLifeTask {
  kind: "daily_life";
  id: string;
  textType: "email" | "notice" | "text_chain";
  title: string | null;
  email: {
    to: string;
    from: string;
    date: string;
    subject: string;
    body: string;
    signoff: string;
    senderName: string;
  } | null;
  messages: { sender: string; time: string; text: string }[] | null;
  text: string | null;
  questions: McqItem[];
}

export interface AcademicPassageTask {
  kind: "academic_passage";
  id: string;
  title: string;
  paragraphs: string[];
  questions: McqItem[];
}

export interface ChooseResponseTask {
  kind: "choose_response";
  id: string;
  audio: string;
  image: string | null;
  transcript: string;
  questions: [McqItem];
}

export interface ListeningSetTask {
  kind: "conversation" | "announcement" | "academic_talk";
  id: string;
  title: string;
  audio: string;
  image: string | null;
  transcript: string;
  questions: McqItem[];
}

export interface BuildSentenceTask {
  kind: "build_a_sentence";
  id: string;
  context: string;
  speakerName: string;
  speakerImage: string | null;
  speakerLine: string;
  respondentName: string;
  respondentImage: string | null;
  answerPrefix: string;
  answerSuffix: string;
  numBlanks: number;
  chunks: string[];
  correctOrder: string[];
  acceptedOrders: string[][];
  correctSentence: string;
  explanation: string;
  grammarPattern: string;
}

export type Rubric = Record<string, string>;

export interface EmailTask {
  kind: "write_email";
  id: string;
  directions: string;
  situation: string;
  taskInstructions: string;
  requiredPoints: string[];
  recipient: string;
  subject: string;
  targetWords: { min: number; max?: number };
  rubric: Rubric;
}

export interface DiscussionTask {
  kind: "academic_discussion";
  id: string;
  topicIntro: string;
  directions: string;
  professor: { name: string; image: string | null; text: string };
  students: { name: string; image: string | null; text: string }[];
  targetWords: { min: number; max?: number };
  rubric: Rubric;
}

export interface ListenRepeatTask {
  kind: "listen_and_repeat";
  id: string;
  sentence: string;
  audio: string;
  responseSeconds: number;
  partIndex: number;
  rubric: Rubric;
}

export interface InterviewTask {
  kind: "interview";
  id: string;
  prompt: string;
  video: string;
  questionType: string;
  prepSeconds: number;
  responseSeconds: number;
  rubric: Rubric;
}

export type Task =
  | CompleteTheWordsTask
  | DailyLifeTask
  | AcademicPassageTask
  | ChooseResponseTask
  | ListeningSetTask
  | BuildSentenceTask
  | EmailTask
  | DiscussionTask
  | ListenRepeatTask
  | InterviewTask;

export type TaskKind = Task["kind"];

export interface Module {
  id: string;
  stage: ModuleStage;
  difficulty: Difficulty;
  introAudio: string | null;
  tasks: Task[];
}

export interface SceneRegion {
  path: string;
  bbox: [number, number, number, number];
}

export interface SpeakingMeta {
  sceneImage: string | null;
  sceneTheme: string;
  sceneSize: { width: number; height: number } | null;
  /** index = partIndex → region outline (null when unmapped) */
  partRegions: (SceneRegion | null)[];
  interview: {
    topic: string;
    interviewerName: string;
    scenario: string;
    introVideo: string | null;
  };
}

export interface Section {
  id: SectionId;
  modules: Module[];
  speaking?: SpeakingMeta;
}

export interface TestMeta {
  number: number;
  estDifficulty: "Standard" | "Moderate" | "Challenging";
  readabilityGrade: number;
}

export interface BankTest {
  meta: TestMeta;
  sections: Record<SectionId, Section>;
}
