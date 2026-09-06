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

test("voice compatibility wrapper emits only one completed JSON transcript",async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'/api/voice/asr');assert.equal(options.headers.Accept,'application/json');
  const payload=JSON.parse(options.body);assert.equal(payload.stream,undefined);
  return Response.json({text:'你好，继续。'});
 };
 const client=new PlatformClient();client.setCsrfToken('csrf-test');const chunks=[];
 assert.equal(await client.streamTranscribeVoice(new Blob(['wav'],{type:'audio/wav'}),{onText:t=>chunks.push(t)}),'你好，继续。');
 assert.deepEqual(chunks,['你好，继续。']);
 assert.equal(client.synthesizeVoice,undefined);assert.equal(client.streamVoice,undefined);
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
