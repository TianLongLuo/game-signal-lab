import assert from "node:assert/strict";
import test from "node:test";

import {
  appendVoiceTranscript,
  encodeMonoWav,
  extractCompletedSpeechChunks,
  extractNewTranscript,
  mergeCumulativeVoiceTranscript,
  normalizeAssistantText,
  reconcileCumulativeAsrText,
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

test("ASR correction preserves text that existed before recording", () => {
  assert.equal(
    appendVoiceTranscript("前面已经记录的事实。", "这是本次新录音"),
    "前面已经记录的事实。这是本次新录音"
  );
  assert.equal(
    mergeCumulativeVoiceTranscript({
      baseText: "前面已经记录的事实。",
      correctedText: "这是本次新录音。",
      requestText: "前面已经记录的事实。这是本次新录音",
      currentText: "前面已经记录的事实。这是本次新录音，后面还在继续说",
    }),
    "前面已经记录的事实。这是本次新录音。后面还在继续说"
  );
});

test("ASR merge removes overlap instead of duplicating corrected text", () => {
  assert.equal(
    appendVoiceTranscript("我们在咖啡店认识", "咖啡店认识以后加了微信"),
    "我们在咖啡店认识以后加了微信"
  );
});

test("a shorter live ASR response cannot erase earlier recognized speech", () => {
  assert.equal(
    reconcileCumulativeAsrText(
      "第一段说我们在地铁站认识，第二段说她给了二维码",
      "第二段说她给了二维码，后来互相加了微信"
    ),
    "第一段说我们在地铁站认识，第二段说她给了二维码，后来互相加了微信"
  );
  assert.equal(
    reconcileCumulativeAsrText("已经识别出的完整内容", "已经识别"),
    "已经识别出的完整内容"
  );
});

test("extractNewTranscript returns only the genuinely new tail", () => {
  assert.equal(
    extractNewTranscript("前面识别过的文字", "前面识别过的文字，后面新说的内容"),
    "，后面新说的内容"
  );
  assert.equal(
    extractNewTranscript("第一句，第二句", "第二句"),
    ""
  );
  assert.equal(
    extractNewTranscript("", "全新的识别结果"),
    "全新的识别结果"
  );
  assert.equal(
    extractNewTranscript("已识别内容", ""),
    ""
  );
});

test("extractNewTranscript handles overlapping suffix/prefix", () => {
  assert.equal(
    extractNewTranscript("我们在咖啡店认识", "认识以后加了微信"),
    "以后加了微信"
  );
});

test("PCM encoder produces a mono 16 kHz WAV accepted by local FunASR", async () => {
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
