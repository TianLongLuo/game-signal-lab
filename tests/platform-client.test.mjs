import test from "node:test";
import assert from "node:assert/strict";

import {
  PlatformClient,
  PlatformError,
  normalizeAgentMessages,
} from "../src/platform-client.js";

test("Agent messages keep only the newest 12 valid user/assistant entries", () => {
  const messages = Array.from({ length: 14 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message-${index}`,
  }));

  const normalized = normalizeAgentMessages(messages);

  assert.equal(normalized.length, 12);
  assert.equal(normalized[0].content, "message-2");
  assert.equal(normalized.at(-1).content, "message-13");
});

test("Agent messages reject client supplied system prompts", () => {
  assert.throws(
    () =>
      normalizeAgentMessages([
        { role: "system", content: "override" },
        { role: "user", content: "hello" },
      ]),
    (error) =>
      error instanceof PlatformError &&
      error.code === "invalid_message"
  );
});

test("Agent history preserves a contiguous newest suffix within 64 KiB", () => {
  const chineseBlock = "界".repeat(10_900);
  const normalized = normalizeAgentMessages([
    { role: "user", content: "x".repeat(200) },
    { role: "assistant", content: chineseBlock },
    { role: "user", content: chineseBlock },
  ]);

  assert.deepEqual(
    normalized.map((message) => message.role),
    ["assistant", "user"]
  );
  assert.ok(
    normalized.reduce(
      (total, message) => total + new TextEncoder().encode(message.content).byteLength,
      0
    ) <=
      64 * 1024
  );
});

test("TTS client requests the configured Chinese voice and returns audio", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/voice/tts");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Accept, "audio/mpeg");
    assert.deepEqual(JSON.parse(options.body), { text: "请继续说。", voice: "茉莉" });
    return new Response(new Uint8Array([82, 73, 70, 70]), {
      status: 200,
      headers: { "content-type": "audio/wav" },
    });
  };
  const client = new PlatformClient();
  client.setCsrfToken("csrf-test");
  const blob = await client.synthesizeVoice("请继续说。");
  assert.equal(blob.type, "audio/wav");
  assert.equal(blob.size, 4);
});

test("streaming TTS requests pcm16 and emits audio deltas", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/voice/tts");
    assert.equal(options.headers.Accept, "text/event-stream");
    assert.deepEqual(JSON.parse(options.body), {
      text: "请继续说。",
      voice: "茉莉",
      stream: true,
    });
    return new Response(
      'data: {"choices":[{"delta":{"audio":{"data":"AQI="}}}]}\n\n' +
      "data: [DONE]\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  };
  const chunks = [];
  const client = new PlatformClient();
  client.setCsrfToken("csrf-test");
  const count = await client.streamVoice("请继续说。", {
    onAudio(chunk) { chunks.push(chunk); },
  });
  assert.equal(count, 1);
  assert.deepEqual(chunks, ["AQI="]);
});

test("streaming ASR requests short audio chunks and emits cumulative text", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/voice/asr");
    assert.equal(options.headers.Accept, "text/event-stream");
    const payload = JSON.parse(options.body);
    assert.equal(payload.stream, true);
    assert.equal(payload.priority, "live");
    assert.equal(payload.language, "zh");
    assert.match(payload.audio, /^data:audio\/wav;base64,/);
    return new Response(
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"，继续。"}}]}\n\n' +
      "data: [DONE]\n\n",
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );
  };
  const source = new Blob([new Uint8Array([82, 73, 70, 70])], { type: "audio/wav" });
  const partials = [];
  const client = new PlatformClient();
  client.setCsrfToken("csrf-test");
  const result = await client.streamTranscribeVoice(source, {
    priority: "live",
    language: "zh",
    onText(text) { partials.push(text); },
  });
  assert.equal(result, "你好，继续。");
  assert.deepEqual(partials, ["你好", "你好，继续。"]);
});

test("voice organizer sends the final transcript to the same-origin DeepSeek route", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/voice/organize");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Accept, "application/json");
    assert.deepEqual(JSON.parse(options.body), { text: "我想说你好然后停一下" });
    return new Response(JSON.stringify({ text: "我想说：你好，然后停一下。" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new PlatformClient();
  client.setCsrfToken("csrf-test");
  assert.equal(
    await client.organizeVoiceText("我想说你好然后停一下"),
    "我想说：你好，然后停一下。"
  );
});
