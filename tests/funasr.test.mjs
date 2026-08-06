import assert from "node:assert/strict";
import test from "node:test";

import {
  createFunAsrConfig,
  normalizeFunAsrBaseUrl,
  normalizeFunAsrWebSocketUrl,
  splitTranscriptForStreaming,
  transcribeWithFunAsr,
} from "../server/app.js";

test("FunASR configuration is optional and restricted to loopback", () => {
  assert.equal(createFunAsrConfig({}), null);
  const config = createFunAsrConfig({
    FUNASR_BASE_URL: "http://127.0.0.1:8000/v1",
    FUNASR_MODEL: "sensevoice",
    FUNASR_TIMEOUT_MS: "15000",
    FUNASR_MAX_CONCURRENCY: "1",
  });
  assert.equal(config.baseUrl.href, "http://127.0.0.1:8000/");
  assert.equal(config.model, "sensevoice");
  assert.equal(config.timeoutMs, 15000);
  assert.equal(config.maxConcurrency, 1);
  assert.throws(
    () => normalizeFunAsrBaseUrl("https://speech.example.com/v1"),
    /loopback HTTP URL/
  );
});

test("FunASR configuration supports the paraformer-online WebSocket runtime", () => {
  const config = createFunAsrConfig({
    FUNASR_WS_URL: "ws://127.0.0.1:10095",
    FUNASR_WS_MODE: "2pass",
    FUNASR_WS_CHUNK_SIZE: "5,10,5",
    FUNASR_WS_CHUNK_INTERVAL: "10",
    FUNASR_TIMEOUT_MS: "15000",
    FUNASR_MAX_CONCURRENCY: "1",
  });
  assert.equal(config.transport, "websocket");
  assert.equal(config.baseUrl.href, "ws://127.0.0.1:10095/");
  assert.deepEqual(config.wsChunkSize, [5, 10, 5]);
  assert.equal(config.wsChunkInterval, 10);
  assert.throws(
    () => normalizeFunAsrWebSocketUrl("ws://speech.example.com:10095"),
    /loopback WebSocket/
  );
});

test("FunASR client sends OpenAI-compatible multipart audio", async () => {
  let captured;
  const transcript = await transcribeWithFunAsr({
    baseUrl: new URL("http://127.0.0.1:8000/"),
    model: "sensevoice",
    timeoutMs: 5000,
    apiKey: "local-test-token",
    bytes: Buffer.from([1, 2, 3, 4]),
    mimeType: "audio/mpeg",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ text: "今天在咖啡店认识了她。" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(transcript, "今天在咖啡店认识了她。");
  assert.equal(captured.url, "http://127.0.0.1:8000/v1/audio/transcriptions");
  assert.equal(captured.options.headers.Authorization, "Bearer local-test-token");
  assert.equal(captured.options.body.get("model"), "sensevoice");
  assert.equal(captured.options.body.get("language"), "zh");
  assert.equal(captured.options.body.get("file").name, "recording.mp3");
});

test("transcript chunks preserve all content in order", () => {
  const source = "第一句比较短。第二句会继续补充，而且不会覆盖前面的内容。";
  const chunks = splitTranscriptForStreaming(source, 8);
  assert.equal(chunks.join(""), source);
  assert.ok(chunks.length > 2);
});

function createMonoWav({ sampleRate = 16_000, sampleCount = 3_200 } = {}) {
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

test("FunASR WebSocket client sends WAV PCM and waits for the final acknowledgement", async () => {
  const wav = createMonoWav();
  let instance;

  class FakeWebSocket {
    constructor(url, protocols) {
      instance = this;
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      this.bufferedAmount = 0;
      this.sent = [];
      this.listeners = new Map();
      queueMicrotask(() => {
        this.readyState = 1;
        this.emit("open", {});
      });
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }

    emit(type, event) {
      for (const listener of this.listeners.get(type) || []) listener(event);
    }

    send(value) {
      this.sent.push(value);
      if (typeof value !== "string") return;
      const payload = JSON.parse(value);
      if (payload.mode) this.mode = payload.mode;
      if (!payload.is_end) return;
      if (this.mode === "online") {
        queueMicrotask(() => this.emit("message", {
          data: JSON.stringify({ mode: "online", text: "你好" }),
        }));
        queueMicrotask(() => this.emit("message", {
          data: JSON.stringify({ mode: "online", text: "你好世界" }),
        }));
      } else {
        queueMicrotask(() => this.emit("message", {
          data: JSON.stringify({ mode: "2pass-offline", text: "今天在咖啡店认识了她。" }),
        }));
      }
      queueMicrotask(() => this.emit("message", {
        data: JSON.stringify({ is_end: true, is_final: true }),
      }));
    }

    close() {
      this.readyState = 3;
      queueMicrotask(() => this.emit("close", {}));
    }
  }

  const transcript = await transcribeWithFunAsr({
    transport: "websocket",
    baseUrl: new URL("ws://127.0.0.1:10095/"),
    timeoutMs: 5000,
    wsMode: "2pass",
    wsChunkSize: [5, 10, 5],
    wsChunkInterval: 10,
    bytes: wav,
    mimeType: "audio/wav",
    webSocketImpl: FakeWebSocket,
  });

  assert.equal(transcript, "今天在咖啡店认识了她。");
  assert.equal(instance.url, "ws://127.0.0.1:10095/");
  assert.deepEqual(instance.protocols, ["binary"]);
  assert.deepEqual(JSON.parse(instance.sent[0]), {
    mode: "2pass",
    chunk_size: [5, 10, 5],
    chunk_interval: 10,
    encoder_chunk_look_back: 4,
    decoder_chunk_look_back: 0,
    audio_fs: 16_000,
    wav_name: "game-signal-lab",
    is_speaking: true,
    itn: true,
  });
  assert.equal(JSON.parse(instance.sent.at(-1)).is_end, true);
  assert.ok(instance.sent.slice(1, -1).some((value) => value instanceof Uint8Array));

  const onlineTranscript = await transcribeWithFunAsr({
    transport: "websocket",
    baseUrl: new URL("ws://127.0.0.1:10095/"),
    timeoutMs: 5000,
    wsMode: "online",
    wsChunkSize: [5, 10, 5],
    wsChunkInterval: 10,
    bytes: wav,
    mimeType: "audio/wav",
    webSocketImpl: FakeWebSocket,
  });
  assert.equal(onlineTranscript, "你好世界");
});

test("FunASR WebSocket client rejects compressed audio instead of hanging", async () => {
  await assert.rejects(
    () => transcribeWithFunAsr({
      transport: "websocket",
      baseUrl: new URL("ws://127.0.0.1:10095/"),
      timeoutMs: 5000,
      bytes: Buffer.from([1, 2, 3]),
      mimeType: "audio/mpeg",
      webSocketImpl: class NeverOpenedWebSocket {},
    }),
    (error) => error?.code === "unsupported_audio_format"
  );
});
