# Builds the speech-to-text sidecar as a self-contained folder (no Python needed on the target computer)
# and copies the Whisper "small.en" model next to it. Output: build/stt/stt_server/
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

py -3.12 -m PyInstaller --noconfirm --clean --onedir --name stt_server `
  --distpath build/stt --workpath build/stt-work --specpath build/stt-work `
  --collect-all faster_whisper --collect-all ctranslate2 --collect-all av `
  --collect-all onnxruntime --collect-all tokenizers `
  --collect-all kokoro_onnx --collect-all espeakng_loader --collect-all phonemizer `
  --exclude-module tensorflow --exclude-module keras --exclude-module cv2 --exclude-module torch --exclude-module torchaudio --exclude-module transformers --exclude-module matplotlib --exclude-module pandas --exclude-module scipy --exclude-module jax --exclude-module IPython --exclude-module tkinter --exclude-module sklearn --exclude-module PIL --exclude-module tensorboard --exclude-module notebook `
  stt/stt_server.py

# Copy the model files (dereferenced from the Hugging Face cache).
$snap = Get-ChildItem "$env:USERPROFILE\.cache\huggingface\hub\models--Systran--faster-whisper-small.en\snapshots" | Select-Object -First 1
if (-not $snap) {
  py -3.12 -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8')"
  $snap = Get-ChildItem "$env:USERPROFILE\.cache\huggingface\hub\models--Systran--faster-whisper-small.en\snapshots" | Select-Object -First 1
}
$dest = "build/stt/stt_server/model"
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($f in Get-ChildItem $snap.FullName) { Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $dest $f.Name) -Force }
Write-Host "STT sidecar ready in build/stt/stt_server"

# Kokoro neural voice for audio of items added later (download once: see models/kokoro in DESKTOP.md).
if (Test-Path "models/kokoro/kokoro-v1.0.int8.onnx") {
  New-Item -ItemType Directory -Force "build/stt/stt_server/kokoro" | Out-Null
  Copy-Item "models/kokoro/kokoro-v1.0.int8.onnx", "models/kokoro/voices-v1.0.bin" "build/stt/stt_server/kokoro/"
} else {
  Write-Warning "models/kokoro not found: the desktop app will not be able to create audio for new items."
}
