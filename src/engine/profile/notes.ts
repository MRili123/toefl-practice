/** Personal notes kept in the Profile. Client-safe: no Node imports. */
export const NOTE_TAGS = ["general", "reading", "listening", "writing", "speaking", "vocabulary", "grammar"] as const;
export type NoteTag = (typeof NOTE_TAGS)[number];

export interface Note {
  id: string;
  title: string;
  body: string;
  tag: NoteTag;
  createdAt: number;
  updatedAt: number;
}
