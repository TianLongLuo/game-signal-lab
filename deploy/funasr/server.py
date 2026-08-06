#!/usr/bin/env python3
"""Optional custom FunASR HTTP server for GAME Signal Lab.

Use SenseVoiceSmall with language=auto for Chinese/English audio. The
paraformer-online model is a streaming Mandarin model and must not be used as
the one-shot model for bilingual transcription.
"""
import sys, os, io, json, cgi, tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler
import soundfile as sf
import numpy as np

MODEL_SETTING = os.environ.get("FUNASR_MODEL", "sensevoice").strip().lower()
MODEL_ALIASES = {
    "sensevoice": "iic/SenseVoiceSmall",
    "paraformer": "paraformer-zh",
    "paraformer-en": "paraformer-en",
}
MODEL = MODEL_ALIASES.get(MODEL_SETTING, os.environ.get("FUNASR_MODEL", "iic/SenseVoiceSmall"))
LANGUAGE = os.environ.get("FUNASR_LANGUAGE", "auto").strip().lower() or "auto"
PORT = int(os.environ.get("FUNASR_PORT", "8000"))
IS_SENSEVOICE = "sensevoice" in MODEL.lower()

print(f"Loading {MODEL}...", flush=True)
from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess

model_options = {}
if IS_SENSEVOICE:
    model_options.update(
        vad_model="fsmn-vad",
        vad_kwargs={"max_single_segment_time": 30_000},
    )
model = AutoModel(model=MODEL, device="cpu", ncpu=2, **model_options)
print("Model ready.", flush=True)

class Handler(BaseHTTPRequestHandler):
    def _send_json(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a): pass

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "model": MODEL})

    def do_POST(self):
        if self.path not in ("/v1/audio/transcriptions", "/asr"):
            self.send_error(404)
            return

        content_type = self.headers.get("Content-Type", "")
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            self.send_error(400, "empty body")
            return

        audio_bytes = None

        if "multipart/form-data" in content_type:
            # Parse multipart form data
            mimetype = content_type
            environ = {
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": mimetype,
                "CONTENT_LENGTH": str(length),
            }
            form = cgi.FieldStorage(
                fp=io.BytesIO(self.rfile.read(length)),
                environ=environ,
                keep_blank_values=True,
            )
            if "file" in form:
                audio_bytes = form["file"].file.read()
        else:
            # Raw binary audio
            audio_bytes = self.rfile.read(length)

        if not audio_bytes or len(audio_bytes) < 100:
            self._send_json(400, {"error": "audio too small"})
            return

        try:
            # Decode audio to 16kHz mono PCM
            data, sr = sf.read(io.BytesIO(audio_bytes))
            if sr != 16000:
                import librosa
                data = librosa.resample(data, orig_sr=sr, target_sr=16000)
            if data.ndim > 1:
                data = data.mean(axis=1)
            # AutoModel's offline path expects normalized float samples. The
            # old script converted them to raw int16 bytes and then invoked an
            # online Paraformer model as if it were a batch model.
            data = np.asarray(data, dtype=np.float32)

            res = model.generate(
                input=data,
                cache={},
                language=LANGUAGE,
                use_itn=True,
                batch_size_s=60,
                fs=16000,
            )
            text = res[0].get("text", "") if res else ""
            if IS_SENSEVOICE:
                text = rich_transcription_postprocess(text)
        except Exception as e:
            self._send_json(500, {"error": str(e)[:200]})
            return

        self._send_json(200, {"text": text.strip()})

print(f"Listening on 0.0.0.0:{PORT}", flush=True)
HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
