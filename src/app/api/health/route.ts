import { ollamaHealth } from "@/ai/ollama";
import { sttHealth } from "@/ai/stt";

export async function GET() {
  const [ollama, stt] = await Promise.all([ollamaHealth(), sttHealth()]);
  return Response.json({ ollama, stt });
}
