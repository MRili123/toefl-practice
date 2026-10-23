/** Word lists shared by spell checking and dictation practice. Client-safe. */

/**
 * Very frequent English words. When a misspelling is equally close to several dictionary words, the frequent
 * one is almost always what the learner meant ("ibn" → "in", not "inn").
 */
export const COMMON_WORDS = new Set(
  (
    "a about after again all also always am an and any are as at back be because been before being best better big " +
    "both but by came can come could day did do does done down each even every few find first for from get give go " +
    "going good got great had has have he her here him his home how i if in into is it its just know last let life like " +
    "little long look made make man many may me more most much must my never new next no not now of off old on once " +
    "one only or other our out over own people place put read really right said same say see she should show so some " +
    "something still such take tell than that the their them then there these they thing think this those time to too " +
    "two under up us use very want was way we well went were what when where which while who why will with work would " +
    "write year yes yet you your"
  ).split(" "),
);

/**
 * Words that sound exactly like another common word. They cannot be tested by dictation alone (you cannot hear
 * whether "in" or "inn" was meant), so they are never added to Spelling practice as single words.
 */
const HOMOPHONE_GROUPS = [
  "in inn", "our hour", "no know", "new knew", "right write rite", "hear here", "see sea", "by buy bye", "for four fore",
  "one won", "eight ate", "whole hole", "which witch", "weather whether", "piece peace", "wear where ware", "week weak",
  "meet meat", "son sun", "blue blew", "road rode", "brake break", "plain plane", "tail tale", "mail male", "pair pear pare",
  "flour flower", "allowed aloud", "principal principle", "stationary stationery", "to too two", "there their they're",
  "your you're", "its it's", "would wood", "not knot", "be bee", "so sew sow", "made maid", "night knight", "wait weight",
  "way weigh", "sale sail", "red read", "steal steel", "hair hare", "bear bare", "dear deer", "fair fare",
  "heal heel", "knows nose", "past passed", "rain reign rein", "scene seen", "seam seem", "some sum",
  "stair stare", "threw through", "wore war", "warn worn", "waist waste", "die dye", "flu flew",
  "groan grown", "guest guessed", "higher hire", "idle idol", "lessen lesson", "loan lone", "minor miner", "pause paws",
  "peak peek", "pray prey", "rap wrap", "real reel", "ring wring", "role roll", "root route", "sight site cite",
  "soul sole", "suite sweet", "tide tied", "toe tow", "vain vein", "wade weighed", "whine wine", "who's whose",
].map((g) => g.split(" "));

const HOMOPHONES = new Map<string, string[]>();
for (const group of HOMOPHONE_GROUPS) for (const w of group) HOMOPHONES.set(w, [...new Set([...(HOMOPHONES.get(w) ?? []), ...group.filter((x) => x !== w)])]);

/** The words that sound like `word` (empty when it has none). */
export const soundsLike = (word: string): string[] => HOMOPHONES.get(word.toLowerCase()) ?? [];
