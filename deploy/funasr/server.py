#!/usr/bin/env python3
"""Custom FunASR HTTP server for paraformer-online streaming model."""
import sys, os, io, json, tempfile, wave
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse

MODEL = "iic/speech_paraformer_asr_nat-zh-cn-16k-common-vocab8404-online"
PORT = 8000

print(f"Loading {MODEL}...")
from funasr import AutoModel

model = AutoModel(model=MODEL, device="cpu", ncpu=2)
print("Model ready.")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "model": MODEL}).encode())

    def do_POST(self):
        if self.path not in ("/v1/audio/transcriptions", "/asr"):
            self.send_error(404)
            return

        content_type = self.headers.get("Content-Type", "")
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            self.send_error(400, "empty body")
            return

        raw = self.rfile.read(length)

        # Parse multipart or raw wav
        if b"Content-Disposition" in raw or b"multipart" in content_type.encode():
            # multipart: extract file body
            boundary = content_type.split("boundary=")[-1].encode()
            parts = raw.split(b"--" + boundary)
            for p in parts:
                if b"filename=" in p:
                    raw = p.split(b"\r\n\r\n", 1)[-1].rsplit(b"\r\n", 1)[0]
                    break

        try:
            res = model.generate(input=raw, cache={})
            text = res[0].get("text", "") if res else ""
        except Exception as e:
            self.send_error(500, str(e))
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"text": text.strip()}).encode())

print(f"Listening on 0.0.0.0:{PORT}")
HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
