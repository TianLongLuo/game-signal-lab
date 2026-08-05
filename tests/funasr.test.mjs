import assert from "node:assert/strict";
import test from "node:test";

import {
  createFunAsrConfig,
  normalizeFunAsrBaseUrl,
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
