import { handle, readJson } from "@/server/http";
import { profileData, setProfileName } from "@/server/service";

export async function GET() {
  return handle(async () => Response.json(await profileData()));
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const { name } = await readJson<{ name?: string }>(req);
    await setProfileName(String(name ?? ""));
    return Response.json({ ok: true });
  });
}
