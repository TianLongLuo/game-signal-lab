import test from "node:test";
import assert from "node:assert/strict";

import {
  AGE_POLICY_VERSION,
  MAX_BACKUP_BYTES,
  STATE_VERSION,
  createDefaultState,
  inspectStoredState,
  normalizeState,
  parseBackup,
  toPortableState,
} from "../src/state-schema.js";

test("invalid state falls back to a safe empty schema", () => {
  assert.deepEqual(normalizeState(null), createDefaultState());
  assert.deepEqual(normalizeState([]), createDefaultState());
});

test("v1-like data migrates, sanitizes ids, and drops unknown fields", () => {
  const migrated = normalizeState({
    version: 1,
    adultConfirmed: true,
    profile: { name: "测试", voice: "invalid", unknown: "drop" },
    contacts: [
      {
        id: "<script>",
        alias: "A-17",
        stage: "持续了解",
        unknown: "drop",
      },
    ],
    events: [
      {
        id: "event-1",
        contactId: "<script>",
        fact: "对方主动问我是否到家。",
        signals: ["futurePlan", "unknown"],
        analysis: { strength: "<img onerror=alert(1)>" },
      },
    ],
  });

  assert.equal(migrated.version, STATE_VERSION);
  assert.equal(migrated.profile.voice, "natural");
  assert.equal(migrated.contacts[0].id, "contact-1");
  assert.equal(migrated.events[0].contactId, "contact-1");
  assert.deepEqual(migrated.events[0].signals, ["futurePlan"]);
  assert.equal("unknown" in migrated.contacts[0], false);
  assert.equal("analysis" in migrated.events[0], false);
});

test("backup payload imports data and normalizes policy metadata", () => {
  const state = createDefaultState();
  state.adultConfirmed = true;
  state.agePolicyVersion = AGE_POLICY_VERSION;
  state.profile.name = "用户";
  const imported = parseBackup(
    JSON.stringify({
      application: "GAME Signal Lab",
      data: state,
    })
  );

  assert.equal(imported.profile.name, "用户");
  assert.equal(imported.version, STATE_VERSION);
});

test("empty and malformed backups are rejected", () => {
  assert.throws(() => parseBackup("{bad json"), /有效的 JSON/);
  assert.throws(() => parseBackup(JSON.stringify(createDefaultState())), /没有可导入/);
});

test("oversized strings are truncated at schema boundaries", () => {
  const migrated = normalizeState({
    profile: { goal: "x".repeat(1500) },
    contacts: [],
    events: [],
  });
  assert.equal(migrated.profile.goal.length, 1000);
});

test("portable state drops derived analysis and a backup over 1 MB round-trips", () => {
  const state = createDefaultState();
  state.adultConfirmed = true;
  state.agePolicyVersion = AGE_POLICY_VERSION;
  state.contacts = [
    {
      id: "contact-large",
      alias: "大备份测试",
      stage: "持续了解",
      context: "",
      goal: "",
      boundary: "",
      createdAt: new Date(0).toISOString(),
    },
  ];
  state.events = Array.from({ length: 300 }, (_, index) => ({
    id: `event-${index}`,
    contactId: "contact-large",
    date: "2026-07-30",
    stage: "持续了解",
    scene: "虚构测试场景",
    fact: "测".repeat(2000),
    interpretation: "仅用于备份往返测试",
    feeling: "",
    reply: "",
    signals: [],
    boundaryStatus: "clear",
    review: null,
    createdAt: new Date(index * 1000).toISOString(),
    analysis: { shouldNotPersist: true },
  }));

  const portable = toPortableState(state);
  assert.equal("analysis" in portable.events[0], false);

  const payload = JSON.stringify({ application: "GAME Signal Lab", data: portable });
  const byteLength = new TextEncoder().encode(payload).byteLength;
  assert.ok(byteLength > 1_000_000);
  assert.ok(byteLength < MAX_BACKUP_BYTES);
  assert.equal(parseBackup(payload).events.length, 300);
});

test("backup import rejects truncation instead of silently losing data", () => {
  const state = createDefaultState();
  state.profile.name = "可导入";
  state.profile.goal = "x".repeat(1001);

  assert.throws(
    () => parseBackup(JSON.stringify({ data: state })),
    /超过 1000 个字符/
  );
});

test("legacy duplicate aliases are migrated without breaking event links", () => {
  const imported = parseBackup(
    JSON.stringify({
      data: {
        version: 1,
        contacts: [
          { id: "c-1", alias: "A-17" },
          { id: "c-2", alias: "a-17" },
        ],
        events: [
          {
            id: "e-1",
            contactId: "c-2",
            date: "2026-07-30",
            fact: "虚构事件。",
          },
        ],
      },
    })
  );

  assert.deepEqual(
    imported.contacts.map((contact) => contact.alias),
    ["A-17", "a-17 (2)"]
  );
  assert.equal(imported.events[0].contactId, "c-2");
});

test("current duplicate aliases, future versions, and invalid dates are rejected", () => {
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          data: {
            version: STATE_VERSION,
            contacts: [
              { id: "c-1", alias: "A-17" },
              { id: "c-2", alias: "a-17" },
            ],
          },
        })
      ),
    /重复的匿名代号/
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ data: { version: STATE_VERSION + 1, profile: { name: "未来" } } })),
    /更新版本/
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          data: {
            version: STATE_VERSION,
            contacts: [{ id: "c-1", alias: "日期测试" }],
            events: [{ id: "e-1", contactId: "c-1", date: "2026-99-99", fact: "虚构事件。" }],
          },
        })
      ),
    /不是有效日期/
  );
});

test("stored-state inspection blocks lossy, over-capacity, and future migrations", () => {
  const oversized = createDefaultState();
  oversized.version = 1;
  oversized.contacts = Array.from({ length: 501 }, (_, index) => ({
    id: `contact-${index}`,
    alias: `匿名-${index}`,
  }));
  assert.equal(inspectStoredState(oversized).reason, "capacity");

  const lossy = createDefaultState();
  lossy.version = 1;
  lossy.contacts = [{ id: "c-1", alias: "" }];
  assert.equal(inspectStoredState(lossy).reason, "lossy");

  const future = createDefaultState();
  future.version = STATE_VERSION + 1;
  assert.equal(inspectStoredState(future).reason, "future");
});

test("current backups reject unsafe ids, broken links, and invalid enums", () => {
  const invalid = createDefaultState();
  invalid.profile.name = "严格校验";
  invalid.contacts = [{ id: "<unsafe>", alias: "A-17" }];
  assert.throws(() => parseBackup(JSON.stringify(invalid)), /id 无效/);

  invalid.contacts = [{ id: "contact-1", alias: "A-17" }];
  invalid.events = [{
    id: "event-1",
    contactId: "missing-contact",
    fact: "虚构事件。",
    signals: [],
    boundaryStatus: "clear",
  }];
  assert.throws(() => parseBackup(JSON.stringify(invalid)), /没有对应档案/);

  invalid.events[0].contactId = "contact-1";
  invalid.events[0].signals = ["unknown"];
  assert.throws(() => parseBackup(JSON.stringify(invalid)), /无效枚举/);
});
