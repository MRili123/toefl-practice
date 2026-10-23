import { EngineError } from "@/engine/errors";
import { adminKind, deleteItem, updateItem } from "@/server/admin/content";
import { handle, readJson } from "@/server/http";

const itemId = (id: string) => {
  if (!/^[\w-]{1,80}$/.test(id)) throw new EngineError("invalid_item", "Invalid item id.");
  return id;
};

export async function PUT(req: Request, ctx: RouteContext<"/api/admin/content/[kind]/[id]">) {
  return handle(async () => {
    const { kind, id } = await ctx.params;
    return Response.json(await updateItem(adminKind(kind), itemId(id), await readJson<unknown>(req)));
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/admin/content/[kind]/[id]">) {
  return handle(async () => {
    const { kind, id } = await ctx.params;
    await deleteItem(adminKind(kind), itemId(id));
    return new Response(null, { status: 204 });
  });
}
