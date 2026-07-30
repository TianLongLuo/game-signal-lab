const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PREAUTH_CSRF_TTL_MS = 10 * 60 * 1000;
const PASSWORD_ITERATIONS = 160_000;
const EXTERNAL_AI_POLICY_VERSION = "2026-07-30-v1";
const MAX_JSON_BYTES = 128 * 1024;
const MAX_AGENT_BYTES = 80 * 1024;
const MAX_AGENT_CONTENT_BYTES = 64 * 1024;
const MAX_STREAM_FRAME_BYTES = 64 * 1024;
const MAX_STREAM_OUTPUT_BYTES = 512 * 1024;
const MAX_AUTH_RATE_LIMIT_KEYS = 10_000;
const DEEPSEEK_TIMEOUT_MS = 120_000;
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
const DEEPSEEK_MODELS = new Set([
  DEEPSEEK_DEFAULT_MODEL,
  "deepseek-v4-pro",
]);
const SAFE_FINISH_REASONS = new Set([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
]);
const ENTITLEMENT_REASON_CODES = new Set([
  "membership_approved",
  "membership_revoked",
  "agent_approved",
  "agent_revoked",
  "security_review",
  "account_request",
]);
const ADMIN_USERNAME_DEFAULT = "Drac";
const EMBEDDED_STATIC_ASSETS = null;
const SAFETY_SYSTEM_PROMPT = [
  "你是 GAME 的成年人关系反思助手，只帮助用户区分可观察事实、个人解释与不确定性。",
  "任何明确拒绝、不舒服、停止联系或撤回同意都高于积极信号；必须建议停止推进并尊重边界。",
  "不得提供操控、欺骗、施压、跟踪、绕过拒绝、制造依赖或把隐性信号描述为同意的建议。",
  "同意必须明确、当下、持续、具体且可随时撤回；不推断未表达的想法。",
  "只处理用户本次明确发送的最少必要信息，不索取真实姓名、账号、地址、定位或完整私聊记录。",
].join("\n");

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      const pathname = new URL(request.url).pathname;
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : "internal_error";
      const message =
        error instanceof HttpError
          ? error.message
          : "服务暂时不可用，请稍后重试。";
      return json(
        { error: { code, message }, code, message },
        status,
        null,
        {
          admin:
            pathname === "/admin" ||
            pathname.startsWith("/admin/") ||
            pathname.startsWith("/api/admin/"),
        }
      );
    }
  },
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (method === "OPTIONS" && path.startsWith("/api/")) {
    return new Response(null, {
      status: 204,
      headers: secureHeaders({ Allow: "GET, POST, PUT, PATCH, DELETE, OPTIONS" }),
    });
  }

  if (path.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    requireSameOrigin(request);
  }

  if (method === "GET" && path === "/api/health") {
    return json({ ok: true, runtime: "sites-worker" });
  }
  if (method === "GET" && path === "/robots.txt") {
    return publicRobots(url.origin);
  }
  if (method === "GET" && path === "/sitemap.xml") {
    return publicSitemap(url.origin);
  }
  if (method === "GET" && path === "/api/auth/csrf") {
    return issuePreauthCsrf(env);
  }
  if (method === "POST" && path === "/api/auth/register") {
    return register(request, env);
  }
  if (method === "POST" && path === "/api/auth/login") {
    return login(request, env, false);
  }
  if (method === "GET" && path === "/api/me") {
    const auth = await requireAuth(request, env);
    return json(await publicSession(env, auth));
  }
  if (method === "POST" && path === "/api/auth/logout") {
    const auth = await requireAuth(request, env);
    await requireCsrf(request, auth);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(
        auth.session_token_hash
      ),
      auditStatement(
        env,
        request,
        auth.id,
        "auth.logout",
        "session",
        null,
        "success"
      ),
    ]);
    return json(
      { ok: true },
      200,
      clearSessionCookieHeaders()
    );
  }
  if (method === "PUT" && path === "/api/me/external-ai-consent") {
    return updateConsent(request, env);
  }
  if (method === "POST" && path === "/api/agent/stream") {
    return streamAgent(request, env, ctx);
  }

  if (path.startsWith("/api/admin/v1/")) {
    return routeAdminV1(request, env, ctx, path, url);
  }
  if (path.startsWith("/api/admin/")) {
    return routeAdminCompatibility(request, env, ctx, path, url);
  }

  if (path.startsWith("/api/")) {
    throw new HttpError(404, "not_found", "接口不存在。");
  }
  return serveStatic(request, env, path);
}

async function register(request, env) {
  requireBinding(env, "DB");
  await requirePreauthCsrf(request, env);
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  validatePassword(body.password);
  await consumeAuthRateLimit(env, request, "register.ip", null, 5, 60 * 60 * 1000);
  const reserved = normalizeUsername(env.ADMIN_BOOTSTRAP_USERNAME || ADMIN_USERNAME_DEFAULT);
  if (username.normalized === reserved.normalized) {
    throw new HttpError(409, "username_unavailable", "用户名已被使用。");
  }

  const exists = await env.DB.prepare(
    "SELECT 1 AS found FROM users WHERE username_norm = ?"
  )
    .bind(username.normalized)
    .first();
  if (exists) throw new HttpError(409, "username_unavailable", "用户名已被使用。");

  const id = `usr_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const secret = await hashPassword(body.password);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
        (id, username, username_norm, email, password_hash, password_salt,
         password_iterations, role, version, must_change_password, disabled_at,
         created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, 'member', 1, 0, NULL, ?, ?)`
    ).bind(
      id,
      username.display,
      username.normalized,
      secret.hash,
      secret.salt,
      secret.iterations,
      now,
      now
    ),
    env.DB.prepare(
      `INSERT INTO memberships
        (user_id, plan, status, expires_at, created_at, updated_at)
       VALUES (?, 'free', 'active', NULL, ?, ?)`
    ).bind(id, now, now),
  ]);

  const user = await getUser(env, id);
  const session = await issueSession(env, id);
  await audit(env, request, id, "auth.register", "user", id, "success");
  return json(
    {
      user: publicUser(user),
      membership: publicMembership(user),
      csrfToken: session.csrf,
    },
    201,
    session.headers
  );
}

async function login(request, env, adminOnly) {
  requireBinding(env, "DB");
  await requirePreauthCsrf(request, env);
  const body = await readJson(request);
  const rawUsername = body.username ?? body.email;
  const username = normalizeUsername(rawUsername);
  await consumeAuthRateLimit(
    env,
    request,
    "login.ip",
    null,
    10,
    15 * 60 * 1000
  );
  await consumeAuthRateLimit(
    env,
    request,
    "login.account",
    username.normalized,
    10,
    15 * 60 * 1000
  );
  const password = typeof body.password === "string" ? body.password : "";
  let user = await getUserByUsername(env, username.normalized);

  if (!user && isBootstrapAdmin(username, env)) {
    const configured = env.ADMIN_BOOTSTRAP_PASSWORD;
    if (!configured || !(await secretEqual(password, configured))) {
      await burnPasswordWork(password);
      await audit(env, request, null, "auth.login", "session", null, "denied");
      throw new HttpError(401, "invalid_credentials", "用户名或密码错误。");
    }
    user = await createBootstrapAdmin(env, username.display, password);
    await audit(env, request, user.id, "admin.bootstrap", "user", user.id, "success");
  }

  const passwordMatches = user
    ? await verifyPassword(password, user)
    : await burnPasswordWork(password);
  const valid =
    user &&
    !user.disabled_at &&
    (!adminOnly || user.role === "admin") &&
    passwordMatches;
  if (!valid) {
    await audit(env, request, user?.id ?? null, "auth.login", "session", null, "denied");
    throw new HttpError(401, "invalid_credentials", "用户名或密码错误。");
  }

  const session = await issueSession(env, user.id);
  await audit(env, request, user.id, "auth.login", "session", null, "success");
  if (adminOnly) {
    return json(
      adminSessionPayload(user, session.csrf),
      200,
      session.headers,
      { admin: true }
    );
  }
  return json(
    {
      user: publicUser(user),
      membership: publicMembership(user),
      csrfToken: session.csrf,
    },
    200,
    session.headers
  );
}

async function createBootstrapAdmin(env, enteredUsername, password) {
  const canonical = env.ADMIN_BOOTSTRAP_USERNAME || ADMIN_USERNAME_DEFAULT;
  const id = `adm_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const secret = await hashPassword(password);
  const email =
    typeof env.ADMIN_BOOTSTRAP_EMAIL === "string" && env.ADMIN_BOOTSTRAP_EMAIL.includes("@")
      ? env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase()
      : null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users
        (id, username, username_norm, email, password_hash, password_salt,
         password_iterations, role, version, must_change_password, disabled_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 1, ?, NULL, ?, ?)`
    ).bind(
      id,
      canonical || enteredUsername,
      normalizeUsername(canonical || enteredUsername).normalized,
      email,
      secret.hash,
      secret.salt,
      secret.iterations,
      password.length < 12 ? 1 : 0,
      now,
      now
    ),
    env.DB.prepare(
      `INSERT INTO memberships
        (user_id, plan, status, expires_at, created_at, updated_at)
       VALUES (?, 'member', 'active', NULL, ?, ?)`
    ).bind(id, now, now),
    env.DB.prepare(
      `INSERT INTO agent_member_grants
        (user_id, enabled, updated_at, updated_by)
       VALUES (?, 1, ?, ?)`
    ).bind(id, now, id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO agent_access_policy
        (singleton_id, global_enabled, updated_at, updated_by)
       VALUES (1, 0, ?, ?)`
    ).bind(now, id),
  ]);
  return getUser(env, id);
}

async function updateConsent(request, env) {
  const auth = await requireAuth(request, env);
  await requireCsrf(request, auth);
  const body = await readJson(request);
  if (typeof body.accepted !== "boolean") {
    throw new HttpError(400, "invalid_consent", "accepted 必须是布尔值。");
  }
  if (body.accepted && body.policyVersion !== EXTERNAL_AI_POLICY_VERSION) {
    throw new HttpError(409, "consent_policy_changed", "数据处理说明已更新，请重新确认。");
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO external_ai_consents
        (user_id, policy_version, consented_at, revoked_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         policy_version = excluded.policy_version,
         consented_at = excluded.consented_at,
         revoked_at = excluded.revoked_at,
         updated_at = excluded.updated_at`
    ).bind(
      auth.id,
      EXTERNAL_AI_POLICY_VERSION,
      body.accepted ? now : null,
      body.accepted ? null : now,
      now
    ),
    auditStatement(
      env,
      request,
      auth.id,
      body.accepted ? "external_ai.consent" : "external_ai.revoke",
      "user",
      auth.id,
      "success"
    ),
  ]);
  const refreshed = await getUser(env, auth.id);
  return json({
    externalAiConsent: publicConsent(refreshed),
    capabilities: { agent: await hasAgentAccess(env, refreshed) },
  });
}

async function streamAgent(request, env, ctx) {
  const auth = await requireAuth(request, env);
  await requireCsrf(request, auth);
  if (!(await hasAgentAccess(env, auth))) {
    ctx.waitUntil(
      audit(env, request, auth.id, "agent.stream", "agent", null, "denied")
    );
    throw new HttpError(403, "agent_access_denied", "当前会员未获得 Agent 使用权限。");
  }
  if (!publicConsent(auth).current) {
    ctx.waitUntil(
      audit(env, request, auth.id, "agent.stream", "agent", null, "denied")
    );
    throw new HttpError(
      403,
      "external_ai_consent_required",
      "请先确认当前版本的外部 AI 数据处理说明。"
    );
  }
  const input = validateAgentInput(await readJson(request, MAX_AGENT_BYTES));
  const config = await env.DB.prepare(
    `SELECT provider, enabled, model, ciphertext, iv
     FROM provider_configs WHERE provider = 'deepseek'`
  ).first();
  if (
    !config?.enabled ||
    !config.ciphertext ||
    !config.iv ||
    !DEEPSEEK_MODELS.has(config.model)
  ) {
    throw new HttpError(503, "agent_not_configured", "Agent 服务尚未配置。");
  }

  const apiKey = await decryptProviderKey(env, config);
  const endpoint = new URL("chat/completions", DEEPSEEK_BASE_URL);
  const abortController = new AbortController();
  const abortFromClient = () => abortController.abort();
  if (request.signal.aborted) abortController.abort();
  else request.signal.addEventListener("abort", abortFromClient, { once: true });
  const timeoutId = setTimeout(() => abortController.abort(), DEEPSEEK_TIMEOUT_MS);

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: abortController.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        messages: [
          { role: "system", content: SAFETY_SYSTEM_PROMPT },
          ...input.messages,
        ],
      }),
    });
  } catch {
    clearTimeout(timeoutId);
    request.signal.removeEventListener("abort", abortFromClient);
    ctx.waitUntil(
      audit(env, request, auth.id, "agent.stream", "provider", "deepseek", "failure")
    );
    throw new HttpError(502, "provider_error", "模型服务暂时没有完成请求。");
  }

  if (
    !upstream.ok ||
    !upstream.body ||
    !String(upstream.headers.get("content-type") || "")
      .toLowerCase()
      .startsWith("text/event-stream")
  ) {
    clearTimeout(timeoutId);
    request.signal.removeEventListener("abort", abortFromClient);
    abortController.abort();
    ctx.waitUntil(
      audit(env, request, auth.id, "agent.stream", "provider", "deepseek", "failure")
    );
    throw new HttpError(502, "provider_error", "模型服务暂时没有完成请求。");
  }

  const sanitized = sanitizeProviderSse(upstream.body, {
    abortController,
    cleanup() {
      clearTimeout(timeoutId);
      request.signal.removeEventListener("abort", abortFromClient);
    },
    onComplete(success) {
      ctx.waitUntil(
        audit(
          env,
          request,
          auth.id,
          "agent.stream",
          "provider",
          "deepseek",
          success ? "success" : "failure"
        )
      );
    },
  });
  return withSecurity(
    new Response(sanitized, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  );
}

function sanitizeProviderSse(source, options) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let outputBytes = 0;
  let sawDone = false;

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();
      let completed = false;
      try {
        while (!sawDone) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          await drainFrames(controller);
          if (done) {
            if (buffer.trim()) emitFrame(buffer, controller);
            buffer = "";
            break;
          }
          if (
            encoder.encode(buffer).byteLength > MAX_STREAM_FRAME_BYTES &&
            !findSseSeparator(buffer)
          ) {
            throw new Error("provider frame exceeded limit");
          }
        }
        if (!sawDone) throw new Error("provider stream ended without DONE");
        completed = true;
        controller.close();
      } catch {
        options.abortController.abort();
        controller.error(new Error("模型流未完整结束。"));
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        options.cleanup();
        options.onComplete(completed);
      }
    },
  });

  async function drainFrames(controller) {
    while (true) {
      const separator = findSseSeparator(buffer);
      if (!separator) return;
      const frame = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator.length);
      emitFrame(frame, controller);
      if (sawDone) return;
    }
  }

  function emitFrame(frame, controller) {
    if (encoder.encode(frame).byteLength > MAX_STREAM_FRAME_BYTES) {
      throw new Error("provider frame exceeded limit");
    }
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return;
    if (data === "[DONE]") {
      enqueue("data: [DONE]\n\n", controller);
      sawDone = true;
      return;
    }

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      throw new Error("provider sent malformed JSON");
    }
    const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
    const delta =
      choice?.delta && typeof choice.delta === "object" ? choice.delta : null;
    if (!delta) return;
    const cleanDelta = {};
    if (delta.role !== undefined) {
      if (delta.role !== "assistant") {
        throw new Error("provider emitted an unexpected role");
      }
      cleanDelta.role = "assistant";
    }
    if (typeof delta.content === "string" && delta.content) {
      cleanDelta.content = delta.content;
    }
    const finishReason = SAFE_FINISH_REASONS.has(choice.finish_reason)
      ? choice.finish_reason
      : null;
    if (!Object.keys(cleanDelta).length && !finishReason) return;
    const cleanChoice = { delta: cleanDelta };
    if (finishReason) cleanChoice.finish_reason = finishReason;
    enqueue(
      `data: ${JSON.stringify({ choices: [cleanChoice] })}\n\n`,
      controller
    );
  }

  function enqueue(value, controller) {
    const bytes = encoder.encode(value);
    outputBytes += bytes.byteLength;
    if (outputBytes > MAX_STREAM_OUTPUT_BYTES) {
      throw new Error("sanitized stream exceeded output limit");
    }
    controller.enqueue(bytes);
  }
}

function findSseSeparator(value) {
  const match = /\r?\n\r?\n/.exec(value);
  return match ? { index: match.index, length: match[0].length } : null;
}

async function routeAdminV1(request, env, ctx, path, url) {
  const subpath = path.slice("/api/admin/v1".length) || "/";
  const method = request.method.toUpperCase();

  if (subpath === "/session" && method === "POST") {
    return login(request, env, true);
  }
  if (subpath === "/session" && method === "GET") {
    const auth = await requireAdmin(request, env);
    return json(adminSessionPayload(auth, auth.csrf_token), 200, null, {
      admin: true,
    });
  }
  if (subpath === "/session" && method === "DELETE") {
    const auth = await requireAdmin(request, env);
    await requireCsrf(request, auth);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(
        auth.session_token_hash
      ),
      auditStatement(
        env,
        request,
        auth.id,
        "auth.logout",
        "session",
        null,
        "success"
      ),
    ]);
    return withSecurity(
      new Response(null, { status: 204, headers: clearSessionCookieHeaders() }),
      { admin: true }
    );
  }

  const auth = await requireAdmin(request, env);
  if (subpath === "/overview" && method === "GET") {
    return adminOverview(env);
  }
  if (subpath === "/users" && method === "GET") {
    return adminUsers(env, url);
  }
  const entitlementMatch = subpath.match(/^\/users\/([^/]+)\/entitlements$/);
  if (entitlementMatch && method === "PATCH") {
    await requireCsrf(request, auth);
    return updateEntitlements(
      request,
      env,
      auth,
      decodeURIComponent(entitlementMatch[1])
    );
  }
  if (subpath === "/audit-events" && method === "GET") {
    return adminAudit(env, url);
  }
  if (subpath === "/integrations/deepseek" && method === "GET") {
    return json(await publicProviderConfig(env), 200, null, { admin: true });
  }
  if (subpath === "/integrations/deepseek" && method === "PATCH") {
    await requireCsrf(request, auth);
    return updateProviderConfig(request, env, auth);
  }
  if (subpath === "/integrations/deepseek/access" && method === "GET") {
    return json(await publicGlobalAgentAccess(env), 200, null, { admin: true });
  }
  if (subpath === "/integrations/deepseek/access" && method === "PATCH") {
    await requireCsrf(request, auth);
    const body = await readJson(request);
    if (typeof body.globalEnabled !== "boolean") {
      throw new HttpError(
        400,
        "INVALID_GLOBAL_ACCESS",
        "globalEnabled 必须是布尔值。"
      );
    }
    return updateGlobalAgentAccess(
      request,
      env,
      auth,
      body.globalEnabled,
      { admin: true }
    );
  }
  throw new HttpError(404, "ADMIN_NOT_FOUND", "管理接口不存在。");
}

async function routeAdminCompatibility(request, env, ctx, path, url) {
  const method = request.method.toUpperCase();
  const auth = await requireAdmin(request, env);
  if (method === "GET" && path === "/api/admin/users") {
    const mapped = new URL(url);
    return adminUsers(env, mapped, false);
  }
  if (method === "GET" && path === "/api/admin/audit") {
    return adminAudit(env, url, false);
  }
  if (method === "GET" && path === "/api/admin/deepseek/config") {
    return json(await publicProviderConfig(env));
  }
  if (method === "PUT" && path === "/api/admin/deepseek/config") {
    await requireCsrf(request, auth);
    return updateProviderConfig(request, env, auth);
  }
  if (method === "GET" && path === "/api/admin/deepseek/access") {
    return json(await publicGlobalAgentAccess(env));
  }
  if (method === "PUT" && path === "/api/admin/deepseek/access/global") {
    await requireCsrf(request, auth);
    const body = await readJson(request);
    if (typeof body.enabled !== "boolean") {
      throw new HttpError(400, "invalid_access", "enabled 必须是布尔值。");
    }
    return updateGlobalAgentAccess(request, env, auth, body.enabled);
  }
  throw new HttpError(404, "not_found", "管理接口不存在。");
}

async function adminOverview(env) {
  const [users, active, agent, audits, provider] = await Promise.all([
    scalar(env, "SELECT COUNT(*) AS value FROM users WHERE disabled_at IS NULL"),
    scalar(
      env,
      `SELECT COUNT(*) AS value FROM memberships
       WHERE status = 'active' AND plan = 'member'`
    ),
    scalar(
      env,
      "SELECT COUNT(*) AS value FROM agent_member_grants WHERE enabled = 1"
    ),
    scalar(
      env,
      "SELECT COUNT(*) AS value FROM audit_events WHERE occurred_at >= datetime('now', '-7 day')"
    ),
    env.DB.prepare(
      "SELECT enabled, ciphertext FROM provider_configs WHERE provider = 'deepseek'"
    ).first(),
  ]);
  return json(
    {
      metrics: [
        { label: "可用账户", value: users, note: "不含已停用账户" },
        { label: "有效会员", value: active, note: "当前有效" },
        { label: "Agent 授权", value: agent, note: "单独授权" },
        { label: "审计事件", value: audits, note: "过去 7 天" },
      ],
      overallStatus: provider?.enabled && provider?.ciphertext ? "healthy" : "degraded",
      services: [
        { label: "D1 审计写入", status: "正常", level: "good" },
        {
          label: "DeepSeek",
          status: provider?.enabled && provider?.ciphertext ? "已配置" : "待配置",
          level: provider?.enabled && provider?.ciphertext ? "good" : "warn",
        },
      ],
    },
    200,
    null,
    { admin: true }
  );
}

async function adminUsers(env, url, v1 = true) {
  const query = (url.searchParams.get("query") || "").trim().toLowerCase();
  const entitlement = url.searchParams.get("entitlement") || "all";
  if (!["all", "member", "agent", "none"].includes(entitlement)) {
    throw new HttpError(400, "INVALID_ENTITLEMENT_FILTER", "授权筛选条件无效。");
  }
  const limit = clampInt(url.searchParams.get("limit"), 1, 100, 100);
  const conditions = [];
  const values = [];
  if (query) {
    const pattern = `%${escapeSqlLike(query)}%`;
    conditions.push(
      `(LOWER(u.id) LIKE ? ESCAPE '\\' OR
        LOWER(u.username) LIKE ? ESCAPE '\\' OR
        LOWER(COALESCE(u.email, '')) LIKE ? ESCAPE '\\')`
    );
    values.push(pattern, pattern, pattern);
  }
  const now = new Date().toISOString();
  const activeMembership =
    `(u.disabled_at IS NULL AND m.plan = 'member' AND m.status = 'active' ` +
    `AND (m.expires_at IS NULL OR m.expires_at > ?))`;
  if (entitlement === "member") {
    conditions.push(activeMembership);
    values.push(now);
  } else if (entitlement === "agent") {
    conditions.push("COALESCE(g.enabled, 0) = 1");
  } else if (entitlement === "none") {
    conditions.push(`NOT ${activeMembership} AND COALESCE(g.enabled, 0) = 0`);
    values.push(now);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS value
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id
     LEFT JOIN agent_member_grants g ON g.user_id = u.id
     ${where}`
  )
    .bind(...values)
    .first();
  const total = Number(countRow?.value) || 0;

  const cursor = decodeAdminUsersCursor(url.searchParams.get("cursor"));
  const pageConditions = [...conditions];
  const pageValues = [...values];
  if (cursor) {
    pageConditions.push("(u.created_at < ? OR (u.created_at = ? AND u.id < ?))");
    pageValues.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }
  const pageWhere = pageConditions.length
    ? `WHERE ${pageConditions.join(" AND ")}`
    : "";
  const result = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.version, u.created_at, u.disabled_at,
            m.plan, m.status AS membership_status, m.expires_at,
            COALESCE(g.enabled, 0) AS agent_enabled
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id
     LEFT JOIN agent_member_grants g ON g.user_id = u.id
     ${pageWhere}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT ?`
  )
    .bind(...pageValues, limit + 1)
    .all();
  const rawRows = result.results || [];
  const hasMore = rawRows.length > limit;
  const pageRows = rawRows.slice(0, limit);
  const rows = pageRows.map(adminPublicUser);
  const last = pageRows.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeAdminUsersCursor({ createdAt: last.created_at, id: last.id })
      : null;
  if (v1) {
    return json(
      { items: rows, total, nextCursor },
      200,
      null,
      { admin: true }
    );
  }
  return json({ users: rows, nextCursor });
}

async function updateEntitlements(request, env, auth, userId) {
  const body = await readJson(request);
  if (!ENTITLEMENT_REASON_CODES.has(body.reasonCode)) {
    throw new HttpError(422, "INVALID_REASON_CODE", "请选择有效的授权变更原因。");
  }
  const entitlementFields = [
    typeof body.membershipEnabled === "boolean" ? "membership" : null,
    typeof body.agentEnabled === "boolean" ? "agent" : null,
  ].filter(Boolean);
  if (entitlementFields.length !== 1) {
    throw new HttpError(400, "INVALID_ENTITLEMENT", "每次只能修改一个授权字段。");
  }
  if (!validEntitlementReason(body)) {
    throw new HttpError(422, "INVALID_REASON_CODE", "授权原因与本次变更不匹配。");
  }
  const expectedVersion = Number(body.expectedVersion);
  const current = await getUser(env, userId);
  if (!current) throw new HttpError(404, "USER_NOT_FOUND", "用户不存在。");
  if (current.role === "admin") {
    throw new HttpError(409, "ADMIN_PROTECTED", "管理员授权不能在此修改。");
  }
  if (!Number.isInteger(expectedVersion) || current.version !== expectedVersion) {
    throw new HttpError(409, "VERSION_CONFLICT", "数据已更新，请刷新后重试。");
  }

  const now = new Date().toISOString();
  const nextVersion = expectedVersion + 1;
  const mutationToken = randomToken(18);
  const statements = [
    env.DB.prepare(
      `UPDATE users
       SET version = ?, last_mutation_token = ?, updated_at = ?
       WHERE id = ? AND version = ?`
    ).bind(nextVersion, mutationToken, now, userId, expectedVersion),
  ];
  if (typeof body.membershipEnabled === "boolean") {
    statements.push(
      env.DB.prepare(
        `INSERT INTO memberships
          (user_id, plan, status, expires_at, created_at, updated_at)
         SELECT ?, ?, ?, NULL, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM users WHERE id = ? AND last_mutation_token = ?
         )
         ON CONFLICT(user_id) DO UPDATE SET
           plan = excluded.plan,
           status = excluded.status,
           updated_at = excluded.updated_at`
      ).bind(
        userId,
        body.membershipEnabled ? "member" : "free",
        body.membershipEnabled ? "active" : "suspended",
        now,
        now,
        userId,
        mutationToken
      )
    );
  }
  if (typeof body.agentEnabled === "boolean") {
    statements.push(
      env.DB.prepare(
        `INSERT INTO agent_member_grants
          (user_id, enabled, updated_at, updated_by)
         SELECT ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM users WHERE id = ? AND last_mutation_token = ?
         )
         ON CONFLICT(user_id) DO UPDATE SET
           enabled = excluded.enabled,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      ).bind(
        userId,
        body.agentEnabled ? 1 : 0,
        now,
        auth.id,
        userId,
        mutationToken
      )
    );
  }
  const action =
    typeof body.agentEnabled === "boolean"
      ? `user.agent.${body.agentEnabled ? "enable" : "disable"}`
      : `user.membership.${body.membershipEnabled ? "enable" : "disable"}`;
  statements.push(
    conditionalAuditStatement(
      env,
      request,
      auth.id,
      action,
      "user",
      userId,
      "success",
      body.reasonCode,
      mutationToken
    )
  );
  await env.DB.batch(statements);
  const updated = await getUser(env, userId);
  if (updated?.last_mutation_token !== mutationToken) {
    throw new HttpError(409, "VERSION_CONFLICT", "数据已更新，请刷新后重试。");
  }
  return json(adminPublicUser(updated), 200, null, { admin: true });
}

function validEntitlementReason(body) {
  if (["security_review", "account_request"].includes(body.reasonCode)) {
    return true;
  }
  if (typeof body.membershipEnabled === "boolean") {
    return body.reasonCode ===
      (body.membershipEnabled ? "membership_approved" : "membership_revoked");
  }
  if (typeof body.agentEnabled === "boolean") {
    return body.reasonCode ===
      (body.agentEnabled ? "agent_approved" : "agent_revoked");
  }
  return false;
}

async function adminAudit(env, url, v1 = true) {
  const page = clampInt(url.searchParams.get("page"), 1, 100_000, 1);
  const pageSize = clampInt(
    url.searchParams.get(v1 ? "pageSize" : "limit"),
    1,
    50,
    v1 ? 5 : 50
  );
  const total = await scalar(env, "SELECT COUNT(*) AS value FROM audit_events");
  const result = await env.DB.prepare(
    `SELECT id, occurred_at, actor_user_id, action, resource_type, resource_id,
            result, reason_code, request_id
     FROM audit_events
     ORDER BY occurred_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(pageSize, (page - 1) * pageSize)
    .all();
  const items = (result.results || []).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_user_id || "system",
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    result: row.result,
    reasonCode: row.reason_code || null,
    requestId: row.request_id,
  }));
  if (!v1) return json({ auditEvents: items, nextCursor: null });
  return json(
    {
      items,
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
    200,
    null,
    { admin: true }
  );
}

async function publicProviderConfig(env) {
  const row = await env.DB.prepare(
    `SELECT enabled, model, ciphertext, updated_at
     FROM provider_configs WHERE provider = 'deepseek'`
  ).first();
  return {
    enabled: Boolean(row?.enabled),
    baseUrl: DEEPSEEK_BASE_URL,
    model: row?.model || DEEPSEEK_DEFAULT_MODEL,
    apiKeyConfigured: Boolean(row?.ciphertext),
    updatedAt: row?.updated_at || null,
  };
}

async function publicGlobalAgentAccess(env) {
  const row = await env.DB.prepare(
    "SELECT global_enabled FROM agent_access_policy WHERE singleton_id = 1"
  ).first();
  return { globalEnabled: Boolean(row?.global_enabled) };
}

async function updateGlobalAgentAccess(
  request,
  env,
  auth,
  globalEnabled,
  responseOptions = { admin: true }
) {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO agent_access_policy
        (singleton_id, global_enabled, updated_at, updated_by)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(singleton_id) DO UPDATE SET
         global_enabled = excluded.global_enabled,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    ).bind(globalEnabled ? 1 : 0, now, auth.id),
    auditStatement(
      env,
      request,
      auth.id,
      globalEnabled ? "agent.global.enable" : "agent.global.disable",
      "agent_access_policy",
      "global",
      "success"
    ),
  ]);
  return json(
    { globalEnabled: Boolean(globalEnabled) },
    200,
    null,
    responseOptions
  );
}

async function updateProviderConfig(request, env, auth) {
  const body = await readJson(request);
  if (typeof body.enabled !== "boolean") {
    throw new HttpError(400, "INVALID_ENABLED", "enabled 必须是布尔值。");
  }
  if (body.baseUrl !== undefined) {
    throw new HttpError(
      400,
      "INVALID_BASE_URL",
      "模型服务地址由系统固定，不能修改。"
    );
  }
  const model = validateModel(body.model);
  const existing = await env.DB.prepare(
    "SELECT ciphertext, iv, created_at FROM provider_configs WHERE provider = 'deepseek'"
  ).first();
  let encrypted = existing?.ciphertext
    ? { ciphertext: existing.ciphertext, iv: existing.iv }
    : null;
  if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    if (body.apiKey.length > 1024) {
      throw new HttpError(400, "INVALID_API_KEY", "API Key 长度不正确。");
    }
    encrypted = await encryptProviderKey(env, body.apiKey.trim());
  }
  if (body.enabled && !encrypted) {
    throw new HttpError(422, "API_KEY_REQUIRED", "启用前需要配置 API Key。");
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO provider_configs
        (provider, enabled, model, ciphertext, iv, algorithm,
         key_version, created_at, updated_at, updated_by)
       VALUES ('deepseek', ?, ?, ?, ?, 'AES-256-GCM', 1, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         enabled = excluded.enabled,
         model = excluded.model,
         ciphertext = excluded.ciphertext,
         iv = excluded.iv,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    ).bind(
      body.enabled ? 1 : 0,
      model,
      encrypted?.ciphertext ?? null,
      encrypted?.iv ?? null,
      existing?.created_at || now,
      now,
      auth.id
    ),
    auditStatement(
      env,
      request,
      auth.id,
      "deepseek.configuration.update",
      "integration",
      "deepseek",
      "success"
    ),
  ]);
  return json(await publicProviderConfig(env), 200, null, { admin: true });
}

async function publicSession(env, auth) {
  return {
    user: publicUser(auth),
    membership: publicMembership(auth),
    externalAiConsent: publicConsent(auth),
    capabilities: { agent: await hasAgentAccess(env, auth) },
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: Boolean(user.must_change_password),
  };
}

function publicMembership(user) {
  return {
    plan: user.plan || "free",
    status: user.membership_status || "active",
    expiresAt: user.expires_at || null,
  };
}

function publicConsent(user) {
  const accepted = Boolean(user.consented_at && !user.revoked_at);
  return {
    policyVersion: user.policy_version || EXTERNAL_AI_POLICY_VERSION,
    accepted,
    current:
      accepted && user.policy_version === EXTERNAL_AI_POLICY_VERSION,
    consentedAt: user.consented_at || null,
  };
}

function adminPublicUser(user) {
  const expiresAt = user.expires_at || null;
  const expiry = expiresAt ? Date.parse(expiresAt) : null;
  const membershipUnexpired =
    !expiresAt || (Number.isFinite(expiry) && expiry > Date.now());
  return {
    id: user.id,
    alias: user.username,
    maskedEmail: maskEmail(user.email),
    joinedAt: user.created_at,
    membershipEnabled:
      !user.disabled_at &&
      user.plan === "member" &&
      user.membership_status === "active" &&
      membershipUnexpired,
    expiresAt,
    agentEnabled: Boolean(user.agent_enabled),
    version: Number(user.version) || 1,
    disabled: Boolean(user.disabled_at),
  };
}

function escapeSqlLike(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function encodeAdminUsersCursor(cursor) {
  return toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({ createdAt: cursor.createdAt, id: cursor.id })
    )
  );
}

function decodeAdminUsersCursor(value) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(fromBase64Url(String(value)))
    );
    if (
      !decoded ||
      typeof decoded.createdAt !== "string" ||
      !Number.isFinite(Date.parse(decoded.createdAt)) ||
      typeof decoded.id !== "string" ||
      !decoded.id ||
      decoded.id.length > 120
    ) {
      throw new Error("invalid");
    }
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "用户分页游标无效。");
  }
}

function adminSessionPayload(user, csrfToken) {
  return {
    admin: {
      id: user.id,
      displayName: user.username,
      role: "security_admin",
      permissions: [
        "overview:read",
        "users:read",
        "entitlements:write",
        "audit:read",
        "deepseek:write",
      ],
    },
    csrfToken,
  };
}

async function getUser(env, id) {
  return env.DB.prepare(
    `SELECT u.*, m.plan, m.status AS membership_status, m.expires_at,
            COALESCE(g.enabled, 0) AS agent_enabled,
            c.policy_version, c.consented_at, c.revoked_at
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id
     LEFT JOIN agent_member_grants g ON g.user_id = u.id
     LEFT JOIN external_ai_consents c ON c.user_id = u.id
     WHERE u.id = ?`
  )
    .bind(id)
    .first();
}

async function getUserByUsername(env, normalized) {
  return env.DB.prepare(
    `SELECT u.*, m.plan, m.status AS membership_status, m.expires_at,
            COALESCE(g.enabled, 0) AS agent_enabled,
            c.policy_version, c.consented_at, c.revoked_at
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id
     LEFT JOIN agent_member_grants g ON g.user_id = u.id
     LEFT JOIN external_ai_consents c ON c.user_id = u.id
     WHERE u.username_norm = ? OR lower(COALESCE(u.email, '')) = ?`
  )
    .bind(normalized, normalized)
    .first();
}

async function requireAuth(request, env) {
  requireBinding(env, "DB");
  const token = parseCookies(request.headers.get("cookie")).get("__Host-game_session");
  if (!token) throw new HttpError(401, "authentication_required", "请先登录。");
  const tokenHash = await sha256(token);
  const auth = await env.DB.prepare(
    `SELECT u.*, s.token_hash AS session_token_hash, s.csrf_hash,
            m.plan, m.status AS membership_status, m.expires_at,
            COALESCE(g.enabled, 0) AS agent_enabled,
            c.policy_version, c.consented_at, c.revoked_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN memberships m ON m.user_id = u.id
     LEFT JOIN agent_member_grants g ON g.user_id = u.id
     LEFT JOIN external_ai_consents c ON c.user_id = u.id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL`
  )
    .bind(tokenHash, new Date().toISOString())
    .first();
  if (!auth) throw new HttpError(401, "authentication_required", "登录已失效。");
  auth.csrf_token = parseCookies(request.headers.get("cookie")).get(
    "__Host-game_csrf"
  );
  return auth;
}

async function requireAdmin(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.role !== "admin") {
    throw new HttpError(403, "ADMIN_FORBIDDEN", "当前账号没有管理权限。");
  }
  return auth;
}

async function requireCsrf(request, auth) {
  const token = request.headers.get("x-csrf-token");
  if (!token || !auth.csrf_token || !(await secretEqual(token, auth.csrf_token))) {
    throw new HttpError(403, "csrf_invalid", "安全校验失败，请刷新后重试。");
  }
  if ((await sha256(token)) !== auth.csrf_hash) {
    throw new HttpError(403, "csrf_invalid", "安全校验失败，请刷新后重试。");
  }
}

async function issuePreauthCsrf(env) {
  const key = await requireHmacKey(env);
  const issuedAt = Date.now().toString(36);
  const payload = `${issuedAt}.${randomToken(24)}`;
  const signature = await hmac(key, `preauth-csrf:${payload}`);
  const token = `${payload}.${signature}`;
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `__Host-game_pre_csrf=${token}; Path=/; Max-Age=${Math.floor(
      PREAUTH_CSRF_TTL_MS / 1000
    )}; Secure; HttpOnly; SameSite=Strict`
  );
  return json(
    { csrfToken: token, expiresIn: PREAUTH_CSRF_TTL_MS / 1000 },
    200,
    headers
  );
}

async function requirePreauthCsrf(request, env) {
  const headerToken = request.headers.get("x-csrf-token");
  const cookieToken = parseCookies(request.headers.get("cookie")).get(
    "__Host-game_pre_csrf"
  );
  if (
    !headerToken ||
    !cookieToken ||
    !(await secretEqual(headerToken, cookieToken))
  ) {
    throw new HttpError(403, "preauth_csrf_invalid", "安全校验失败，请刷新后重试。");
  }
  const [issuedAtRaw, nonce, signature, extra] = headerToken.split(".");
  if (
    extra !== undefined ||
    !/^[a-z0-9]+$/.test(issuedAtRaw || "") ||
    !/^[A-Za-z0-9_-]{20,}$/.test(nonce || "") ||
    !/^[A-Za-z0-9_-]{32,}$/.test(signature || "")
  ) {
    throw new HttpError(403, "preauth_csrf_invalid", "安全校验失败，请刷新后重试。");
  }
  const issuedAt = Number.parseInt(issuedAtRaw, 36);
  const age = Date.now() - issuedAt;
  if (!Number.isFinite(issuedAt) || age < -60_000 || age > PREAUTH_CSRF_TTL_MS) {
    throw new HttpError(403, "preauth_csrf_expired", "安全校验已过期，请刷新重试。");
  }
  const key = await requireHmacKey(env);
  const expected = await hmac(
    key,
    `preauth-csrf:${issuedAtRaw}.${nonce}`
  );
  if (!(await secretEqual(signature, expected))) {
    throw new HttpError(403, "preauth_csrf_invalid", "安全校验失败，请刷新后重试。");
  }
}

async function consumeAuthRateLimit(
  env,
  request,
  scope,
  accountKey,
  limit,
  windowMs
) {
  const key = await requireHmacKey(env);
  const material =
    accountKey === null
      ? `ip:${request.headers.get("cf-connecting-ip") || "unknown"}`
      : `account:${accountKey}`;
  const keyHash = await hmac(key, `auth-rate:${scope}:${material}`);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + windowMs).toISOString();
  await env.DB.prepare("DELETE FROM auth_rate_limits WHERE expires_at <= ?")
    .bind(nowIso)
    .run();
  const existing = await env.DB.prepare(
    "SELECT 1 AS found FROM auth_rate_limits WHERE scope = ? AND key_hash = ?"
  )
    .bind(scope, keyHash)
    .first();
  if (!existing) {
    const count = await scalar(
      env,
      "SELECT COUNT(*) AS value FROM auth_rate_limits"
    );
    if (count >= MAX_AUTH_RATE_LIMIT_KEYS) {
      throw new HttpError(429, "rate_limited", "操作过于频繁，请稍后再试。");
    }
  }
  try {
    await env.DB.prepare(
      `INSERT INTO auth_rate_limits
        (scope, key_hash, attempts, window_started_at, expires_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(scope, key_hash) DO UPDATE SET
         attempts = CASE
           WHEN auth_rate_limits.expires_at <= excluded.window_started_at THEN 1
           ELSE auth_rate_limits.attempts + 1
         END,
         window_started_at = CASE
           WHEN auth_rate_limits.expires_at <= excluded.window_started_at
             THEN excluded.window_started_at
           ELSE auth_rate_limits.window_started_at
         END,
         expires_at = CASE
           WHEN auth_rate_limits.expires_at <= excluded.window_started_at
             THEN excluded.expires_at
           ELSE auth_rate_limits.expires_at
         END`
    )
      .bind(scope, keyHash, nowIso, expiresAt)
      .run();
  } catch (error) {
    if (String(error?.message || error).includes("auth_rate_limit_capacity")) {
      throw new HttpError(429, "rate_limited", "操作过于频繁，请稍后再试。");
    }
    throw error;
  }
  const row = await env.DB.prepare(
    "SELECT attempts FROM auth_rate_limits WHERE scope = ? AND key_hash = ?"
  )
    .bind(scope, keyHash)
    .first();
  if ((Number(row?.attempts) || 0) > limit) {
    throw new HttpError(429, "rate_limited", "操作过于频繁，请稍后再试。");
  }
}

async function issueSession(env, userId) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(
      now.toISOString()
    ),
    env.DB.prepare(
      `INSERT INTO sessions
        (token_hash, user_id, csrf_hash, expires_at, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      await sha256(token),
      userId,
      await sha256(csrf),
      expires.toISOString(),
      now.toISOString(),
      now.toISOString()
    ),
  ]);
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `__Host-game_session=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; Secure; HttpOnly; SameSite=Strict`
  );
  headers.append(
    "Set-Cookie",
    `__Host-game_csrf=${csrf}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; Secure; SameSite=Strict`
  );
  headers.append(
    "Set-Cookie",
    "__Host-game_pre_csrf=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict"
  );
  return { token, csrf, headers };
}

function clearSessionCookieHeaders() {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    "__Host-game_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict"
  );
  headers.append(
    "Set-Cookie",
    "__Host-game_csrf=; Path=/; Max-Age=0; Secure; SameSite=Strict"
  );
  return headers;
}

async function hasAgentAccess(env, user) {
  const policy = await env.DB.prepare(
    "SELECT global_enabled FROM agent_access_policy WHERE singleton_id = 1"
  ).first();
  if (!policy?.global_enabled) return false;
  if (user.role === "admin") return true;
  if (user.membership_status !== "active" || !user.agent_enabled) return false;
  if (!user.expires_at) return true;
  const expiresAt = Date.parse(user.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function audit(env, request, actorId, action, resourceType, resourceId, result) {
  if (!env.DB) return;
  await auditStatement(
    env,
    request,
    actorId,
    action,
    resourceType,
    resourceId,
    result,
    null
  ).run();
}

function auditStatement(
  env,
  request,
  actorId,
  action,
  resourceType,
  resourceId,
  result,
  reasonCode = null
) {
  const requestId = request.headers.get("cf-ray") || `req_${crypto.randomUUID()}`;
  return env.DB.prepare(
    `INSERT INTO audit_events
      (id, actor_user_id, action, resource_type, resource_id, result,
       reason_code, request_id, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    `evt_${crypto.randomUUID()}`,
    actorId,
    action,
    resourceType,
    resourceId,
    result,
    reasonCode,
    requestId,
    new Date().toISOString()
  );
}

function conditionalAuditStatement(
  env,
  request,
  actorId,
  action,
  resourceType,
  resourceId,
  result,
  reasonCode,
  mutationToken
) {
  const requestId = request.headers.get("cf-ray") || `req_${crypto.randomUUID()}`;
  return env.DB.prepare(
    `INSERT INTO audit_events
      (id, actor_user_id, action, resource_type, resource_id, result,
       reason_code, request_id, occurred_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE EXISTS (
       SELECT 1 FROM users WHERE id = ? AND last_mutation_token = ?
     )`
  ).bind(
    `evt_${crypto.randomUUID()}`,
    actorId,
    action,
    resourceType,
    resourceId,
    result,
    reasonCode,
    requestId,
    new Date().toISOString(),
    resourceId,
    mutationToken
  );
}

async function encryptProviderKey(env, plaintext) {
  const key = await requireMasterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("game-signal-lab:deepseek:v1"),
      tagLength: 128,
    },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    ciphertext: toBase64Url(new Uint8Array(encrypted)),
    iv: toBase64Url(iv),
  };
}

async function decryptProviderKey(env, row) {
  try {
    const key = await requireMasterKey(env);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(row.iv),
        additionalData: new TextEncoder().encode("game-signal-lab:deepseek:v1"),
        tagLength: 128,
      },
      key,
      fromBase64Url(row.ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new HttpError(503, "provider_key_unavailable", "模型配置暂时不可用。");
  }
}

async function requireMasterKey(env) {
  const bytes = decodeMasterKey(env.CONFIG_MASTER_KEY);
  if (!bytes) {
    throw new HttpError(503, "master_key_missing", "服务端密钥尚未配置。");
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function optionalMasterKey(env) {
  const bytes = decodeMasterKey(env.CONFIG_MASTER_KEY);
  if (!bytes) return null;
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function requireHmacKey(env) {
  const key = await optionalMasterKey(env);
  if (!key) {
    throw new HttpError(503, "master_key_missing", "服务端密钥尚未配置。");
  }
  return key;
}

function decodeMasterKey(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const source = value.trim();
  let bytes;
  if (/^[0-9a-f]{64}$/i.test(source)) {
    bytes = Uint8Array.from(source.match(/../g), (part) => Number.parseInt(part, 16));
  } else {
    try {
      bytes = fromBase64Url(source);
    } catch {
      return null;
    }
  }
  return bytes.byteLength === 32 ? bytes : null;
}

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, saltBytes, PASSWORD_ITERATIONS);
  return {
    hash: toBase64Url(hash),
    salt: toBase64Url(saltBytes),
    iterations: PASSWORD_ITERATIONS,
  };
}

async function verifyPassword(password, user) {
  if (
    typeof password !== "string" ||
    !user.password_hash ||
    !user.password_salt ||
    !Number.isInteger(user.password_iterations)
  ) {
    return false;
  }
  try {
    const actual = await derivePassword(
      password,
      fromBase64Url(user.password_salt),
      user.password_iterations
    );
    return await secretEqual(toBase64Url(actual), user.password_hash);
  } catch {
    return false;
  }
}

async function derivePassword(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      256
    )
  );
}

async function burnPasswordWork(password) {
  await derivePassword(
    typeof password === "string" ? password : "",
    new Uint8Array([
      0x47, 0x41, 0x4d, 0x45, 0x2d, 0x73, 0x69, 0x74,
      0x65, 0x73, 0x2d, 0x64, 0x75, 0x6d, 0x6d, 0x79,
    ]),
    PASSWORD_ITERATIONS
  );
  return false;
}

async function secretEqual(left, right) {
  const [a, b] = await Promise.all([sha256(String(left)), sha256(String(right))]);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a.charCodeAt(index % a.length) || 0) ^ (b.charCodeAt(index % b.length) || 0);
  }
  return mismatch === 0;
}

async function sha256(value) {
  return toBase64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    )
  );
}

async function hmac(key, value) {
  return toBase64Url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
    )
  );
}

function normalizeUsername(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_username", "用户名格式不正确。");
  }
  const display = value.trim().normalize("NFKC");
  if (
    display.length < 3 ||
    display.length > 40 ||
    !/^[\p{L}\p{N}_.@+-]+$/u.test(display)
  ) {
    throw new HttpError(400, "invalid_username", "用户名格式不正确。");
  }
  return { display, normalized: display.toLocaleLowerCase("en-US") };
}

function validatePassword(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    value.length > 128 ||
    new TextEncoder().encode(value).byteLength > 1024
  ) {
    throw new HttpError(400, "invalid_password", "密码至少需要 12 个字符。");
  }
}

function isBootstrapAdmin(username, env) {
  const expected = normalizeUsername(
    env.ADMIN_BOOTSTRAP_USERNAME || ADMIN_USERNAME_DEFAULT
  );
  const configuredEmail =
    typeof env.ADMIN_BOOTSTRAP_EMAIL === "string"
      ? env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase()
      : "";
  return (
    username.normalized === expected.normalized ||
    (configuredEmail && username.normalized === configuredEmail)
  );
}

function validateAgentInput(body) {
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) {
    throw new HttpError(400, "invalid_messages", "对话消息数量不正确。");
  }
  let total = 0;
  const messages = body.messages.map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > 12_000
    ) {
      throw new HttpError(400, "invalid_message", "对话消息格式不正确。");
    }
    const content = message.content.trim();
    total += new TextEncoder().encode(content).byteLength;
    return { role: message.role, content };
  });
  if (total > MAX_AGENT_CONTENT_BYTES) {
    throw new HttpError(413, "agent_input_too_large", "本次对话内容过长。");
  }
  return { messages };
}

function validateModel(value) {
  if (typeof value !== "string" || !DEEPSEEK_MODELS.has(value.trim())) {
    throw new HttpError(400, "INVALID_MODEL", "模型名称格式不正确。");
  }
  return value.trim();
}

async function readJson(request, limit = MAX_JSON_BYTES) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > limit) throw new HttpError(413, "body_too_large", "请求内容过大。");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit) {
    throw new HttpError(413, "body_too_large", "请求内容过大。");
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("object required");
    }
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_json", "请求格式不正确。");
  }
}

function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new HttpError(403, "origin_denied", "请求来源不被允许。");
  }
}

function requireBinding(env, name) {
  if (!env[name]) {
    throw new HttpError(503, "binding_unavailable", "持久化服务尚未连接。");
  }
}

async function scalar(env, sql) {
  const row = await env.DB.prepare(sql).first();
  return Number(row?.value) || 0;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function maskEmail(email) {
  if (!email || !String(email).includes("@")) return "未提供邮箱";
  const [local, domain] = String(email).split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

function parseCookies(header) {
  const map = new Map();
  for (const item of String(header || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    map.set(
      item.slice(0, separator).trim(),
      decodeURIComponent(item.slice(separator + 1).trim())
    );
  }
  return map;
}

function randomToken(bytes) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function toBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function serveStatic(request, env, path) {
  const target = new URL(request.url);
  if (path === "/admin") target.pathname = "/admin/index.html";
  if (path === "/") target.pathname = "/index.html";
  let response;
  if (env.ASSETS?.fetch) {
    response = await env.ASSETS.fetch(new Request(target, request));
  }
  if (!response || response.status === 404) {
    const asset = EMBEDDED_STATIC_ASSETS?.[target.pathname];
    if (!asset) {
      response = new Response("Not found", { status: 404 });
    } else {
      response = new Response(request.method === "HEAD" ? null : asset.body, {
        status: 200,
        headers: {
          "Content-Type": asset.contentType,
          "Cache-Control": asset.cacheControl,
          "Content-Length": String(new TextEncoder().encode(asset.body).byteLength),
        },
      });
    }
  }
  return withSecurity(response, { admin: path === "/admin" || path.startsWith("/admin/") });
}

function json(payload, status = 200, extraHeaders = null, options = {}) {
  const headers = new Headers(extraHeaders || undefined);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return withSecurity(
    new Response(JSON.stringify(payload), { status, headers }),
    options
  );
}

function publicRobots(origin) {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /api/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return withSecurity(
    new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    })
  );
}

function publicSitemap(origin) {
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${origin}/</loc>`,
    "  </url>",
    "</urlset>",
    "",
  ].join("\n");
  return withSecurity(
    new Response(body, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    })
  );
}

function withSecurity(response, { admin = false } = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of secureHeaders()) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (admin) headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function secureHeaders(initial = undefined) {
  const headers = new Headers(initial);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
  return headers;
}
