import { contentCounts } from "@/server/admin/content";
import { listMistakes } from "@/server/admin/mistakes";
import { handle } from "@/server/http";

export async function GET() {
  return handle(async () => {
    const [content, mistakes] = await Promise.all([contentCounts(), listMistakes()]);
    const open = mistakes.filter((m) => !m.mastered);
    return Response.json({
      content,
      mistakes: { open: open.length, spelling: open.filter((m) => m.type === "spelling").length, grammar: open.filter((m) => m.type === "grammar").length },
    });
  });
}
