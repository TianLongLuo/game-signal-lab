import test from "node:test";
import assert from "node:assert/strict";

import {
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
