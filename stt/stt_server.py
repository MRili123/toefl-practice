"""
Local speech-to-text sidecar for the TOEFL practice app (faster-whisper, CPU by default).

  GET  /health                  -> {"ready": bool, "model": str, "error": str|null}
  POST /transcribe {"path": p, "hint"?: sentence}  -> {"text", "language", "duration", "words": [{"w","start","end","p"}]}
  POST /speak {"text": t, "style": "dictation"|"natural"}  -> audio/wav (Kokoro neural voice, offline)
  POST /shutdown                -> stops this service (a newer copy starting on the same port takes over)

Only files under the allowed roots can be transcribed: STT_ALLOWED_ROOT (os.pathsep-separated;
default: ../data/recordings and ../data/exercise-recordings).
Run with the Python that has faster-whisper installed, e.g. `py -3.12 stt/stt_server.py`.
Env: WHISPER_MODEL (small.en), WHISPER_DEVICE (cpu), WHISPER_COMPUTE (int8), WHISPER_THREADS (8), STT_PORT (8765),
KOKORO_DIR (../models/kokoro: kokoro-v1.0.int8.onnx + voices-v1.0.bin), KOKORO_VOICE (af_heart).
"""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_ROOTS = os.pathsep.join(os.path.join(HERE, "..", "data", d) for d in ("recordings", "exercise-recordings"))
ALLOWED_ROOTS = [os.path.realpath(r) for r in os.environ.get("STT_ALLOWED_ROOT", _DEFAULT_ROOTS).split(os.pathsep) if r]


def _allowed(path: str) -> bool:
    for root in ALLOWED_ROOTS:
        try:
            if os.path.commonpath([path, root]) == root:
                return True
        except ValueError:  # different drives on Windows
            continue
    return False
MODEL_NAME = os.environ.get("WHISPER_MODEL", "small.en")
KOKORO_DIR = os.environ.get("KOKORO_DIR", os.path.join(HERE, "..", "models", "kokoro"))
KOKORO_VOICE = os.environ.get("KOKORO_VOICE", "af_heart")
PORT = int(os.environ.get("STT_PORT", "8765"))

state = {"model": None, "error": None, "voice": None, "voice_error": None}
transcribe_lock = threading.Lock()
speak_lock = threading.Lock()


def log(*a):
    print("[stt]", *a, file=sys.stderr, flush=True)


def load_model():
    try:
        from faster_whisper import WhisperModel

        log(f"loading '{MODEL_NAME}'...")
        state["model"] = WhisperModel(
            MODEL_NAME,
            device=os.environ.get("WHISPER_DEVICE", "cpu"),
            compute_type=os.environ.get("WHISPER_COMPUTE", "int8"),
            cpu_threads=int(os.environ.get("WHISPER_THREADS", str(min(8, os.cpu_count() or 4)))),
        )
        log("model ready")
    except Exception as e:  # surfaced through /health
        state["error"] = f"{type(e).__name__}: {e}"
        log("model failed:", state["error"])


def transcribe(path, hint=None):
    """`hint`: the sentence the learner was asked to repeat. Passed as hotwords, it helps the model hear soft
    words ("She" was heard as "few"); tests showed it does not erase real mistakes ("She work in the bookstore"
    stays as said), so Listen & Repeat scoring stays honest."""
    model = state["model"]
    with transcribe_lock:
        segments, info = model.transcribe(
            path,
            language="en",
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,
            condition_on_previous_text=False,
            vad_parameters={"min_silence_duration_ms": 500},
            hotwords=hint or None,
        )
        words, text = [], []
        for seg in segments:
            text.append(seg.text)
            for w in seg.words or []:
                words.append({"w": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2), "p": round(w.probability, 3)})
    return {"text": "".join(text).strip(), "language": info.language, "duration": round(info.duration, 2), "words": words}


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass

    def _speak(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json(400, {"error": "invalid json"})
        text = str(req.get("text", "")).strip()[:600]
        if not text:
            return self._json(400, {"error": "no text"})
        try:
            audio = speak(text, "dictation" if req.get("style") == "dictation" else "natural")
        except Exception as e:
            log("speak failed:", e)
            return self._json(500, {"error": f"{type(e).__name__}: {e}"})
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ready": state["model"] is not None, "model": MODEL_NAME, "error": state["error"]})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path == "/speak":
            return self._speak()
        if self.path == "/shutdown":
            self._json(200, {"ok": True})
            log("replaced by a newer copy; exiting")
            threading.Timer(0.2, lambda: os._exit(0)).start()
            return
        if self.path != "/transcribe":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json(400, {"error": "invalid json"})
        path = os.path.realpath(str(req.get("path", "")))
        if not _allowed(path) or not os.path.isfile(path):
            return self._json(400, {"error": "file not found or not allowed"})
        if state["model"] is None:
            return self._json(503, {"error": state["error"] or "model loading"})
        try:
            hint = req.get("hint")
            hint = str(hint)[:300] if isinstance(hint, str) and hint.strip() else None
            return self._json(200, transcribe(path, hint))
        except Exception as e:
            log("transcribe failed:", e)
            return self._json(500, {"error": f"{type(e).__name__}: {e}"})


def voice():
    """Kokoro is loaded on the first /speak request (most sessions never need new audio)."""
    if state["voice"] is None:
        from kokoro_onnx import Kokoro

        model = os.path.join(KOKORO_DIR, "kokoro-v1.0.int8.onnx")
        voices = os.path.join(KOKORO_DIR, "voices-v1.0.bin")
        if not (os.path.isfile(model) and os.path.isfile(voices)):
            raise FileNotFoundError(f"Kokoro model files not found in {KOKORO_DIR}")
        log("loading Kokoro voice...")
        state["voice"] = Kokoro(model, voices)
    return state["voice"]


def speak(text, style):
    """Neural speech as 16-bit mono WAV. Dictation is a little slower, as on a spelling test."""
    import io
    import wave

    import numpy as np

    with speak_lock:
        samples, rate = voice().create(text, voice=KOKORO_VOICE, speed=0.85 if style == "dictation" else 1.0, lang="en-us")
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def exit_with_parent(pid):
    """Desktop app: exit when the app process ends, even if it crashed or was killed.
    (Watching the process itself; reading stdin would block other threads on Windows pipes.)"""
    if os.name == "nt":
        import ctypes

        synchronize = 0x00100000
        handle = ctypes.windll.kernel32.OpenProcess(synchronize, False, pid)
        if handle:
            ctypes.windll.kernel32.WaitForSingleObject(handle, 0xFFFFFFFF)
    else:
        import time

        while True:
            try:
                os.kill(pid, 0)
            except OSError:
                break
            time.sleep(2)
    log("parent app closed; exiting")
    os._exit(0)


def take_over_port():
    """A copy left running from an earlier start (e.g. after the app was closed) would keep answering with old
    code while this one fails to bind. Ask it to stop, then wait for the port."""
    import socket
    import time
    import urllib.request

    def busy():
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(("127.0.0.1", PORT)) == 0

    if not busy():
        return
    log(f"port {PORT} is in use; asking the running copy to stop")
    try:
        urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{PORT}/shutdown", method="POST"), timeout=3).read()
    except Exception as e:
        log(f"could not stop it ({e}); if this fails, close the old speech service process")
    for _ in range(50):
        if not busy():
            return
        time.sleep(0.1)


def main():
    take_over_port()
    parent = os.environ.get("STT_PARENT_PID")
    if parent and parent.isdigit():
        threading.Thread(target=exit_with_parent, args=(int(parent),), daemon=True).start()
    threading.Thread(target=load_model, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    log(f"listening on 127.0.0.1:{PORT} (allowed roots: {', '.join(ALLOWED_ROOTS)})")
    server.serve_forever()


if __name__ == "__main__":
    main()
