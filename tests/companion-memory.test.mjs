import test from "node:test";
import assert from "node:assert/strict";
import {
  CompanionMemoryIndex,
  scopedFilter,
} from "../server/companion-memory.js";
test("companion vector filter always scopes user/story/revision and live records", () => {
  assert.deepEqual(scopedFilter(1, "story", 2), {
    must: [
      { key: "user_id", match: { value: "1" } },
      { key: "story_id", match: { value: "story" } },
      { key: "story_revision", match: { value: 2 } },
      { key: "deleted", match: { value: false } },
    ],
  });
});
test("vector hits are not trusted: wrong owner/story, deleted and stale text are rejected", async () => {
  let body;
  const base = {
    ensureReady: async () => {},
    embed: async () => [[1, 0]],
    collection: "test",
    request: async (path, options) => {
      body = JSON.parse(options.body);
      return {
        result: [
          {
            payload: {
              user_id: "2",
              story_id: "s",
              story_revision: 1,
              deleted: false,
              memory_id: "a",
              content: "secret",
            },
          },
          {
            payload: {
              user_id: "1",
              story_id: "s",
              story_revision: 1,
              deleted: false,
              memory_id: "a",
              content: "old",
            },
          },
          {
            payload: {
              user_id: "1",
              story_id: "s",
              story_revision: 1,
              deleted: false,
              memory_id: "b",
              content: "valid",
            },
          },
        ],
      };
    },
  };
  const index = new CompanionMemoryIndex(base);
  const story = {
    id: "s",
    revision: 1,
    memories: [
      { id: "a", content: "edited" },
      { id: "b", content: "valid" },
    ],
  };
  const result = await index.search(1, story, "question");
  assert.deepEqual(result, [{ id: "b", content: "valid" }]);
  assert.deepEqual(body.filter, scopedFilter(1, "s", 1));
});
test("index writes carry isolated scope and memory IDs", async () => {
  const calls = [];
  const base = {
    collection: "private-companion",
    ensureReady: async () => {},
    embed: async (texts) => texts.map(() => [1, 0]),
    request: async (path, options) => {
      calls.push(JSON.parse(options.body));
      return {};
    },
  };
  await new CompanionMemoryIndex(base).replace(1, {
    id: "s",
    revision: 2,
    memories: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        content: "Fictional moment",
      },
    ],
  });
  assert.deepEqual(calls[0].filter, scopedFilter(1, "s", 2));
  assert.equal(calls[1].points[0].payload.story_id, "s");
  assert.equal(calls[1].points[0].payload.deleted, false);
});
