import {
  createRelationship,
  advanceRelationship,
  publicRelationship,
} from "./companion-events.js";
import { getPortraitPreset } from "../src/companion-presets.js";
import { randomUUID, createHash } from "node:crypto";
import { encryptSecret, decryptSecret } from "./security.js";
import { runTransaction } from "./database.js";

export const COMPANION_POLICY = "2026-09-06-companion-v1";
export class CompanionError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code) => {
  throw new CompanionError(status, code);
};
const stamp = () => new Date().toISOString();
const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function cleanText(value, max = 4000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(400, "invalid_text");
  return value.trim();
}
export function validateCharacter(value = {}) {
  if (!Number.isInteger(value.age) || value.age < 18 || value.age > 100)
    fail(400, "adult_character_required");
  return Object.fromEntries(
    [
      "name",
      "age",
      "description",
      "appearance",
      "personality",
      "world",
      "opening",
    ].map((key) => [
      key,
      key === "age"
        ? value.age
        : cleanText(value[key], key === "name" ? 80 : 2500),
    ]),
  );
}
export function validateScenes(value, locale) {
  if (value === undefined)
    return locale === "en"
      ? ["First meeting", "Another day", "A little closer"]
      : ["初次相遇", "再次见面", "更近一些"];
  if (!Array.isArray(value) || value.length !== 3) fail(400, "invalid_scenes");
  return value.map((v) => cleanText(v, 80));
}
export function transition(stage, scene, choice) {
  if (!choice || choice === "stay") return { stage, scene };
  if (stage === "meeting" && choice === "meet-again")
    return { stage: "familiar", scene: 1 };
  if (stage === "familiar" && choice === "share-feelings")
    return { stage: "flirting", scene: 2 };
  if (stage === "flirting" && choice === "confirm")
    return { stage: "together", scene: 2 };
  if (stage === "flirting" && choice === "stay-friends")
    return { stage: "familiar", scene: 2 };
  fail(409, "choice_not_available");
}
function choices(stage, locale, relationship) {
  if (relationship?.ended) return [];
  const en = locale === "en";
  const list =
    stage === "meeting"
      ? [["meet-again", en ? "Suggest meeting again" : "提议下次见面"]]
      : stage === "familiar"
        ? [
            [
              "share-feelings",
              en ? "Talk about our feelings" : "聊聊彼此的心意",
            ],
          ]
        : stage === "flirting"
          ? [
              [
                "confirm",
                en ? "Choose to begin a relationship" : "选择开始一段恋爱",
              ],
              [
                "stay-friends",
                en ? "Stay friends for now" : "暂时保持朋友关系",
              ],
            ]
          : [];
  if (["conflict", "painful"].includes(relationship?.tone)) {
    list.push(
      ["talk-it-through", en ? "Talk it through" : "把分歧说清楚"],
      ["give-space", en ? "Give each other space" : "给彼此一点空间"],
    );
  } else
    list.push(["spend-time", en ? "Share another moment" : "一起经历新的片段"]);
  return [
    ...list,
    ["stay", en ? "Stay in this moment" : "留在此刻"],
    ["end-relationship", en ? "End this relationship" : "结束这段关系"],
  ].map(([id, label]) => ({ id, label }));
}
export class CompanionStore {
  constructor(db, key, { randomSeed = randomUUID } = {}) {
    this.db = db;
    this.key = key;
    this.randomSeed = randomSeed;
  }
  pack(value, userId) {
    return JSON.stringify(
      encryptSecret(JSON.stringify(value), this.key, `companion:${userId}:v1`),
    );
  }
  unpack(value, userId) {
    return JSON.parse(
      decryptSecret(JSON.parse(value), this.key, `companion:${userId}:v1`),
    );
  }
  row(userId, id) {
    return (
      this.db
        .prepare("SELECT * FROM companion_stories WHERE user_id=? AND id=?")
        .get(userId, id) ?? fail(404, "story_not_found")
    );
  }
  current(userId) {
    const row = this.db
      .prepare("SELECT id FROM companion_stories WHERE user_id=?")
      .get(userId);
    return row ? this.get(userId, row.id) : null;
  }
  get(userId, id) {
    const row = this.row(userId, id);
    const data = this.unpack(row.data, userId);
    const turns = this.db
      .prepare(
        "SELECT * FROM companion_turns WHERE user_id=? AND story_id=? ORDER BY rowid",
      )
      .all(userId, id)
      .flatMap((r) => {
        const d = this.unpack(r.data, userId);
        return [
          {
            id: r.id + ":u",
            role: "user",
            content: d.input.text,
            createdAt: r.created_at,
          },
          {
            id: r.id + ":a",
            role: "assistant",
            content: d.reply,
            narration:
              d.event?.narration?.[data.locale === "en" ? "en" : "zh"] ?? null,
            createdAt: r.created_at,
          },
        ];
      });
    const memories = this.db
      .prepare(
        "SELECT * FROM companion_memories WHERE user_id=? AND story_id=? ORDER BY rowid",
      )
      .all(userId, id)
      .map((r) => ({
        id: r.id,
        sourceTurnId: r.source_turn_id,
        content: this.unpack(r.data, userId).content,
        createdAt: r.created_at,
      }));
    const assets = this.db
      .prepare(
        "SELECT id,kind,scene,confirmed FROM companion_assets WHERE user_id=? AND story_id=?",
      )
      .all(userId, id)
      .map((a) => ({
        ...a,
        confirmed: Boolean(a.confirmed),
        url: `/api/companion/assets/${a.id}`,
      }));
    return {
      id,
      revision: row.revision,
      version: row.version,
      ...data,
      relationship: publicRelationship(
        data.relationship ?? createRelationship(id),
      ),
      choices: choices(data.stage, data.locale, data.relationship),
      turns,
      memories,
      assets,
      createdAt: row.created_at,
    };
  }
  create(
    userId,
    character,
    locale = "zh",
    sceneTitles,
    portraitPresetId = null,
  ) {
    if (portraitPresetId !== null && !getPortraitPreset(portraitPresetId))
      fail(400, "invalid_portrait_preset");
    character = validateCharacter(character);
    if (this.current(userId)) fail(409, "story_exists");
    const id = randomUUID();
    const data = {
      character,
      locale: locale === "en" ? "en" : "zh",
      stage: "meeting",
      scene: 0,
      sceneTitles: validateScenes(sceneTitles, locale),
      portraitPresetId,
      relationship: createRelationship(this.randomSeed()),
    };
    this.db
      .prepare(
        "INSERT INTO companion_stories(id,user_id,data,created_at) VALUES(?,?,?,?)",
      )
      .run(id, userId, this.pack(data, userId), stamp());
    return this.get(userId, id);
  }
  setPortraitPreset(userId, id, presetId, expectedVersion) {
    return runTransaction(this.db, () => {
      const row = this.row(userId, id);
      if (presetId !== null && !getPortraitPreset(presetId))
        fail(400, "invalid_portrait_preset");
      if (!Number.isInteger(expectedVersion)) fail(400, "invalid_version");
      if (row.version !== expectedVersion) fail(409, "version_conflict");
      const data = this.unpack(row.data, userId);
      this.db
        .prepare(
          "UPDATE companion_stories SET version=version+1,data=? WHERE id=? AND user_id=?",
        )
        .run(
          this.pack({ ...data, portraitPresetId: presetId }, userId),
          id,
          userId,
        );
      return this.get(userId, id);
    });
  }
  replay(userId, id, input) {
    this.row(userId, id);
    const row = this.db
      .prepare(
        "SELECT * FROM companion_turns WHERE user_id=? AND story_id=? AND client_turn_id=?",
      )
      .get(userId, id, input.clientTurnId);
    if (!row) return null;
    if (row.fingerprint !== fingerprint(input))
      fail(409, "idempotency_conflict");
    return this.unpack(row.data, userId);
  }
  checkTurn(userId, id, input) {
    cleanText(input.clientTurnId, 100);
    cleanText(input.text);
    if (!Number.isInteger(input.expectedVersion)) fail(400, "invalid_version");
    const row = this.row(userId, id);
    if (row.version !== input.expectedVersion) fail(409, "version_conflict");
    this.planTurn(userId, id, input);
    if (
      this.db
        .prepare("SELECT count(*) n FROM companion_turns WHERE story_id=?")
        .get(id).n >= 1000
    )
      fail(409, "story_turn_limit");
  }
  planTurn(userId, id, input) {
    const data = this.unpack(this.row(userId, id).data, userId);
    const relationship = data.relationship ?? createRelationship(id);
    if (relationship.ended) fail(409, "story_ended");
    if (
      input.choiceId &&
      !choices(data.stage, data.locale, relationship).some(
        (c) => c.id === input.choiceId,
      )
    )
      fail(409, "choice_not_available");
    const extra = [
      "spend-time",
      "talk-it-through",
      "give-space",
      "end-relationship",
    ].includes(input.choiceId);
    const next = transition(
      data.stage,
      data.scene,
      extra ? undefined : input.choiceId,
    );
    return {
      ...next,
      relationship: advanceRelationship(relationship, {
        opportunity:
          next.stage !== data.stage || input.choiceId === "spend-time",
        choiceId: input.choiceId,
      }),
    };
  }
  commitTurn(userId, id, input, reply) {
    return runTransaction(this.db, () => {
      this.checkTurn(userId, id, input);
      cleanText(reply, 16000);
      const row = this.row(userId, id);
      const data = this.unpack(row.data, userId);
      const next = this.planTurn(userId, id, input);
      const event =
        next.relationship.event?.id !== data.relationship?.event?.id
          ? next.relationship.event
          : null;
      const turnId = randomUUID();
      const now = stamp();
      this.db
        .prepare(
          "INSERT INTO companion_turns(id,story_id,user_id,client_turn_id,fingerprint,data,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          turnId,
          id,
          userId,
          input.clientTurnId,
          fingerprint(input),
          this.pack({ input, reply, event }, userId),
          now,
        );
      this.db
        .prepare(
          "UPDATE companion_stories SET version=version+1,data=? WHERE id=? AND user_id=?",
        )
        .run(this.pack({ ...data, ...next }, userId), id, userId);
      if (next.stage !== data.stage) {
        const label = choices(data.stage, data.locale).find(
          (c) => c.id === input.choiceId,
        )?.label;
        this.db
          .prepare(
            "INSERT INTO companion_memories(id,story_id,user_id,source_turn_id,data,created_at) VALUES(?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            id,
            userId,
            turnId + ":u",
            this.pack({ content: label }, userId),
            now,
          );
      }
      return this.get(userId, id);
    });
  }
  addMemory(userId, id, content, source) {
    const story = this.get(userId, id);
    cleanText(content, 2000);
    if (!story.turns.some((t) => t.id === source))
      fail(400, "invalid_memory_source");
    if (story.memories.length >= 200) fail(409, "memory_limit");
    this.db
      .prepare(
        "INSERT INTO companion_memories(id,story_id,user_id,source_turn_id,data,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        id,
        userId,
        source,
        this.pack({ content }, userId),
        stamp(),
      );
    return this.get(userId, id);
  }
  editMemory(userId, id, memoryId, content) {
    this.row(userId, id);
    cleanText(content, 2000);
    if (
      !this.db
        .prepare(
          "UPDATE companion_memories SET data=? WHERE id=? AND story_id=? AND user_id=?",
        )
        .run(this.pack({ content }, userId), memoryId, id, userId).changes
    )
      fail(404, "memory_not_found");
    return this.get(userId, id);
  }
  deleteMemory(userId, id, memoryId) {
    this.row(userId, id);
    const memory = this.db
      .prepare(
        "SELECT source_turn_id FROM companion_memories WHERE id=? AND story_id=? AND user_id=?",
      )
      .get(memoryId, id, userId);
    if (memory)
      this.db
        .prepare(
          "INSERT OR IGNORE INTO companion_memory_exclusions(story_id,source_turn_id) VALUES(?,?)",
        )
        .run(id, memory.source_turn_id.split(":")[0]);
    if (
      !this.db
        .prepare(
          "DELETE FROM companion_memories WHERE id=? AND story_id=? AND user_id=?",
        )
        .run(memoryId, id, userId).changes
    )
      fail(404, "memory_not_found");
    return this.get(userId, id);
  }
  contextTurns(userId, id) {
    const story = this.get(userId, id);
    const excluded = new Set(
      this.db
        .prepare(
          "SELECT source_turn_id FROM companion_memory_exclusions WHERE story_id=?",
        )
        .all(id)
        .map((r) => r.source_turn_id),
    );
    return story.turns
      .filter((t) => !excluded.has(t.id.split(":")[0]))
      .slice(-16);
  }
  delete(userId, id) {
    this.row(userId, id);
    this.db
      .prepare("DELETE FROM companion_stories WHERE id=? AND user_id=?")
      .run(id, userId);
  }
}

// Parse only provider text, never tools, markup actions or role changes.
export async function consumeTextStream(response, onText) {
  if (!response.ok || !response.body) fail(502, "text_provider_error");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    output = "",
    finished = false,
    done = false;
  try {
    while (!done) {
      const part = await reader.read();
      buffer += decoder.decode(part.value ?? new Uint8Array(), {
        stream: !part.done,
      });
      if (buffer.length > 128000) fail(502, "stream_frame_too_large");
      buffer = buffer.replace(/\r\n/g, "\n");
      let split;
      while ((split = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const raw = frame
          .split("\n")
          .filter((x) => x.startsWith("data:"))
          .map((x) => x.slice(5).trim())
          .join("\n");
        if (!raw) continue;
        if (raw === "[DONE]") {
          done = true;
          break;
        }
        let event;
        try {
          event = JSON.parse(raw);
        } catch {
          fail(502, "invalid_provider_stream");
        }
        if (event.error) fail(502, "text_provider_error");
        const choice = event.choices?.[0];
        if (choice?.finish_reason === "stop") finished = true;
        else if (choice?.finish_reason) fail(502, "incomplete_provider_stream");
        const text = choice?.delta?.content;
        if (typeof text === "string") {
          output += text;
          if (output.length > 16000) fail(502, "reply_too_large");
          await onText(text);
        }
      }
      if (part.done) break;
    }
    if (!done || !finished || !output.trim())
      fail(502, "incomplete_provider_stream");
    return output;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
