# TOEFL iBT 2026 Practice Simulator

A local practice platform for the TOEFL iBT format introduced in January 2026: 20 full tests, TOEFL-style
adaptive Reading/Listening, section-specific exam interfaces, local speech-to-text and local AI evaluation,
and results on the 1–6 band scale (with the comparable 0–120 score).

Not affiliated with ETS. Every score is an **estimated practice score**. The adaptive routing is a
TOEFL-style simulation, not ETS's proprietary algorithm.

## Requirements

- Node.js 20+ (developed on 24)
- [Ollama](https://ollama.com) running locally with the evaluation model: `ollama pull qwen2.5:7b`
- Python with `faster-whisper` (the dev script uses `py -3.12`) and ffmpeg on PATH

## Run

```bash
npm install
npm run dev           # web app on http://localhost:3000 + speech-to-text sidecar on :8765
```

`npm run dev:web` starts only the web app; `npm run stt` starts only the sidecar.

The question bank (`data/bank`) and test media (`public/media`) are not included in this repository.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_MODEL` | `qwen2.5:7b` | Model used for Speaking/Writing evaluation |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama endpoint |
| `WHISPER_MODEL` | `small.en` | faster-whisper model for the sidecar |
| `STT_URL` | `http://127.0.0.1:8765` | Sidecar endpoint |
| `TOEFL_TIME_SCALE` | `1` | Dev only: multiplies every clock (e.g. `0.02` to test timeouts) |

Timings, routing threshold, score weights and the ETS concordance tables live in
`src/engine/config/toefl2026.ts`.

## Architecture

- `src/engine/` — test engine (no UI code): question bank, sessions, adaptive router, server-side timers,
  objective grading, scoring (ETS 1–6 ↔ 0–30 / 0–120 tables), results.
- `src/ai/` — speech-to-text client, Ollama client, evaluators, background evaluation queue.
- `src/app/api/` — thin route handlers over the engine. Correct answers never reach the browser during a test.
- `src/components/` — dashboard, exam runner and section UIs, results.
- `stt/stt_server.py` — local faster-whisper HTTP sidecar.
- `data/` — question bank, sessions (JSON) and recordings; `public/media/` — test audio/video/images.

## Tests

```bash
npm test
```
