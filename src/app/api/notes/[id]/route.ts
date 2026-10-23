import { handle, readJson } from "@/server/http";
import { deleteNote, type NoteInput, updateNote } from "@/server/service";

export async function PATCH(req: Request, ctx: RouteContext<"/api/notes/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json(await updateNote(id, await readJson<NoteInput>(req)));
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/notes/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await deleteNote(id);
    return new Response(null, { status: 204 });
  });
}
