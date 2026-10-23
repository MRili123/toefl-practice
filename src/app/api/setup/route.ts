import { ollamaHealth } from "@/ai/ollama";
import { sttHealth } from "@/ai/stt";
import { AI_CONFIG } from "@/ai/config";

/** Everything the Setup page shows: local AI model and speech-to-text. */
export async function GET() {
  const [ollama, stt] = await Promise.all([ollamaHealth(), sttHealth()]);
  return Response.json({
    ollama,
    model: AI_CONFIG.ollamaModel,
    stt,
    desktop: process.env.TOEFL_DESKTOP === "1",
  });
}
