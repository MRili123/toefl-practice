import { handle } from "@/server/http";
import { dashboard } from "@/server/service";

export async function GET() {
  return handle(async () => Response.json(await dashboard()));
}
