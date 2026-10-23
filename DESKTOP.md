# TOEFL Practice — desktop app

## Install on another Windows computer

1. Copy `dist-desktop/TOEFL-Practice-Setup-1.0.0.exe` (about 920 MB) to the other computer (USB drive, cloud folder…).
2. Run it. Windows may show “Windows protected your PC” because the app is not code-signed: click **More info → Run anyway**.
3. Choose the install folder, finish, and open **TOEFL Practice** from the desktop or Start menu.

Everything works offline right away: the 20 tests, Spelling, Grammar, Listen & Repeat (audio and speech-to-text are included).

### AI feedback (Writing and Speaking) — once per computer

Open **Profile → Your data → Open setup** (or the “Set up AI →” link at the top of Series):

1. Install **Ollama** from ollama.com/download and open it once.
2. Press **Download AI model** (about 4.7 GB, `qwen2.5:7b`). The download can be paused and resumed.

Audio for items added later (a word from your mistakes, an Interaction question, an item edited in Admin) is created once by the free, offline Kokoro voice built into the speech service, and saved. No key or subscription is needed. Before building, download `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin` from https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 into `models/kokoro/` and run `py -3.12 -m pip install kokoro-onnx`. The app never uses or stores an ElevenLabs key. To create ElevenLabs audio for new spelling words, pass a key to the generator for that run only: `$env:ELEVENLABS_API_KEY = "sk_..."; npm run generate-audio -- --only=spelling`.

### Move your progress

- On this computer: **Profile → Your data → Export my progress** → a `.toeflbackup` file.
- On the other computer: **Profile → Your data → Import progress…** → choose the file, check the summary, **Import**.
  Nothing already on the other computer is deleted; the two are merged.

Progress is stored in `%APPDATA%\TOEFL Practice\data` (logs in `…\logs`). Uninstalling or updating the app does not delete it.

## Rebuild the Windows installer (on this PC)

```bash
npm run build:stt        # only when stt/stt_server.py changes (≈ 2 min)
npm run desktop:build    # Next.js build + installer → dist-desktop/
```

`npm run desktop:dev` starts the desktop app from the project folder without packaging.

## Build for macOS (must be done on a Mac)

A Mac app can only be built on a Mac. Copy the **whole** `toefl-practice` folder (not a git clone — `data/bank`, `public/media` and `practice_audios` are not in git), then on the Mac:

```bash
# once: Node 20+ and Python 3.12
python3 -m pip install faster-whisper pyinstaller
npm ci && npm --prefix desktop ci
./scripts/build-stt.sh
npm run desktop:build:mac      # → dist-desktop/TOEFL-Practice-1.0.0-<arch>.dmg
```

The app is not signed: on first launch, right-click it → **Open**. macOS asks for microphone access the first time you record.

## How it fits together

- `desktop/main.js` (Electron) starts the bundled Next.js server and the speech-to-text engine on free local ports, then opens the window. Both stop with the app, even if it crashes.
- Read-only content ships inside the app (`resources/`): test bank, test media, exercise content, exercise audio, speech model.
- User data lives in the OS user-data folder (`TOEFL_DATA_DIR`), separate from the app.
