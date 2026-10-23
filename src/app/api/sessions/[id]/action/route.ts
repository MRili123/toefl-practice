import { EngineError } from "@/engine/errors";
import {
  beginBlock, beginSection, checkItem, endBlockEarly, gotoTask, nextTask, saveNotes, startQuestion, submitQuestion, submitTask,
  timeout,
} from "@/engine/session/session";
import { buildView } from "@/engine/session/view";
import { loadTest } from "@/engine/bank/loader";
import { handle, readJson } from "@/server/http";
import { mutateSession } from "@/server/service";

type Action =
  | { type: "beginSection" }
  | { type: "beginBlock" }
  | { type: "goto"; taskIndex: number }
  | { type: "next" }
  | { type: "submitTask"; taskId: string; advance?: boolean }
  | { type: "checkItem"; itemId: string }
  | { type: "endBlock" }
  | { type: "timeout" }
  | { type: "notes"; text: string }
  | { type: "startQuestion"; itemId: string }
  | { type: "submitQuestion"; itemId: string };

export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/action">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const action = await readJson<Action>(req);
    const session = await mutateSession(id, (s, test, now) => {
      switch (action.type) {
        case "beginSection":
          return beginSection(s, test, now);
        case "beginBlock":
          return beginBlock(s, test, now);
        case "goto":
          return gotoTask(s, test, Number(action.taskIndex));
        case "next":
          return nextTask(s, test, now);
        case "submitTask":
          return submitTask(s, test, String(action.taskId), action.advance !== false, now);
        case "checkItem":
          return checkItem(s, test, String(action.itemId), now);
        case "endBlock":
          return endBlockEarly(s, test, now);
        case "timeout":
          return timeout(s, test, now);
        case "startQuestion":
          return startQuestion(s, test, String(action.itemId), now);
        case "submitQuestion":
          return submitQuestion(s, test, String(action.itemId), now);
        case "notes":
          return saveNotes(s, String(action.text ?? ""));
        default:
          throw new EngineError("unknown_action", "Unknown action.");
      }
    });
    return Response.json(buildView(session, loadTest(session.testNumber), Date.now()));
  });
}
