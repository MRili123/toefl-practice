import { handle, readJson } from "@/server/http";
import { createNote, type NoteInput } from "@/server/service";

export async function POST(req: Request) {
  return handle(async () => Response.json(await createNote(await readJson<NoteInput>(req)), { status: 201 }));
}
