/**
 * Rule-based grammar question generator. Every pattern builds a sentence in which exactly ONE option is
 * grammatical (the distractors are ungrammatical for the target rule, never merely unlikely), so generated
 * variations are correct by construction. Variety comes from combining subjects, verbs and contexts.
 */
import { type Rng, shuffle } from "./selection";
import { type Cefr, CEFR_LEVELS, type GrammarCategory, type GrammarQuestion } from "./types";

export interface Draft {
  stem: string;
  correct: string;
  wrong: [string, string, string];
  explanation: string;
  tags: string[];
}
interface Pattern {
  min: Cefr;
  make(rng: Rng): Draft;
}

const rank = (l: Cefr) => CEFR_LEVELS.indexOf(l);
const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];
const q = (s: string) => `“${s}”`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const B = "_____";

interface Verb { base: string; s: string; past: string; pp: string; ing: string }
const V = (base: string, s: string, past: string, pp: string, ing: string): Verb => ({ base, s, past, pp, ing });

/* ------------------------------------------------------------------ subject–verb agreement */

const SVA_FRAMES = [
  { sg: "The student", pl: "The students", v: V("study", "studies", "studied", "studied", "studying"), tail: "in the library every evening." },
  { sg: "My professor", pl: "My professors", v: V("teach", "teaches", "taught", "taught", "teaching"), tail: "several courses every term." },
  { sg: "The new policy", pl: "The new policies", v: V("affect", "affects", "affected", "affected", "affecting"), tail: "international students every year." },
  { sg: "The researcher", pl: "The researchers", v: V("publish", "publishes", "published", "published", "publishing"), tail: "a report every year." },
  { sg: "This course", pl: "These courses", v: V("require", "requires", "required", "required", "requiring"), tail: "a lot of reading every week." },
  { sg: "The museum", pl: "The museums", v: V("offer", "offers", "offered", "offered", "offering"), tail: "free tours on Sundays." },
  { sg: "My roommate", pl: "My roommates", v: V("cook", "cooks", "cooked", "cooked", "cooking"), tail: "dinner every Friday." },
  { sg: "The bus", pl: "The buses", v: V("stop", "stops", "stopped", "stopped", "stopping"), tail: "near the campus every fifteen minutes." },
  { sg: "The teacher", pl: "The teachers", v: V("give", "gives", "gave", "given", "giving"), tail: "extra help after class every week." },
  { sg: "Our neighbor", pl: "Our neighbors", v: V("walk", "walks", "walked", "walked", "walking"), tail: "to work every morning." },
  { sg: "The librarian", pl: "The librarians", v: V("order", "orders", "ordered", "ordered", "ordering"), tail: "new books every month." },
  { sg: "The company", pl: "The companies", v: V("hire", "hires", "hired", "hired", "hiring"), tail: "interns every summer." },
  { sg: "My sister", pl: "My sisters", v: V("play", "plays", "played", "played", "playing"), tail: "tennis on Saturdays." },
  { sg: "The festival", pl: "The festivals", v: V("attract", "attracts", "attracted", "attracted", "attracting"), tail: "thousands of visitors every year." },
  { sg: "The engineer", pl: "The engineers", v: V("check", "checks", "checked", "checked", "checking"), tail: "the machines every morning." },
  { sg: "The professor", pl: "The professors", v: V("answer", "answers", "answered", "answered", "answering"), tail: "questions after every lecture." },
];

interface Trap { head: string; plural: boolean; v: Verb; tail: string; why: string }
const SVA_TRAPS: Trap[] = [
  { head: "The quality of these courses", plural: false, v: V("improve", "improves", "improved", "improved", "improving"), tail: "every year.", why: "The subject is “quality” (singular), not “courses”." },
  { head: "The cost of the tickets", plural: false, v: V("rise", "rises", "rose", "risen", "rising"), tail: "every summer.", why: "The subject is “cost” (singular), not “tickets”." },
  { head: "The results of the survey", plural: true, v: V("vary", "vary", "varied", "varied", "varying"), tail: "from year to year.", why: "The subject is “results” (plural), not “survey”." },
  { head: "The students in this program", plural: true, v: V("come", "come", "came", "come", "coming"), tail: "from many different countries.", why: "The subject is “students” (plural), not “program”." },
  { head: "The manager of the two libraries", plural: false, v: V("plan", "plans", "planned", "planned", "planning"), tail: "the schedule for each term.", why: "The subject is “manager” (singular), not “libraries”." },
  { head: "A list of the required books", plural: false, v: V("appear", "appears", "appeared", "appeared", "appearing"), tail: "on the course website.", why: "The subject is “list” (singular), not “books”." },
  { head: "The books on the top shelf", plural: true, v: V("belong", "belong", "belonged", "belonged", "belonging"), tail: "to the university library.", why: "The subject is “books” (plural), not “shelf”." },
  { head: "The number of applicants", plural: false, v: V("grow", "grows", "grew", "grown", "growing"), tail: "every year.", why: "“The number of” is singular; only “a number of” takes a plural verb." },
  { head: "A number of applicants", plural: true, v: V("come", "come", "came", "come", "coming"), tail: "from rural areas.", why: "“A number of” means “several” and takes a plural verb." },
  { head: "Each of the students", plural: false, v: V("receive", "receives", "received", "received", "receiving"), tail: "a copy of the schedule.", why: "“Each” is singular, even in “each of the students”." },
  { head: "One of my classmates", plural: false, v: V("work", "works", "worked", "worked", "working"), tail: "at the campus café.", why: "The subject is “one” (singular), not “classmates”." },
  { head: "Everyone in the class", plural: false, v: V("understand", "understands", "understood", "understood", "understanding"), tail: "the instructions.", why: "“Everyone” is singular." },
  { head: "The information in these reports", plural: false, v: V("help", "helps", "helped", "helped", "helping"), tail: "us understand the problem.", why: "“Information” is uncountable and singular." },
];

const svaOptions = (v: Verb, plural: boolean): { correct: string; wrong: [string, string, string] } => ({
  correct: plural ? v.base : v.s,
  wrong: [plural ? v.s : v.base, v.ing, `to ${v.base}`],
});

const subjectVerbAgreement: Pattern[] = [
  {
    min: "A1",
    make(rng) {
      const f = pick(SVA_FRAMES, rng);
      const plural = rng() < 0.5;
      const o = svaOptions(f.v, plural);
      return {
        stem: `${plural ? f.pl : f.sg} ${B} ${f.tail}`, ...o, tags: ["present simple", "agreement"],
        explanation: `The subject “${plural ? f.pl : f.sg}” is ${plural ? "plural, so the present simple verb has no -s" : "singular, so the present simple verb takes -s"}: ${q(o.correct)}.`,
      };
    },
  },
  {
    min: "B1",
    make(rng) {
      const t = pick(SVA_TRAPS, rng);
      const o = svaOptions(t.v, t.plural);
      return { stem: `${t.head} ${B} ${t.tail}`, ...o, tags: ["agreement", "distance from the subject"], explanation: `${t.why} So the verb is ${q(o.correct)}.` };
    },
  },
];

/* ------------------------------------------------------------------ articles */

const ADJ_AN: [string, string][] = [
  ["excellent", ""], ["honest", "the “h” in “honest” is silent, so the word starts with a vowel sound"], ["intelligent", ""], ["ambitious", ""],
  ["old", ""], ["exhausted", ""], ["independent", ""], ["outstanding", ""], ["hardworking", "the “h” in “hardworking” is pronounced, so"],
];
const ADJ_A: [string, string][] = [
  ["good", ""], ["new", ""], ["young", ""], ["serious", ""], ["tall", ""],
  ["European", "“European” begins with a /j/ sound (like “you”), a consonant sound"],
  ["unique", "“unique” begins with a /j/ sound (like “you”), a consonant sound"],
  ["useful", "“useful” begins with a /j/ sound (like “you”), a consonant sound"],
  ["hardworking", ""], ["clever", ""],
];
const PEOPLE = ["student", "teacher", "friend", "neighbor", "colleague", "classmate", "researcher"];
const NAMES = ["Maria", "Tom", "My cousin", "The professor", "Our neighbor", "Ali", "Her brother"];
const JOBS_AN: [string, string][] = [["engineer", ""], ["architect", ""], ["artist", ""], ["accountant", ""], ["electrician", ""], ["editor", ""], ["astronomer", ""]];
const JOBS_A: [string, string][] = [["teacher", ""], ["doctor", ""], ["lawyer", ""], ["journalist", ""], ["scientist", ""], ["pilot", ""], ["nurse", ""], ["university professor", "“university” begins with a /j/ sound (like “you”), a consonant sound"]];
const SUPERLATIVES = ["youngest", "tallest", "most helpful", "most creative", "best", "oldest", "smartest", "most hardworking", "funniest", "most patient"];

const aAn = (article: "a" | "an", word: string, note: string): Pick<Draft, "explanation"> => ({
  explanation: article === "an"
    ? `Use “an” before a vowel sound${note ? `: ${note}` : `: “an ${word}”`}.`
    : `Use “a” before a consonant sound${note ? `: ${note}` : `: “a ${word}”`}.`,
});

const articles: Pattern[] = [
  {
    min: "A1",
    make(rng) {
      const useAn = rng() < 0.5;
      const [adj, note] = pick(useAn ? ADJ_AN : ADJ_A, rng);
      const article = useAn ? "an" : "a";
      const full = note.endsWith("so") ? "" : note; // notes that only clarify an an-case
      return {
        stem: `${pick(NAMES, rng)} is ${B} ${adj} ${pick(PEOPLE, rng)}.`,
        correct: article, wrong: [useAn ? "a" : "an", "some", "many"], tags: ["a/an"],
        ...aAn(article, adj, note && !full ? `${note} the word “${adj}” starts with a vowel sound` : full),
      };
    },
  },
  {
    min: "A1",
    make(rng) {
      const useAn = rng() < 0.5;
      const [job, note] = pick(useAn ? JOBS_AN : JOBS_A, rng);
      const article = useAn ? "an" : "a";
      return {
        stem: `${pick(["Maria", "Tom", "My sister", "Ali", "Her cousin", "Sam"], rng)} wants to become ${B} ${job}.`,
        correct: article, wrong: [useAn ? "a" : "an", "some", "many"], tags: ["a/an", "jobs"], ...aAn(article, job, note),
      };
    },
  },
  {
    min: "A2",
    make(rng) {
      const sup = pick(SUPERLATIVES, rng);
      return {
        stem: `${pick(NAMES, rng)} is ${B} ${sup} ${pick(PEOPLE, rng)} in the class.`,
        correct: "the", wrong: ["a", "an", "some"], tags: ["the", "superlatives"],
        explanation: `Superlatives are used with “the”: “the ${sup}”.`,
      };
    },
  },
];

/* ------------------------------------------------------------------ prepositions */

const TIME_IN = ["June", "2019", "the summer", "the morning", "the evening", "the 1990s", "the twenty-first century", "spring", "September", "the afternoon"];
const TIME_ON = ["Monday", "Friday morning", "May 5th", "my birthday", "Sunday evening", "the first day of class", "Tuesday", "December 1st"];
const TIME_AT = ["9 o'clock", "noon", "night", "midnight", "3:30 p.m.", "lunchtime", "the end of the semester", "6 p.m."];
const TIME_FRAMES = ["The seminar starts", "Our exam is", "We usually meet", "The library closes", "The concert begins", "The bus leaves", "Registration opens"];
// "night" and clock times take "at" only in the frames where they make sense.
const dependentAdj: { stem: string; correct: string; wrong: [string, string, string]; min: Cefr; why: string }[] = [
  { stem: `She is very good ${B} solving problems.`, correct: "at", wrong: ["of", "to", "from"], min: "A2", why: "The adjective “good” is followed by “at” when it talks about a skill." },
  { stem: `The success of the project depends ${B} careful planning.`, correct: "on", wrong: ["of", "from", "at"], min: "A2", why: "The verb “depend” is followed by “on”." },
  { stem: `We are interested ${B} learning more about the topic.`, correct: "in", wrong: ["on", "at", "for"], min: "A1", why: "The adjective “interested” is followed by “in”." },
  { stem: `He is afraid ${B} speaking in public.`, correct: "of", wrong: ["from", "for", "at"], min: "A2", why: "The adjective “afraid” is followed by “of”." },
  { stem: `The manager apologized ${B} the delay.`, correct: "for", wrong: ["of", "at", "from"], min: "A2", why: "The verb “apologize” is followed by “for” before the thing you are sorry about." },
  { stem: `This university is famous ${B} its engineering program.`, correct: "for", wrong: ["of", "at", "with"], min: "A2", why: "The adjective “famous” is followed by “for”." },
  { stem: `The report consists ${B} three main sections.`, correct: "of", wrong: ["from", "with", "by"], min: "B1", why: "The verb “consist” is followed by “of”." },
  { stem: `Heavy rain resulted ${B} serious flooding.`, correct: "in", wrong: ["of", "with", "by"], min: "B1", why: "The verb “result” is followed by “in” before the effect." },
  { stem: `Students must participate ${B} at least one group project.`, correct: "in", wrong: ["at", "to", "for"], min: "B1", why: "The verb “participate” is followed by “in”." },
  { stem: `Regular exercise contributes ${B} better health.`, correct: "to", wrong: ["for", "of", "with"], min: "B1", why: "The verb “contribute” is followed by “to”." },
  { stem: `The team focused ${B} improving the design.`, correct: "on", wrong: ["in", "at", "to"], min: "B1", why: "The verb “focus” is followed by “on”." },
  { stem: `Many students rely ${B} part-time jobs to pay for tuition.`, correct: "on", wrong: ["at", "of", "in"], min: "B1", why: "The verb “rely” is followed by “on”." },
  { stem: `Everyone can benefit ${B} regular practice.`, correct: "from", wrong: ["of", "for", "to"], min: "B1", why: "The verb “benefit” is followed by “from”." },
  { stem: `She succeeded ${B} finding a solution.`, correct: "in", wrong: ["on", "with", "for"], min: "B2", why: "The verb “succeed” is followed by “in” before an -ing form." },
  { stem: `He insisted ${B} paying for the meal.`, correct: "on", wrong: ["in", "at", "to"], min: "B1", why: "The verb “insist” is followed by “on”." },
  { stem: `Our results are different ${B} those of earlier studies.`, correct: "from", wrong: ["of", "with", "at"], min: "B1", why: "The adjective “different” is followed by “from”." },
  { stem: `She is capable ${B} solving the problem alone.`, correct: "of", wrong: ["for", "to", "at"], min: "B2", why: "The adjective “capable” is followed by “of”." },
  { stem: `The students were surprised ${B} the results.`, correct: "by", wrong: ["of", "for", "to"], min: "B1", why: "The adjective “surprised” is followed by “by” before the cause." },
  { stem: `This class is similar ${B} the one I took last year.`, correct: "to", wrong: ["with", "of", "from"], min: "A2", why: "The adjective “similar” is followed by “to”." },
  { stem: `Are you aware ${B} the new rules?`, correct: "of", wrong: ["for", "to", "at"], min: "B1", why: "The adjective “aware” is followed by “of”." },
  { stem: `The professor was proud ${B} her students.`, correct: "of", wrong: ["for", "with", "at"], min: "A2", why: "The adjective “proud” is followed by “of”." },
  { stem: `We are looking forward ${B} meeting you.`, correct: "to", wrong: ["for", "at", "on"], min: "A2", why: "The expression “look forward to” ends with the preposition “to”." },
  { stem: `He is married ${B} a doctor.`, correct: "to", wrong: ["with", "of", "by"], min: "A2", why: "The adjective “married” is followed by “to”." },
];

const prepositions: Pattern[] = [
  {
    min: "A1",
    make(rng) {
      const group = rng();
      const [prep, expr, rule] =
        group < 0.34 ? ["in", pick(TIME_IN, rng), "months, years, seasons, decades and parts of the day (“the morning”)"]
          : group < 0.67 ? ["on", pick(TIME_ON, rng), "days and dates"]
            : ["at", pick(TIME_AT, rng), "clock times and points in time"];
      const others = shuffle(["in", "on", "at"].filter((p) => p !== prep), rng);
      return {
        stem: `${pick(TIME_FRAMES, rng)} ${B} ${expr}.`,
        correct: prep, wrong: [others[0], others[1], "of"], tags: ["time prepositions"],
        explanation: `Use “${prep}” with ${rule}: “${prep} ${expr}”.`,
      };
    },
  },
  ...dependentAdj.map((d): Pattern => ({
    min: d.min,
    make: () => ({ stem: d.stem, correct: d.correct, wrong: d.wrong, tags: ["dependent prepositions"], explanation: d.why }),
  })),
];

/* ------------------------------------------------------------------ verb tenses */

interface Subject { text: string; plural: boolean }
const SUBJECTS: Subject[] = [
  { text: "Maria", plural: false }, { text: "My brother", plural: false }, { text: "The professor", plural: false }, { text: "She", plural: false },
  { text: "They", plural: true }, { text: "My parents", plural: true }, { text: "The students", plural: true }, { text: "We", plural: true },
];
const have = (s: Subject) => (s.plural ? "have" : "has");
const beNow = (s: Subject) => (s.plural ? "are" : "is");
const present = (v: Verb, s: Subject) => (s.plural ? v.base : v.s);

const PERFECT_FRAMES: { v: Verb; tail: string }[] = [
  { v: V("live", "lives", "lived", "lived", "living"), tail: "in this city" },
  { v: V("work", "works", "worked", "worked", "working"), tail: "at the same company" },
  { v: V("study", "studies", "studied", "studied", "studying"), tail: "English" },
  { v: V("teach", "teaches", "taught", "taught", "teaching"), tail: "at this university" },
  { v: V("know", "knows", "knew", "known", "knowing"), tail: "the director" },
  { v: V("play", "plays", "played", "played", "playing"), tail: "the piano" },
];
const SINCE_FOR = ["for ten years", "for three months", "since 2015", "since last May", "for a long time", "since January", "for two weeks"];

const PAST_FRAMES: { v: Verb; obj: string }[] = [
  { v: V("visit", "visits", "visited", "visited", "visiting"), obj: "the science museum" },
  { v: V("finish", "finishes", "finished", "finished", "finishing"), obj: "the report" },
  { v: V("buy", "buys", "bought", "bought", "buying"), obj: "a new laptop" },
  { v: V("write", "writes", "wrote", "written", "writing"), obj: "an email to the professor" },
  { v: V("see", "sees", "saw", "seen", "seeing"), obj: "an interesting film" },
  { v: V("take", "takes", "took", "taken", "taking"), obj: "the final exam" },
  { v: V("meet", "meets", "met", "met", "meeting"), obj: "the new director" },
  { v: V("join", "joins", "joined", "joined", "joining"), obj: "the debate club" },
];
const PAST_TIME = ["yesterday", "last week", "two days ago", "in 2019", "last summer", "last night", "three years ago"];
const FUTURE_TIME = ["tomorrow", "next week", "next month", "next Friday", "next year"];
const NOW_FRAMES: { v: Verb; obj: string }[] = [
  { v: V("study", "studies", "studied", "studied", "studying"), obj: "in the library" },
  { v: V("wait", "waits", "waited", "waited", "waiting"), obj: "for the bus" },
  { v: V("prepare", "prepares", "prepared", "prepared", "preparing"), obj: "for the exam" },
  { v: V("work", "works", "worked", "worked", "working"), obj: "on a group project" },
  { v: V("cook", "cooks", "cooked", "cooked", "cooking"), obj: "dinner" },
];

const verbTenses: Pattern[] = [
  {
    min: "A1",
    make(rng) {
      const s = pick(SUBJECTS, rng);
      const f = pick(NOW_FRAMES, rng);
      const marker = pick(["right now", "at the moment"], rng);
      const correct = `${beNow(s)} ${f.v.ing}`;
      return {
        stem: `${s.text} ${B} ${f.obj} ${marker}.`, correct, wrong: [present(f.v, s), `${have(s)} ${f.v.pp}`, f.v.past], tags: ["present continuous"],
        explanation: `“${cap(marker)}” shows the action is happening now, so we use the present continuous: ${q(correct)}.`,
      };
    },
  },
  {
    min: "A2",
    make(rng) {
      const s = pick(SUBJECTS, rng);
      const f = pick(PAST_FRAMES, rng);
      const t = pick(PAST_TIME, rng);
      return {
        stem: `${s.text} ${B} ${f.obj} ${t}.`, correct: f.v.past, wrong: [`${have(s)} ${f.v.pp}`, present(f.v, s), `will ${f.v.base}`], tags: ["past simple"],
        explanation: `“${cap(t)}” is a finished time in the past, so we use the past simple: ${q(f.v.past)}.`,
      };
    },
  },
  {
    min: "A2",
    make(rng) {
      const s = pick(SUBJECTS, rng);
      const f = pick(PAST_FRAMES, rng);
      const t = pick(FUTURE_TIME, rng);
      return {
        stem: `${s.text} ${B} ${f.obj} ${t}.`, correct: `will ${f.v.base}`, wrong: [f.v.past, `${have(s)} ${f.v.pp}`, f.v.ing], tags: ["future"],
        explanation: `“${cap(t)}” refers to the future, so we use “will” + the base verb: ${q(`will ${f.v.base}`)}.`,
      };
    },
  },
  {
    min: "B1",
    make(rng) {
      const s = pick(SUBJECTS, rng);
      const f = pick(PERFECT_FRAMES, rng);
      const t = pick(SINCE_FOR, rng);
      const correct = `${have(s)} ${f.v.pp}`;
      return {
        stem: `${s.text} ${B} ${f.tail} ${t}.`, correct, wrong: [f.v.past, `${beNow(s)} ${f.v.ing}`, present(f.v, s)], tags: ["present perfect"],
        explanation: `“${cap(t)}” describes a situation that started in the past and continues now, so we use the present perfect: ${q(correct)}.`,
      };
    },
  },
];

/* ------------------------------------------------------------------ countable / uncountable */

const COUNTABLE = ["books", "students", "questions", "chairs", "examples", "ideas", "classes", "tickets", "assignments", "classrooms"];
const UNCOUNTABLE = ["information", "advice", "furniture", "homework", "equipment", "research", "progress", "luggage", "traffic", "evidence", "money", "water"];

const countable: Pattern[] = [
  {
    min: "A1",
    make(rng) {
      const isCount = rng() < 0.5;
      const noun = pick(isCount ? COUNTABLE : UNCOUNTABLE, rng);
      const correct = isCount ? "many" : "much";
      return {
        stem: `How ${B} ${noun} do you need?`, correct, wrong: [isCount ? "much" : "many", "a few", "a little"], tags: ["how many/much"],
        explanation: `“${noun}” is ${isCount ? "countable (plural), so we ask “how many”" : "uncountable, so we ask “how much”"}.`,
      };
    },
  },
  {
    min: "A2",
    make(rng) {
      const isCount = rng() < 0.5;
      const noun = pick(isCount ? COUNTABLE : UNCOUNTABLE, rng);
      const correct = isCount ? "a few" : "a little";
      return {
        stem: `There ${isCount ? "are" : "is"} only ${B} ${noun} left.`, correct, wrong: [isCount ? "a little" : "a few", "much", "many"], tags: ["a few/a little"],
        explanation: `“${noun}” is ${isCount ? "countable, so we use “a few”" : "uncountable, so we use “a little”"}.`,
      };
    },
  },
];

/* ------------------------------------------------------------------ comparatives */

const SHORT_ADJ: [string, string, string][] = [
  ["cheap", "cheaper", "cheapest"], ["fast", "faster", "fastest"], ["small", "smaller", "smallest"], ["large", "larger", "largest"],
  ["old", "older", "oldest"], ["tall", "taller", "tallest"], ["high", "higher", "highest"], ["long", "longer", "longest"],
  ["big", "bigger", "biggest"], ["hot", "hotter", "hottest"], ["easy", "easier", "easiest"], ["busy", "busier", "busiest"],
  ["early", "earlier", "earliest"], ["happy", "happier", "happiest"], ["heavy", "heavier", "heaviest"], ["safe", "safer", "safest"],
];
const LONG_ADJ = ["expensive", "difficult", "important", "interesting", "popular", "comfortable", "beautiful", "useful", "dangerous", "modern", "reliable", "efficient"];
const IRREGULAR_ADJ: [string, string, string][] = [["good", "better", "best"], ["bad", "worse", "worst"], ["far", "farther", "farthest"]];
const THINGS_SG = ["phone", "hotel", "course", "restaurant", "building", "exam", "route", "apartment", "bag"];
const THINGS_PL = ["phones", "hotels", "courses", "restaurants", "buildings", "exams", "routes", "apartments"];

const comparatives: Pattern[] = [
  {
    min: "A1",
    make(rng) {
      const thing = pick(THINGS_SG, rng);
      const kind = rng();
      if (kind < 0.45) {
        const [a, c, s] = pick(SHORT_ADJ, rng);
        return { stem: `This ${thing} is ${B} than my old one.`, correct: c, wrong: [s, a, `as ${a}`], tags: ["comparative"], explanation: `To compare two things, add -er to a short adjective: ${q(c)}.` };
      }
      if (kind < 0.8) {
        const a = pick(LONG_ADJ, rng);
        return { stem: `This ${thing} is ${B} than my old one.`, correct: `more ${a}`, wrong: [`${a}er`, `most ${a}`, a], tags: ["comparative"], explanation: `Long adjectives use “more” in the comparative: ${q(`more ${a}`)}.` };
      }
      const [a, c, s] = pick(IRREGULAR_ADJ, rng);
      return { stem: `This ${thing} is ${B} than my old one.`, correct: c, wrong: [s, a, `more ${a}`], tags: ["irregular comparatives"], explanation: `The comparative of “${a}” is irregular: ${q(c)}.` };
    },
  },
  {
    min: "A2",
    make(rng) {
      const thing = pick(THINGS_PL, rng);
      const kind = rng();
      if (kind < 0.5) {
        const [a, c, s] = pick(SHORT_ADJ, rng);
        return { stem: `Of all the ${thing} in the city, this one is the ${B}.`, correct: s, wrong: [c, a, `more ${a}`], tags: ["superlative"], explanation: `To compare one thing with all the others, use the superlative: “the ${s}”.` };
      }
      const a = pick(LONG_ADJ, rng);
      return { stem: `Of all the ${thing} in the city, this one is the ${B}.`, correct: `most ${a}`, wrong: [`more ${a}`, `${a}est`, a], tags: ["superlative"], explanation: `Long adjectives use “most” in the superlative: “the most ${a}”.` };
    },
  },
];

/* ------------------------------------------------------------------ pronouns */

interface Pron { who: string; subj: string; obj: string; poss: string; possPron: string; refl: string }
const PRONS: Pron[] = [
  { who: "Maria", subj: "she", obj: "her", poss: "her", possPron: "hers", refl: "herself" },
  { who: "Tom", subj: "he", obj: "him", poss: "his", possPron: "his", refl: "himself" },
  { who: "The students", subj: "they", obj: "them", poss: "their", possPron: "theirs", refl: "themselves" },
  { who: "My sister and I", subj: "we", obj: "us", poss: "our", possPron: "ours", refl: "ourselves" },
  { who: "I", subj: "I", obj: "me", poss: "my", possPron: "mine", refl: "myself" },
  { who: "Ali", subj: "he", obj: "him", poss: "his", possPron: "his", refl: "himself" },
];
const LEFT_THINGS = ["notebook", "umbrella", "jacket", "phone", "keys", "backpack"];
const BY_ACTIONS = ["finished the whole project", "prepared dinner", "traveled across the country", "painted the room", "built the website", "solved the puzzle"];

const pronouns: Pattern[] = [
  {
    min: "A1",
    make(rng) {
      const p = pick(PRONS.filter((x) => x.poss !== "his"), rng);
      const wrong = [p.subj, p.possPron, p.refl].filter((w, i, a) => w !== p.poss && a.indexOf(w) === i) as string[];
      while (wrong.length < 3) wrong.push(p.obj);
      return {
        stem: `${p.who} left ${B} ${pick(LEFT_THINGS, rng)} in the classroom.`, correct: p.poss, wrong: wrong.slice(0, 3) as [string, string, string], tags: ["possessive adjectives"],
        explanation: `Before a noun we need a possessive adjective: ${q(p.poss)}.`,
      };
    },
  },
  {
    min: "A2",
    make(rng) {
      const p = pick(PRONS.filter((x) => x.poss !== "his" || x.who === "Tom"), rng);
      const wrong = [p.obj, p.poss, p.possPron].filter((w, i, a) => w !== p.refl && a.indexOf(w) === i) as string[];
      while (wrong.length < 3) wrong.push(p.subj);
      return {
        stem: `${p.who} ${p.who === "I" ? "" : ""}${pick(BY_ACTIONS, rng)} by ${B}.`.replace("  ", " "),
        correct: p.refl, wrong: wrong.slice(0, 3) as [string, string, string], tags: ["reflexive pronouns"],
        explanation: `After “by”, when the doer and the object are the same person, use a reflexive pronoun: ${q(`by ${p.refl}`)}.`,
      };
    },
  },
];

/* ------------------------------------------------------------------ gerunds & infinitives */

const ACTS: { base: string; ing: string; past: string; tail: string }[] = [
  { base: "study", ing: "studying", past: "studied", tail: "in the library" },
  { base: "walk", ing: "walking", past: "walked", tail: "to campus" },
  { base: "cook", ing: "cooking", past: "cooked", tail: "dinner at home" },
  { base: "write", ing: "writing", past: "wrote", tail: "the report alone" },
  { base: "travel", ing: "traveling", past: "traveled", tail: "abroad" },
  { base: "watch", ing: "watching", past: "watched", tail: "the lecture online" },
  { base: "work", ing: "working", past: "worked", tail: "on weekends" },
];
const GERUND_VERBS = ["enjoyed", "avoided", "finished", "considered", "practiced", "postponed", "didn't mind"];
const INFINITIVE_VERBS = ["decided", "hoped", "planned", "agreed", "refused", "managed", "expected", "promised", "learned", "offered", "failed"];

function gerundInfinitive(target: "gerund" | "infinitive" | "either"): Pattern {
  return {
    min: "A2",
    make(rng) {
      const useGerund = target === "gerund" || (target === "either" && rng() < 0.5);
      const act = pick(ACTS, rng);
      const verb = pick(useGerund ? GERUND_VERBS : INFINITIVE_VERBS, rng);
      const name = pick(["Maria", "Tom", "Ali", "My roommate", "Sara"], rng);
      const correct = useGerund ? act.ing : `to ${act.base}`;
      const other = useGerund ? `to ${act.base}` : act.ing;
      return {
        stem: `${name} ${verb} ${B} ${act.tail}.`, correct, wrong: [other, act.base, act.past], tags: [useGerund ? "gerund" : "infinitive"],
        explanation: useGerund
          ? `The verb “${verb.replace("didn't ", "")}” is followed by an -ing form (gerund): ${q(correct)}.`
          : `The verb “${verb}” is followed by “to” + the base verb: ${q(correct)}.`,
      };
    },
  };
}

/* ------------------------------------------------------------------ conditionals */

const FIRST_COND: { cond: string; subj: string; v: Verb; obj: string }[] = [
  { cond: "it rains tomorrow", subj: "we", v: V("cancel", "cancels", "canceled", "canceled", "canceling"), obj: "the picnic" },
  { cond: "you study hard this week", subj: "you", v: V("pass", "passes", "passed", "passed", "passing"), obj: "the test" },
  { cond: "the bus is late tomorrow", subj: "I", v: V("miss", "misses", "missed", "missed", "missing"), obj: "my first class" },
  { cond: "she finishes the report tonight", subj: "the manager", v: V("send", "sends", "sent", "sent", "sending"), obj: "it to the client" },
  { cond: "they arrive early on Friday", subj: "we", v: V("start", "starts", "started", "started", "starting"), obj: "the meeting on time" },
  { cond: "you leave now", subj: "you", v: V("catch", "catches", "caught", "caught", "catching"), obj: "the last train" },
];
const ADVICE = ["talk to the professor", "start earlier", "ask for help", "take the earlier bus", "save more money", "read the instructions again"];
const THIRD_COND: { stem: string; correct: string; wrong: [string, string, string]; why: string }[] = [
  { stem: `If they ${B} earlier, they would have caught the train.`, correct: "had left", wrong: ["would have left", "have left", "will leave"], why: "left" },
  { stem: `If she ${B} harder, she would have passed the exam.`, correct: "had studied", wrong: ["would have studied", "has studied", "will study"], why: "studied" },
  { stem: `If we ${B} the map, we would have arrived on time.`, correct: "had checked", wrong: ["would have checked", "have checked", "will check"], why: "checked" },
  { stem: `If he ${B} the instructions, he would have avoided the mistake.`, correct: "had read", wrong: ["would have read", "has read", "will read"], why: "read" },
  { stem: `If the weather ${B} better, the concert would have gone ahead.`, correct: "had been", wrong: ["would have been", "has been", "will be"], why: "been" },
  { stem: `If I ${B} about the deadline, I would have started earlier.`, correct: "had known", wrong: ["would have known", "have known", "will know"], why: "known" },
  { stem: `If you ${B} me, I would have helped you.`, correct: "had asked", wrong: ["would have asked", "have asked", "will ask"], why: "asked" },
];

const conditionals: Pattern[] = [
  {
    min: "A2",
    make(rng) {
      const f = pick(FIRST_COND, rng);
      return {
        stem: `If ${f.cond}, ${f.subj} ${B} ${f.obj}.`, correct: `will ${f.v.base}`, wrong: [`would ${f.v.base}`, f.v.past, `had ${f.v.pp}`], tags: ["first conditional"],
        explanation: "The first conditional describes a real future possibility: if + present simple, will + base verb.",
      };
    },
  },
  {
    min: "B1",
    make(rng) {
      const advice = pick(ADVICE, rng);
      return {
        stem: `If I ${B} you, I would ${advice}.`, correct: "were", wrong: ["am", "will be", "would be"], tags: ["second conditional"],
        explanation: "In an imaginary situation (giving advice), the second conditional uses “were” after “if I”: “If I were you, I would…”.",
      };
    },
  },
  {
    min: "B1",
    make(rng) {
      const t = pick(THIRD_COND, rng);
      return {
        stem: t.stem, correct: t.correct, wrong: t.wrong, tags: ["third conditional"],
        explanation: `The third conditional talks about an imaginary past: if + past perfect (${q(t.correct)}), would have + past participle.`,
      };
    },
  },
];

/* ------------------------------------------------------------------ passive voice */

const PASSIVE_FRAMES: { sg: string; pl: string; v: Verb; agent: string }[] = [
  { sg: "The report", pl: "The reports", v: V("review", "reviews", "reviewed", "reviewed", "reviewing"), agent: "the committee" },
  { sg: "The letter", pl: "The letters", v: V("send", "sends", "sent", "sent", "sending"), agent: "the office" },
  { sg: "The essay", pl: "The essays", v: V("grade", "grades", "graded", "graded", "grading"), agent: "two teachers" },
  { sg: "The building", pl: "The buildings", v: V("design", "designs", "designed", "designed", "designing"), agent: "a famous architect" },
  { sg: "The room", pl: "The rooms", v: V("clean", "cleans", "cleaned", "cleaned", "cleaning"), agent: "the staff" },
  { sg: "The exam", pl: "The exams", v: V("prepare", "prepares", "prepared", "prepared", "preparing"), agent: "the department" },
  { sg: "The winner", pl: "The winners", v: V("announce", "announces", "announced", "announced", "announcing"), agent: "the president" },
  { sg: "The book", pl: "The books", v: V("write", "writes", "wrote", "written", "writing"), agent: "a young author" },
];
const MODAL_PASSIVE: { sg: string; pl: string; v: Verb; deadline: string }[] = [
  { sg: "The form", pl: "The forms", v: V("submit", "submits", "submitted", "submitted", "submitting"), deadline: "by Friday" },
  { sg: "The payment", pl: "The payments", v: V("make", "makes", "made", "made", "making"), deadline: "before the end of the month" },
  { sg: "The report", pl: "The reports", v: V("finish", "finishes", "finished", "finished", "finishing"), deadline: "before the meeting" },
  { sg: "The application", pl: "The applications", v: V("send", "sends", "sent", "sent", "sending"), deadline: "by the first of May" },
];

const passive: Pattern[] = [
  {
    min: "A2",
    make(rng) {
      const f = pick(PASSIVE_FRAMES, rng);
      const plural = rng() < 0.5;
      const subj = plural ? f.pl : f.sg;
      const t = pick(["last week", "yesterday", "in 2020", "last month"], rng);
      const correct = `${plural ? "were" : "was"} ${f.v.pp}`;
      return {
        stem: `${subj} ${B} by ${f.agent} ${t}.`, correct, wrong: [plural ? `was ${f.v.pp}` : `were ${f.v.pp}`, f.v.past, `${plural ? "were" : "was"} ${f.v.ing}`], tags: ["past passive"],
        explanation: `The subject receives the action and the time is past, so we use the past passive (was/were + past participle): ${q(correct)}.`,
      };
    },
  },
  {
    min: "A2",
    make(rng) {
      const f = pick(PASSIVE_FRAMES, rng);
      const plural = rng() < 0.5;
      const subj = plural ? f.pl : f.sg;
      const correct = `${plural ? "are" : "is"} ${f.v.pp}`;
      return {
        stem: `${subj} ${B} by ${f.agent} every year.`, correct, wrong: [f.v.pp, `${plural ? "are" : "is"} ${f.v.ing}`, `${plural ? "has" : "have"} ${f.v.pp}`], tags: ["present passive"],
        explanation: `The subject receives the action, so we use the present passive (am/is/are + past participle): ${q(correct)}.`,
      };
    },
  },
  {
    min: "B1",
    make(rng) {
      const f = pick(PASSIVE_FRAMES, rng);
      const plural = rng() < 0.5;
      const t = pick(["next week", "next month", "tomorrow", "next year"], rng);
      return {
        stem: `${plural ? f.pl : f.sg} ${B} by ${f.agent} ${t}.`, correct: `will be ${f.v.pp}`, wrong: [`will ${f.v.base}`, `will be ${f.v.ing}`, `has been ${f.v.pp}`], tags: ["future passive"],
        explanation: `The subject receives the action in the future, so we use will be + past participle: ${q(`will be ${f.v.pp}`)}.`,
      };
    },
  },
  {
    min: "B1",
    make(rng) {
      const f = pick(MODAL_PASSIVE, rng);
      const plural = rng() < 0.5;
      const modal = pick(["must", "should", "can"], rng);
      return {
        stem: `${plural ? f.pl : f.sg} ${modal} ${B} ${f.deadline}.`, correct: `be ${f.v.pp}`, wrong: [f.v.base, `been ${f.v.pp}`, `being ${f.v.pp}`], tags: ["modal passive"],
        explanation: `A modal verb is followed by the base verb “be” + past participle in the passive: ${q(`${modal} be ${f.v.pp}`)}.`,
      };
    },
  },
];

/* ------------------------------------------------------------------ registry */

const PATTERNS: Partial<Record<GrammarCategory, Pattern[]>> = {
  "subject-verb-agreement": subjectVerbAgreement,
  articles,
  prepositions,
  "verb-tenses": verbTenses,
  "countable-uncountable": countable,
  comparatives,
  pronouns,
  gerunds: [gerundInfinitive("gerund")],
  infinitives: [gerundInfinitive("infinitive")],
  conditionals,
  "passive-voice": passive,
};

export const TEMPLATE_CATEGORIES = new Set(Object.keys(PATTERNS) as GrammarCategory[]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Builds one new question for `category` at `level`, different from every stem in `avoid`
 * (a different sentence, not a reordered copy). Returns null if the category has no templates or is exhausted.
 */
export function generateFromTemplate(category: GrammarCategory, level: Cefr, rng: Rng, avoid: Set<string>, id: string): GrammarQuestion | null {
  const all = PATTERNS[category];
  if (!all) return null;
  const usable = all.filter((p) => rank(p.min) <= rank(level));
  if (usable.length === 0) return null;
  // Higher levels favor the harder patterns: weight each pattern by how close its minimum is to the level.
  const weighted = usable.flatMap((p) => Array(1 + Math.max(0, rank(p.min))).fill(p) as Pattern[]);
  for (let i = 0; i < 60; i++) {
    const d = pick(weighted, rng).make(rng);
    if (avoid.has(norm(d.stem))) continue;
    const options = shuffle([d.correct, ...d.wrong], rng);
    if (new Set(options.map(norm)).size !== 4) continue;
    return {
      id, level, stem: d.stem, options, answer: options.indexOf(d.correct), explanation: d.explanation, category,
      difficulty: Math.min(5, rank(level) + 1), tags: ["generated", "from-mistakes", ...d.tags], source: "generated",
    };
  }
  return null;
}
