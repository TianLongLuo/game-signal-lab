import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeMonoWav,
  extractCompletedSpeechChunks,
  normalizeAssistantText,
} from "../src/voice-utils.js";

test("assistant text removes markdown and decorative quote wrappers", () => {
  const input = "## **重点**\n- “你当时怎么回应的？”\n`继续说`";
  assert.equal(normalizeAssistantText(input), "重点\n你当时怎么回应的？\n继续说");
});

test("streaming speech emits only complete sentences until flush", () => {
  const first = extractCompletedSpeechChunks("第一句。第二句还没说完");
  assert.deepEqual(first.chunks, ["第一句。"]);
  assert.equal(first.remainder, "第二句还没说完");
  const final = extractCompletedSpeechChunks(first.remainder, { flush: true });
  assert.deepEqual(final.chunks, ["第二句还没说完"]);
  assert.equal(final.remainder, "");
});

test("PCM encoder produces a mono 16 kHz WAV accepted by MiMo ASR", async () => {
  const sourceRate = 48_000;
  const samples = new Float32Array(sourceRate / 10);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 440 * index) / sourceRate) * 0.25;
  }
  const blob = encodeMonoWav([samples.subarray(0, 2_000), samples.subarray(2_000)], sourceRate);
  assert.equal(blob.type, "audio/wav");
  const view = new DataView(await blob.arrayBuffer());
  const ascii = (offset, length) => String.fromCharCode(
    ...new Uint8Array(view.buffer, offset, length)
  );
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.ok(view.byteLength > 44);
});
