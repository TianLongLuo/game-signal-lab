#!/usr/bin/env python3
"""Custom FunASR HTTP server for paraformer-online streaming model.
Handles multipart file uploads from GAME Signal Lab.
"""
import sys, os, io, json, cgi, tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler
import soundfile as sf
import numpy as np

MODEL = "iic/speech_paraformer_asr_nat-zh-cn-16k-common-vocab8404-online"
PORT = int(os.environ.get("FUNASR_PORT", "8000"))

print(f"Loading {MODEL}...", flush=True)
from funasr import AutoModel
model = AutoModel(model=MODEL, device="cpu", ncpu=2)
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
            data = (data * 32767).astype(np.int16).tobytes()

            res = model.generate(input=data, cache={})
            text = res[0].get("text", "") if res else ""
        except Exception as e:
            self._send_json(500, {"error": str(e)[:200]})
            return

        self._send_json(200, {"text": text.strip()})

print(f"Listening on 0.0.0.0:{PORT}", flush=True)
HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
