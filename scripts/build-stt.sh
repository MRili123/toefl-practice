#!/usr/bin/env bash
# macOS/Linux: builds the speech-to-text sidecar (needs python3 with faster-whisper and pyinstaller).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-python3}
$PY -m PyInstaller --noconfirm --clean --onedir --name stt_server \
  --distpath build/stt --workpath build/stt-work --specpath build/stt-work \
  --collect-all faster_whisper --collect-all ctranslate2 --collect-all av \
  --collect-all onnxruntime --collect-all tokenizers \
  --collect-all kokoro_onnx --collect-all espeakng_loader --collect-all phonemizer \
  --exclude-module tensorflow --exclude-module keras --exclude-module cv2 --exclude-module torch \
  --exclude-module torchaudio --exclude-module transformers --exclude-module matplotlib --exclude-module pandas \
  --exclude-module scipy --exclude-module jax --exclude-module IPython --exclude-module tkinter \
  --exclude-module sklearn --exclude-module PIL --exclude-module tensorboard --exclude-module notebook \
  stt/stt_server.py
$PY -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')"
SNAP=$(ls -d "$HOME/.cache/huggingface/hub/models--Systran--faster-whisper-small.en/snapshots/"*/ | head -1)
mkdir -p build/stt/stt_server/model
cp -L "$SNAP"* build/stt/stt_server/model/
echo "STT sidecar ready in build/stt/stt_server"

# Kokoro neural voice for audio of items added later (download once: see models/kokoro in DESKTOP.md).
if [ -f models/kokoro/kokoro-v1.0.int8.onnx ]; then
  mkdir -p build/stt/stt_server/kokoro
  cp models/kokoro/kokoro-v1.0.int8.onnx models/kokoro/voices-v1.0.bin build/stt/stt_server/kokoro/
else
  echo "warning: models/kokoro not found: the desktop app will not be able to create audio for new items." >&2
fi
