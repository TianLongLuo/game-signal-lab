import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "./index.js";

const ORIGIN = "https://game.example";
const MASTER_KEY = "11".repeat(32);
const CONSENT_POLICY = "2026-07-30-v1";

class TestD1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) || null;
  }

  async all() {
    return { results: this.database.prepare(this.sql).all(...this.values) };
  }

  async run() {
    return this.database.prepare(this.sql).run(...this.values);
  }
}

class TestD1 {
  constructor(schema) {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(schema);
  }

  prepare(sql) {
    return new TestD1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function createHarness() {
  const schema = await readFile(
    new URL("../drizzle/0000_sites_runtime.sql", import.meta.url),
    "utf8"
  );
  const pending = [];
  return {
    DB: new TestD1(schema),
    env: {
      DB: null,
      ADMIN_BOOTSTRAP_USERNAME: "Drac",
      ADMIN_BOOTSTRAP_PASSWORD: "test-pass",
      CONFIG_MASTER_KEY: MASTER_KEY,
    },
    ctx: {
      waitUntil(promise) {
        pending.push(promise);
      },
    },
    pending,
  };
}

async function preauth(env, ctx) {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/csrf`),
    env,
    ctx
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  return { token: payload.csrfToken, cookie };
}

async function login(env, ctx, username, password, ip = "203.0.113.10") {
  const csrf = await preauth(env, ctx);
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Cookie: csrf.cookie,
        "CF-Connecting-IP": ip,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify({ username, password }),
    }),
    env,
    ctx
  );
  const payload = await response.json();
  const cookie = response.headers
    .getSetCookie()
    .filter((value) => !value.includes("Max-Age=0"))
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  return { response, payload, cookie };
}

async function register(
  env,
  ctx,
  username,
  password,
  ip = "203.0.113.20"
) {
  const csrf = await preauth(env, ctx);
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/register`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Cookie: csrf.cookie,
        "CF-Connecting-IP": ip,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify({ username, password }),
    }),
    env,
    ctx
  );
  const payload = await response.json();
  const cookie = response.headers
    .getSetCookie()
    .filter((value) => !value.includes("Max-Age=0"))
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  return { response, payload, cookie };
}

function sessionHeaders(session) {
  return {
    Origin: ORIGIN,
    Cookie: session.cookie,
    "Content-Type": "application/json",
    "X-CSRF-Token": session.payload.csrfToken,
  };
}

async function api(env, ctx, path, session, options = {}) {
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: options.method || "GET",
      headers:
        options.method && options.method !== "GET"
          ? sessionHeaders(session)
          : { Cookie: session.cookie },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    env,
    ctx
  );
}

test("health endpoint is available without touching persistent bindings", async () => {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/health`),
    {},
    { waitUntil() {} }
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    runtime: "sites-worker",
  });
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("robots and sitemap use the deployed request origin", async () => {
  const ctx = { waitUntil() {} };
  const robots = await worker.fetch(
    new Request(`${ORIGIN}/robots.txt`),
    {},
    ctx
  );
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type"), /^text\/plain/);
  assert.equal(robots.headers.get("cache-control"), "public, max-age=3600");
  assert.match(await robots.text(), /Sitemap: https:\/\/game\.example\/sitemap\.xml/);

  const sitemap = await worker.fetch(
    new Request(`${ORIGIN}/sitemap.xml`),
    {},
    ctx
  );
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type"), /^application\/xml/);
  assert.match(await sitemap.text(), /<loc>https:\/\/game\.example\/<\/loc>/);
});

test("unknown API routes do not fall through to static assets", async () => {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/not-real`),
    {
      ASSETS: {
        fetch() {
          throw new Error("static fallback must not run");
        },
      },
    },
    { waitUntil() {} }
  );
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "not_found");
});

test("unsafe auth requests require exact Origin and signed double-submit CSRF", async () => {
  const harness = await createHarness();
  harness.env.DB = harness.DB;
  const csrf = await preauth(harness.env, harness.ctx);
  const body = JSON.stringify({ username: "Drac", password: "test-pass" });

  const missingOrigin = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: {
        Cookie: csrf.cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf.token,
      },
      body,
    }),
    harness.env,
    harness.ctx
  );
  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json()).error.code, "origin_denied");

  const missingCsrf = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body,
    }),
    harness.env,
    harness.ctx
  );
  assert.equal(missingCsrf.status, 403);
  assert.equal((await missingCsrf.json()).error.code, "preauth_csrf_invalid");

  const wrongCsrf = await worker.fetch(
    new Request(`${ORIGIN}/api/admin/v1/session`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Cookie: "__Host-game_pre_csrf=wrong.token.signature",
        "Content-Type": "application/json",
        "X-CSRF-Token": "wrong.token.signature",
      },
      body: JSON.stringify({ email: "Drac", password: "test-pass" }),
    }),
    harness.env,
    harness.ctx
  );
  assert.equal(wrongCsrf.status, 403);
  assert.equal((await wrongCsrf.json()).error.code, "preauth_csrf_invalid");

  const crossOrigin = await worker.fetch(
    new Request(`${ORIGIN}/api/auth/register`, {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        Cookie: csrf.cookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf.token,
      },
      body: JSON.stringify({
        username: "member-one",
        password: "long-test-password",
      }),
    }),
    harness.env,
    harness.ctx
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "origin_denied");
});

test("admin failures remain non-indexable", async () => {
  const response = await worker.fetch(
    new Request(`${ORIGIN}/api/admin/v1/session`),
    {},
    { waitUntil() {} }
  );
  assert.equal(response.status, 503);
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive"
  );
});

test("admin users use complete cursor pagination and SQL filtering", async () => {
  const harness = await createHarness();
  harness.env.DB = harness.DB;
  const admin = await login(
    harness.env,
    harness.ctx,
    "Drac",
    "test-pass",
    "203.0.113.29"
  );
  assert.equal(admin.response.status, 200);

  const insertUser = harness.DB.database.prepare(
    `INSERT INTO users
      (id, username, username_norm, email, password_hash, password_salt,
       password_iterations, role, version, must_change_password, disabled_at,
       created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'unused', 'unused', 1, 'member', 1, 0, NULL, ?, ?)`
  );
  const insertMembership = harness.DB.database.prepare(
    `INSERT INTO memberships
      (user_id, plan, status, expires_at, created_at, updated_at)
     VALUES (?, 'free', 'active', NULL, ?, ?)`
  );
  harness.DB.database.exec("BEGIN");
  try {
    for (let index = 0; index < 105; index += 1) {
      const id = `usr_page_${String(index).padStart(3, "0")}`;
      const username = `page-user-${String(index).padStart(3, "0")}`;
      const createdAt = new Date(
        Date.UTC(2026, 0, 1, 0, 0, index)
      ).toISOString();
      insertUser.run(id, username, username, createdAt, createdAt);
      insertMembership.run(id, createdAt, createdAt);
    }
    harness.DB.database.exec("COMMIT");
  } catch (error) {
    harness.DB.database.exec("ROLLBACK");
    throw error;
  }

  const seen = new Set();
  let cursor = null;
  let total = null;
  do {
    const params = new URLSearchParams({ limit: "40" });
    if (cursor) params.set("cursor", cursor);
    const response = await api(
      harness.env,
      harness.ctx,
      `/api/admin/v1/users?${params}`,
      admin
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    total = payload.total;
    for (const item of payload.items) {
      assert.equal(seen.has(item.id), false);
      seen.add(item.id);
    }
    cursor = payload.nextCursor;
  } while (cursor);
  assert.equal(total, 106);
  assert.equal(seen.size, 106);

  const filtered = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/users?query=page-user-104&limit=10",
    admin
  );
  assert.equal(filtered.status, 200);
  const filteredPayload = await filtered.json();
  assert.equal(filteredPayload.total, 1);
  assert.equal(filteredPayload.items[0].alias, "page-user-104");

  const invalidCursor = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/users?cursor=not-a-cursor",
    admin
  );
  assert.equal(invalidCursor.status, 400);
  assert.equal((await invalidCursor.json()).error.code, "INVALID_CURSOR");
});

test("authorization matrix requires global policy and admin or active unexpired granted member", async () => {
  const harness = await createHarness();
  harness.env.DB = harness.DB;
  const admin = await login(
    harness.env,
    harness.ctx,
    "Drac",
    "test-pass",
    "203.0.113.30"
  );
  assert.equal(admin.response.status, 200);
  assert.equal(admin.payload.user.mustChangePassword, true);

  let me = await api(harness.env, harness.ctx, "/api/me", admin);
  assert.equal((await me.json()).capabilities.agent, false);

  const missingAccessCsrf = await worker.fetch(
    new Request(`${ORIGIN}/api/admin/v1/integrations/deepseek/access`, {
      method: "PATCH",
      headers: {
        Origin: ORIGIN,
        Cookie: admin.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ globalEnabled: true }),
    }),
    harness.env,
    harness.ctx
  );
  assert.equal(missingAccessCsrf.status, 403);
  assert.equal((await missingAccessCsrf.json()).error.code, "csrf_invalid");

  const crossOriginAccess = await worker.fetch(
    new Request(`${ORIGIN}/api/admin/v1/integrations/deepseek/access`, {
      method: "PATCH",
      headers: {
        ...sessionHeaders(admin),
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ globalEnabled: true }),
    }),
    harness.env,
    harness.ctx
  );
  assert.equal(crossOriginAccess.status, 403);
  assert.equal((await crossOriginAccess.json()).error.code, "origin_denied");

  let global = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek/access",
    admin,
    { method: "PATCH", body: { globalEnabled: true } }
  );
  assert.equal(global.status, 200);
  assert.deepEqual(await global.json(), { globalEnabled: true });
  const globalRead = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek/access",
    admin
  );
  assert.equal(globalRead.status, 200);
  assert.deepEqual(await globalRead.json(), { globalEnabled: true });
  const globalAudit = await harness.DB.prepare(
    "SELECT action FROM audit_events WHERE resource_type = 'agent_access_policy' AND resource_id = 'global' LIMIT 1"
  ).first();
  assert.equal(globalAudit.action, "agent.global.enable");
  me = await api(harness.env, harness.ctx, "/api/me", admin);
  assert.equal((await me.json()).capabilities.agent, true);

  const member = await register(
    harness.env,
    harness.ctx,
    "member-one",
    "long-test-password",
    "203.0.113.31"
  );
  assert.equal(member.response.status, 201);
  me = await api(harness.env, harness.ctx, "/api/me", member);
  assert.equal((await me.json()).capabilities.agent, false);

  const memberId = member.payload.user.id;
  const freeTextReason = await api(
    harness.env,
    harness.ctx,
    `/api/admin/v1/users/${encodeURIComponent(memberId)}/entitlements`,
    admin,
    {
      method: "PATCH",
      body: {
        agentEnabled: true,
        expectedVersion: 1,
        reason: "free text is not accepted",
      },
    }
  );
  assert.equal(freeTextReason.status, 422);
  assert.equal(
    (await freeTextReason.json()).error.code,
    "INVALID_REASON_CODE"
  );
  const membershipGrant = await api(
    harness.env,
    harness.ctx,
    `/api/admin/v1/users/${encodeURIComponent(memberId)}/entitlements`,
    admin,
    {
      method: "PATCH",
      body: {
        membershipEnabled: true,
        expectedVersion: 1,
        reasonCode: "membership_approved",
      },
    }
  );
  assert.equal(membershipGrant.status, 200);
  const agentGrant = await api(
    harness.env,
    harness.ctx,
    `/api/admin/v1/users/${encodeURIComponent(memberId)}/entitlements`,
    admin,
    {
      method: "PATCH",
      body: {
        agentEnabled: true,
        expectedVersion: 2,
        reasonCode: "agent_approved",
      },
    }
  );
  assert.equal(agentGrant.status, 200);
  const grantAudit = await harness.DB.prepare(
    "SELECT reason_code FROM audit_events WHERE resource_id = ? AND action = 'user.agent.enable' LIMIT 1"
  )
    .bind(memberId)
    .first();
  assert.equal(grantAudit.reason_code, "agent_approved");
  me = await api(harness.env, harness.ctx, "/api/me", member);
  assert.equal((await me.json()).capabilities.agent, true);

  await harness.DB.prepare(
    "UPDATE memberships SET expires_at = ? WHERE user_id = ?"
  )
    .bind("2020-01-01T00:00:00.000Z", memberId)
    .run();
  me = await api(harness.env, harness.ctx, "/api/me", member);
  assert.equal((await me.json()).capabilities.agent, false);

  const expiredAdminUsers = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/users?limit=100",
    admin
  );
  assert.equal(expiredAdminUsers.status, 200);
  const expiredAdminPayload = await expiredAdminUsers.json();
  const expiredMember = expiredAdminPayload.items.find(
    (item) => item.id === memberId
  );
  assert.equal(expiredMember.membershipEnabled, false);
  assert.equal(expiredMember.expiresAt, "2020-01-01T00:00:00.000Z");

  await harness.DB.prepare(
    "UPDATE memberships SET expires_at = NULL WHERE user_id = ?"
  )
    .bind(memberId)
    .run();
  global = await api(
    harness.env,
    harness.ctx,
    "/api/admin/deepseek/access/global",
    admin,
    { method: "PUT", body: { enabled: false } }
  );
  assert.equal(global.status, 200);
  me = await api(harness.env, harness.ctx, "/api/me", member);
  assert.equal((await me.json()).capabilities.agent, false);
  me = await api(harness.env, harness.ctx, "/api/me", admin);
  assert.equal((await me.json()).capabilities.agent, false);
});

test("Agent requires current explicit consent and filters provider SSE", async () => {
  const harness = await createHarness();
  harness.env.DB = harness.DB;
  const admin = await login(
    harness.env,
    harness.ctx,
    "Drac",
    "test-pass",
    "203.0.113.40"
  );
  assert.equal(admin.response.status, 200);

  const global = await api(
    harness.env,
    harness.ctx,
    "/api/admin/deepseek/access/global",
    admin,
    { method: "PUT", body: { enabled: true } }
  );
  assert.equal(global.status, 200);

  const defaultConfig = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek",
    admin
  );
  assert.equal(defaultConfig.status, 200);
  assert.equal((await defaultConfig.json()).model, "deepseek-v4-flash");

  const editableBase = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek",
    admin,
    {
      method: "PATCH",
      body: {
        enabled: true,
        baseUrl: "https://api.deepseek.com/",
        model: "deepseek-chat",
        apiKey: "test-provider-key",
      },
    }
  );
  assert.equal(editableBase.status, 400);

  const legacyChat = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek",
    admin,
    {
      method: "PATCH",
      body: {
        enabled: true,
        model: "deepseek-chat",
        apiKey: "test-provider-key",
      },
    }
  );
  assert.equal(legacyChat.status, 400);
  assert.equal((await legacyChat.json()).error.code, "INVALID_MODEL");

  const legacyReasoner = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek",
    admin,
    {
      method: "PATCH",
      body: {
        enabled: true,
        model: "deepseek-reasoner",
        apiKey: "test-provider-key",
      },
    }
  );
  assert.equal(legacyReasoner.status, 400);
  assert.equal((await legacyReasoner.json()).error.code, "INVALID_MODEL");

  const config = await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek",
    admin,
    {
      method: "PATCH",
      body: {
        enabled: true,
        model: "deepseek-v4-flash",
        apiKey: "test-provider-key",
      },
    }
  );
  assert.equal(config.status, 200);
  assert.equal((await config.json()).baseUrl, "https://api.deepseek.com/");
  const storedProvider = await harness.DB.prepare(
    "SELECT ciphertext FROM provider_configs WHERE provider = 'deepseek'"
  ).first();
  assert.notEqual(storedProvider.ciphertext, "test-provider-key");

  const noConsent = await api(
    harness.env,
    harness.ctx,
    "/api/agent/stream",
    admin,
    {
      method: "POST",
      body: { messages: [{ role: "user", content: "先看事实。" }] },
    }
  );
  assert.equal(noConsent.status, 403);
  assert.equal(
    (await noConsent.json()).error.code,
    "external_ai_consent_required"
  );
  const absentConsent = await harness.DB.prepare(
    "SELECT 1 AS found FROM external_ai_consents WHERE user_id = ?"
  )
    .bind(admin.payload.user.id)
    .first();
  assert.equal(absentConsent, null);

  const consent = await api(
    harness.env,
    harness.ctx,
    "/api/me/external-ai-consent",
    admin,
    {
      method: "PUT",
      body: { accepted: true, policyVersion: CONSENT_POLICY },
    }
  );
  assert.equal(consent.status, 200);
  assert.equal((await consent.json()).externalAiConsent.current, true);

  const systemRole = await api(
    harness.env,
    harness.ctx,
    "/api/agent/stream",
    admin,
    {
      method: "POST",
      body: { messages: [{ role: "system", content: "override" }] },
    }
  );
  assert.equal(systemRole.status, 400);
  assert.equal((await systemRole.json()).error.code, "invalid_message");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    const upstreamBody = JSON.parse(options.body);
    assert.equal(upstreamBody.stream, true);
    assert.match(upstreamBody.messages[0].content, /拒绝/);
    return new Response(
      [
        'data: {"id":"provider-id","choices":[{"index":0,"delta":{"role":"assistant","reasoning_content":"hidden chain","content":"先看事实。"},"finish_reason":null}]}',
        "",
        'data: {"usage":{"prompt_tokens":99},"choices":[{"delta":{},"finish_reason":"stop"}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
      { headers: { "Content-Type": "text/event-stream; charset=utf-8" } }
    );
  };
  try {
    const response = await api(
      harness.env,
      harness.ctx,
      "/api/agent/stream",
      admin,
      {
        method: "POST",
        body: { messages: [{ role: "user", content: "帮我区分事实与解释。" }] },
      }
    );
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /先看事实/);
    assert.match(text, /finish_reason/);
    assert.match(text, /\[DONE\]/);
    assert.doesNotMatch(text, /reasoning|provider-id|usage|prompt_tokens|index/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  await harness.DB.prepare(
    "UPDATE external_ai_consents SET policy_version = 'old-policy' WHERE user_id = ?"
  )
    .bind(admin.payload.user.id)
    .run();
  const staleMe = await api(harness.env, harness.ctx, "/api/me", admin);
  assert.equal((await staleMe.json()).externalAiConsent.current, false);
  const staleConsent = await api(
    harness.env,
    harness.ctx,
    "/api/agent/stream",
    admin,
    {
      method: "POST",
      body: { messages: [{ role: "user", content: "test" }] },
    }
  );
  assert.equal(staleConsent.status, 403);
  assert.equal(
    (await staleConsent.json()).error.code,
    "external_ai_consent_required"
  );

  await Promise.all(harness.pending);
  const auditSchema = await harness.DB.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audit_events'"
  ).first();
  assert.doesNotMatch(
    auditSchema.sql,
    /prompt|message|content|ip_hash|user_agent_hash/i
  );
});

test("provider stream without DONE fails closed", async () => {
  const harness = await createHarness();
  harness.env.DB = harness.DB;
  const admin = await login(
    harness.env,
    harness.ctx,
    "Drac",
    "test-pass",
    "203.0.113.50"
  );
  await api(
    harness.env,
    harness.ctx,
    "/api/admin/deepseek/access/global",
    admin,
    { method: "PUT", body: { enabled: true } }
  );
  await api(
    harness.env,
    harness.ctx,
    "/api/admin/v1/integrations/deepseek",
    admin,
    {
      method: "PATCH",
      body: {
        enabled: true,
        model: "deepseek-v4-pro",
        apiKey: "test-provider-key",
      },
    }
  );
  await api(
    harness.env,
    harness.ctx,
    "/api/me/external-ai-consent",
    admin,
    {
      method: "PUT",
      body: { accepted: true, policyVersion: CONSENT_POLICY },
    }
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
      { headers: { "Content-Type": "text/event-stream" } }
    );
  try {
    const response = await api(
      harness.env,
      harness.ctx,
      "/api/agent/stream",
      admin,
      {
        method: "POST",
        body: { messages: [{ role: "user", content: "test" }] },
      }
    );
    assert.equal(response.status, 200);
    await assert.rejects(response.text(), /模型流未完整结束/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registration is rate-limited in a dedicated expiring table", async () => {
  const harness = await createHarness();
  harness.env.DB = harness.DB;
  let last;
  for (let index = 0; index < 6; index += 1) {
    last = await register(
      harness.env,
      harness.ctx,
      "rate-user",
      "long-test-password",
      "203.0.113.60"
    );
  }
  assert.equal(last.response.status, 429);
  assert.equal(last.payload.error.code, "rate_limited");
  const table = await harness.DB.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_rate_limits'"
  ).first();
  assert.match(table.sql, /expires_at/);

  for (let index = 0; index < 11; index += 1) {
    last = await login(
      harness.env,
      harness.ctx,
      "unknown-user",
      "wrong-password",
      "203.0.113.61"
    );
  }
  assert.equal(last.response.status, 429);
  assert.equal(last.payload.error.code, "rate_limited");
});
