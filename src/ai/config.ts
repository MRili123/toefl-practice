export const AI_CONFIG = {
  ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
  sttUrl: process.env.STT_URL ?? "http://127.0.0.1:8765",
  ollamaTimeoutMs: 180_000,
  sttTimeoutMs: 120_000,
};
