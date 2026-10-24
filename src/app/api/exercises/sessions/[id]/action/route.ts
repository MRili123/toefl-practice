import { EngineError } from "@/engine/errors";
import { handle, readJson } from "@/server/http";
import { answerExercise, confirmExerciseTranscript, exerciseView, exitExercise, nextWritingPrompt, retryEvaluation, submitWriting, writingLevels } from "@/server/exercises";
import type { Cefr } from "@/engine/exercises/types";

type Action =
  | { type: "answer"; itemId: string; value: string }
  | { type: "writing"; itemId: string; text: string; subject?: string }
  | { type: "next" }
  | { type: "retry"; itemId: string }
  | { type: "transcript"; itemId: string; text: string }
  | { type: "levels"; itemId: string; level?: Cefr }
  | { type: "exit" };

export async function POST(req: Request, ctx: RouteContext<"/api/exercises/sessions/[id]/action">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const a = await readJson<Action>(req);
    const itemId = "itemId" in a ? String(a.itemId ?? "") : "";
    if ("itemId" in a && !/^[\w-]{1,80}$/.test(itemId)) throw new EngineError("invalid_item", "Invalid item id.");
    switch (a.type) {
      case "answer":
        return Response.json(await answerExercise(id, itemId, String(a.value ?? "")));
      case "writing":
        return Response.json(await submitWriting(id, itemId, String(a.text ?? ""), a.subject ? String(a.subject) : undefined));
      case "next":
        return Response.json(await nextWritingPrompt(id));
      case "retry":
        return Response.json(await retryEvaluation(id, itemId));
      case "levels":
        return Response.json(await writingLevels(id, itemId, a.level ?? undefined));
      case "transcript":
        return Response.json(await confirmExerciseTranscript(id, itemId, String(a.text ?? "")));
      case "exit": {
        const r = await exitExercise(id);
        return r.deleted ? Response.json({ deleted: true }) : Response.json(await exerciseView(id));
      }
      default:
        throw new EngineError("invalid_action", "Unknown action.");
    }
  });
}
