import { adminKind, createItem, listItems } from "@/server/admin/content";
import { handle, readJson } from "@/server/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/admin/content/[kind]">) {
  return handle(async () => {
    const { kind } = await ctx.params;
    return Response.json(await listItems(adminKind(kind)));
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/admin/content/[kind]">) {
  return handle(async () => {
    const { kind } = await ctx.params;
    return Response.json(await createItem(adminKind(kind), await readJson<unknown>(req)), { status: 201 });
  });
}
