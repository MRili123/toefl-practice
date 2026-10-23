import { listMistakes } from "@/server/admin/mistakes";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => Response.json(await listMistakes()));
}
