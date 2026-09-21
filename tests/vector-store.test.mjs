import test from "node:test";
import assert from "node:assert/strict";

import { QdrantVectorStore } from "../server/vector-store.js";

test("Qdrant vector store creates a collection and filters every operation by user_id", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ pathname: parsed.pathname, method, body });
    if (method === "GET") return response(404, {});
    if (parsed.pathname.endsWith("/points/search")) {
      return response(200, {
        result: [
          {
            score: 0.91,
            payload: { user_id: "owner-a", kind: "contact", title: "山茶", content: "咖啡" },
          },
          {
            score: 0.9,
            payload: { user_id: "owner-b", kind: "contact", title: "不应出现", content: "隔离" },
          },
        ],
      });
    }
    return response(200, {});
  };

  const store = new QdrantVectorStore({
    baseUrl: "http://qdrant.test:6333",
    collection: "game_signal_lab",
    dimensions: 64,
    fetchImpl,
  });
  await store.replaceUser("owner-a", [
    { externalId: "contact:1", kind: "contact", title: "山茶", content: "最近喝了咖啡" },
  ]);
  const points = await store.search("owner-a", "山茶最近的约会", 8);
  await store.deleteUser("owner-a");

  const search = calls.find((call) => call.pathname.endsWith("/points/search"));
  const deletion = calls.find((call) => call.pathname.endsWith("/points/delete"));
  const upsert = calls.find((call) => call.pathname.endsWith("/points"));
  assert.equal(upsert.body.points[0].vector.length, 64);
  assert.deepEqual(upsert.body.points[0].payload.user_id, "owner-a");
  assert.deepEqual(search.body.filter, {
    must: [{ key: "user_id", match: { value: "owner-a" } }],
  });
  assert.deepEqual(deletion.body.filter, {
    must: [{ key: "user_id", match: { value: "owner-a" } }],
  });
  assert.equal(points[0].payload.user_id, "owner-a");
});

test("Qdrant configuration is optional outside the Linux vector deployment", () => {
  assert.equal(QdrantVectorStore.fromEnv({}), null);
  assert.throws(
    () => QdrantVectorStore.fromEnv({ VECTOR_DB_URL: "http://qdrant", VECTOR_DIMENSIONS: "8" }),
    /VECTOR_DIMENSIONS/,
  );
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

