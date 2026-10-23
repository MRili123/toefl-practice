import path from "node:path";

export const DATA_DIR = path.resolve(process.env.TOEFL_DATA_DIR ?? path.join(process.cwd(), "data"));
// The test bank is read-only content; the desktop app ships it separately from the writable user data.
export const BANK_DIR = path.resolve(process.env.TOEFL_BANK_DIR ?? path.join(DATA_DIR, "bank"));
export const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
export const RECORDINGS_DIR = path.join(DATA_DIR, "recordings");
