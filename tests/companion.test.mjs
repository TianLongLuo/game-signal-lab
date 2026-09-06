import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../server/database.js";
import {
  CompanionStore,
  validateCharacter,
  transition,
  consumeTextStream,
} from "../server/companion.js";
const character = {
  name: "Alex",
  age: 25,
  description: "An adult illustrator",
  appearance: "Short hair",
  personality: "Curious",
  world: "Coastal town",
  opening: "We meet at an exhibition.",
};
function setup(t) {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  for (const id of [1, 2])
    db.prepare(
      "INSERT INTO users(id,username,username_norm,password_hash,role,created_at,updated_at) VALUES (?,?,?,'test','member','now','now')",
    ).run(id, `fiction${id}`, `fiction${id}`);
  return { db, store: new CompanionStore(db, randomBytes(32)) };
}
test("adult character schema is strict and drops injected owner/state", () => {
  assert.throws(() => validateCharacter({ ...character, age: 17 }));
  assert.throws(() => validateCharacter({ ...character, age: "25" }));
  assert.equal(
    validateCharacter({ ...character, userId: 4 }).userId,
    undefined,
  );
});
test("ordinary messages cannot move story; choices follow prerequisites", () => {
  assert.deepEqual(transition("meeting", 0, undefined), {
    stage: "meeting",
    scene: 0,
  });
  assert.throws(() => transition("meeting", 0, "confirm"));
  assert.deepEqual(transition("meeting", 0, "meet-again"), {
    stage: "familiar",
    scene: 1,
  });
  assert.deepEqual(transition("familiar", 1, "share-feelings"), {
    stage: "flirting",
    scene: 2,
  });
  assert.deepEqual(transition("flirting", 2, "stay-friends"), {
    stage: "familiar",
    scene: 2,
  });
});
test("private stories isolate owners and never archive into legacy messages", (t) => {
  const { db, store } = setup(t);
  const story = store.create(1, character, "en");
  assert.throws(() => store.get(2, story.id), /not_found/);
  assert.equal(store.current(2), null);
  assert.throws(() => store.create(1, character, "en"), /story_exists/);
  assert.equal(
    db.prepare("SELECT count(*) n FROM conversation_messages").get().n,
    0,
  );
  const raw = db.prepare("SELECT data FROM companion_stories").get().data;
  assert.ok(!raw.includes("Alex"));
});
test("turn commits are atomic, versioned and idempotent", (t) => {
  const { store } = setup(t);
  let story = store.create(1, character, "en");
  const input = {
    clientTurnId: "fiction-turn-1",
    expectedVersion: 0,
    text: "See you again",
    choiceId: "meet-again",
  };
  assert.equal(store.replay(1, story.id, input), null);
  story = store.commitTurn(1, story.id, input, "I would like that.");
  assert.equal(story.version, 1);
  assert.equal(story.scene, 1);
  assert.equal(story.turns.length, 2);
  assert.equal(store.replay(1, story.id, input).reply, "I would like that.");
  assert.throws(
    () => store.replay(1, story.id, { ...input, text: "different" }),
    /idempotency_conflict/,
  );
  assert.throws(
    () =>
      store.commitTurn(
        1,
        story.id,
        { ...input, clientTurnId: "fiction-turn-2" },
        "No",
      ),
    /version_conflict/,
  );
  assert.equal(store.get(1, story.id).turns.length, 2);
});
test("memories require an actual source, edit/delete affect subsequent context", (t) => {
  const { store } = setup(t);
  let s = store.create(1, character, "en");
  s = store.commitTurn(
    1,
    s.id,
    {
      clientTurnId: "fiction-source",
      expectedVersion: 0,
      text: "I like painting",
    },
    "So do I.",
  );
  assert.throws(() => store.addMemory(1, s.id, "future", "absent"), /source/);
  s = store.addMemory(1, s.id, "We discussed painting", s.turns[0].id);
  const m = s.memories.at(-1);
  assert.throws(() => store.editMemory(2, s.id, m.id, "leak"), /not_found/);
  s = store.editMemory(1, s.id, m.id, "I enjoy painting");
  assert.equal(s.memories.at(-1).content, "I enjoy painting");
  s = store.deleteMemory(1, s.id, m.id);
  assert.ok(!s.memories.some((x) => x.id === m.id));
  store.delete(1, s.id);
  assert.equal(store.current(1), null);
});
test("SSE handles fragmented UTF-8, requires finish marker and bounded output", async () => {
  const encode = new TextEncoder();
  const payload =
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
  const bytes = encode.encode(payload);
  let out = "";
  const response = new Response(
    new ReadableStream({
      start(c) {
        for (const b of bytes) c.enqueue(Uint8Array.of(b));
        c.close();
      },
    }),
  );
  assert.equal(await consumeTextStream(response, (x) => (out += x)), "你好");
  assert.equal(out, "你好");
  await assert.rejects(
    consumeTextStream(
      new Response('data: {"choices":[{"delta":{"content":"half"}}]}\n\n'),
      () => {},
    ),
    /incomplete/,
  );
});

test("deleted memories remove their source pair from model context but preserve visible history", (t) => {
  const { store } = setup(t);
  let s = store.create(1, character, "en", ["Gallery", "Boardwalk", "Studio"]);
  assert.deepEqual(s.sceneTitles, ["Gallery", "Boardwalk", "Studio"]);
  s = store.commitTurn(
    1,
    s.id,
    {
      clientTurnId: "source-removal",
      expectedVersion: 0,
      text: "I enjoy this gallery",
    },
    "Let us look around",
  );
  s = store.addMemory(1, s.id, "Gallery preference", s.turns[0].id);
  store.deleteMemory(1, s.id, s.memories[0].id);
  assert.equal(store.contextTurns(1, s.id).length, 0);
  assert.equal(store.get(1, s.id).turns.length, 2);
});
