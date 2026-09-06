import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createBackend } from "../server/app.js";
import { encryptSecret } from "../server/security.js";
const character = {
  name: "Alex",
  age: 25,
  description: "An adult illustrator",
  appearance: "Short hair",
  personality: "Curious",
  world: "Coastal town",
  opening: "We meet at an exhibition.",
};
const KEY = randomBytes(32);
const ORIGIN = "http://game.test";
async function setup(t, { image = false } = {}) {
  let mode = "normal",
    calls = 0,
    release;
  const gate = () => new Promise((r) => (release = r));
  const backend = await createBackend({
    databasePath: ":memory:",
    secureCookies: false,
    publicOrigin: ORIGIN,
    env: {
      CONFIG_MASTER_KEY: KEY.toString("base64url"),
      ADMIN_BOOTSTRAP_PASSWORD: "test-fixture-admin-password",
      ...(image
        ? {
            COMPANION_IMAGE_API_KEY: "test-image-key",
            COMPANION_IMAGE_LIMIT: "2",
          }
        : {}),
    },
    fetchImpl: async (url, options) => {
      calls++;
      if (String(url).includes("/images/")) {
        if (mode === "wait") await gate();
        return Response.json({
          data: [
            {
              b64_json: Buffer.from("89504e470d0a1a0a00000000", "hex").toString(
                "base64",
              ),
            },
          ],
        });
      }
      if (mode === "wait") await gate();
      if (options.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      const b = JSON.parse(options.body);
      const text = b.messages[0].content.includes("Generate ONLY JSON")
        ? JSON.stringify({ character })
        : "A quiet moment, just here.";
      return new Response(
        "data: " +
          JSON.stringify({ choices: [{ delta: { content: text } }] }) +
          "\n\n" +
          (mode === "broken"
            ? ""
            : 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  await backend.listen();
  t.after(() => backend.close());
  const base = `http://127.0.0.1:${backend.server.address().port}`;
  const secret = encryptSecret("test-deepseek-key", KEY);
  backend.db
    .prepare(
      "INSERT INTO provider_configs(provider,ciphertext,iv,auth_tag,model,enabled,algorithm,key_version,created_at,updated_at) VALUES('deepseek',?,?,?,'deepseek-v4-flash',1,'AES-256-GCM',1,'now','now')",
    )
    .run(secret.ciphertext, secret.iv, secret.authTag);
  backend.db
    .prepare(
      "INSERT INTO agent_access_policy(singleton_id,global_enabled,updated_at) VALUES(1,1,'now') ON CONFLICT(singleton_id) DO UPDATE SET global_enabled=1",
    )
    .run();
  async function client(username) {
    const cookies = new Map();
    const request = async (
      path,
      { method = "GET", body, origin = ORIGIN, noCsrf = false, signal } = {},
    ) => {
      const token = cookies.get("game_csrf") || cookies.get("game_pre_csrf");
      const response = await fetch(base + path, {
        method,
        signal,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(!noCsrf && token ? { "X-CSRF-Token": token } : {}),
          Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      for (const item of response.headers.getSetCookie()) {
        const [k, v] = item.split(";")[0].split("=");
        cookies.set(k, v);
      }
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: response.status, json, text, headers: response.headers };
    };
    await request("/api/auth/csrf");
    assert.equal(
      (
        await request("/api/auth/register", {
          method: "POST",
          body: { username, password: "test-fixture-member-password" },
        })
      ).status,
      201,
    );
    const me = (await request("/api/me")).json;
    await request("/api/me/external-ai-consent", {
      method: "PUT",
      body: {
        accepted: true,
        policyVersion: me.externalAiConsent.policyVersion,
      },
    });
    const state = (await request("/api/companion")).json;
    await request("/api/companion/consent", {
      method: "PUT",
      body: { accepted: true, policyVersion: state.policyVersion },
    });
    return {
      request,
      id: me.user.id,
      rawHeaders: () => ({
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-CSRF-Token": cookies.get("game_csrf"),
        Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
      }),
    };
  }
  return {
    backend,
    base,
    client,
    setMode: (m) => {
      mode = m;
    },
    release: () => release?.(),
    calls: () => calls,
  };
}
test("companion HTTP: root, consent, owner/CSRF gates, draft, stream, quota last call and replay", async (t) => {
  const h = await setup(t);
  const a = await h.client("fiction-one");
  const b = await h.client("fiction-two");
  assert.match(
    await fetch(h.base + "/").then((r) => r.text()),
    /companion\/app.js/,
  );
  assert.equal((await fetch(h.base + "/api/companion")).status, 401);
  assert.equal(
    (
      await a.request("/api/companion/stories", {
        method: "POST",
        noCsrf: true,
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await a.request("/api/companion/stories", {
        method: "POST",
        origin: "https://evil.test",
        body: {},
      })
    ).status,
    403,
  );
  const draft = await a.request("/api/companion/draft", {
    method: "POST",
    body: { description: "Adult painter", age: 25, locale: "en" },
  });
  assert.equal(draft.status, 200);
  const created = await a.request("/api/companion/stories", {
    method: "POST",
    body: { character, adultConfirmed: true, locale: "en" },
  });
  assert.equal(created.status, 200);
  const s = created.json.story;
  assert.equal(
    (await b.request(`/api/companion/stories/${s.id}`, { method: "DELETE" }))
      .status,
    404,
  );
  assert.equal((await b.request("/api/companion")).json.story, null);
  h.backend.db
    .prepare("UPDATE agent_usage_quotas SET used_count=49 WHERE user_id=?")
    .run(a.id);
  const input = {
    clientTurnId: "fiction-1",
    expectedVersion: 0,
    text: "Let us meet again.",
    choiceId: "meet-again",
  };
  const result = await a.request(`/api/companion/stories/${s.id}/turn`, {
    method: "POST",
    body: input,
  });
  assert.equal(result.status, 200);
  assert.match(result.text, /event: done/);
  assert.match(result.text, /event: delta/);
  const callCount = h.calls();
  const replay = await a.request(`/api/companion/stories/${s.id}/turn`, {
    method: "POST",
    body: input,
  });
  assert.match(replay.text, /event: done/);
  assert.equal(h.calls(), callCount);
  const next = await a.request(`/api/companion/stories/${s.id}/turn`, {
    method: "POST",
    body: {
      ...input,
      clientTurnId: "fiction-2",
      expectedVersion: 1,
      choiceId: "stay",
    },
  });
  assert.equal(next.status, 403);
  assert.equal(
    h.backend.db.prepare("SELECT count(*) n FROM conversation_messages").get()
      .n,
    0,
  );
  assert.equal(
    (await a.request("/api/companion")).json.story.memories.length,
    1,
  );
});
test("companion HTTP: incomplete stream never commits state; retry succeeds", async (t) => {
  const h = await setup(t);
  const a = await h.client("fiction-stream");
  const s = (
    await a.request("/api/companion/stories", {
      method: "POST",
      body: { character, adultConfirmed: true },
    })
  ).json.story;
  const path = `/api/companion/stories/${s.id}/turn`;
  const input = {
    clientTurnId: "fiction-retry",
    expectedVersion: 0,
    text: "Hello",
  };
  h.setMode("broken");
  const bad = await a.request(path, { method: "POST", body: input });
  assert.match(bad.text, /event: error/);
  assert.equal((await a.request("/api/companion")).json.story.version, 0);
  h.setMode("normal");
  assert.match(
    (await a.request(path, { method: "POST", body: input })).text,
    /event: done/,
  );
  await a.request("/api/companion/consent", {
    method: "PUT",
    body: { accepted: false },
  });
  assert.equal(
    (
      await a.request(path, {
        method: "POST",
        body: { ...input, clientTurnId: "other", expectedVersion: 1 },
      })
    ).status,
    403,
  );
  assert.equal(
    (await a.request(`/api/companion/stories/${s.id}`, { method: "DELETE" }))
      .status,
    200,
  );
});
test("image jobs persist private results, confirm explicitly and charge only once", async (t) => {
  const h = await setup(t, { image: true });
  const a = await h.client("fiction-image");
  const b = await h.client("fiction-foreign");
  const s = (
    await a.request("/api/companion/stories", {
      method: "POST",
      body: {
        character,
        adultConfirmed: true,
        portraitPresetId: "portrait-01",
      },
    })
  ).json.story;
  h.backend.db
    .prepare("UPDATE agent_usage_quotas SET used_count=50 WHERE user_id=?")
    .run(a.id);
  const input = {
    clientJobId: "fiction-image-job",
    kind: "portrait",
    scene: 0,
  };
  const job = (
    await a.request(`/api/companion/stories/${s.id}/images`, {
      method: "POST",
      body: input,
    })
  ).json.job;
  let state;
  for (let i = 0; i < 30; i++) {
    state = (await a.request("/api/companion/jobs/" + job.id)).json;
    if (state.job.status === "succeeded") break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(state.job.status, "succeeded");
  assert.equal(state.story.assets[0].confirmed, false);
  const url = state.story.assets[0].url;
  assert.equal((await b.request(url)).status, 404);
  assert.equal((await fetch(h.base + url)).status, 401);
  const confirmed = (
    await a.request(
      `/api/companion/stories/${s.id}/images/${state.job.assetId}/confirm`,
      { method: "POST", body: {} },
    )
  ).json.story;
  assert.equal(confirmed.assets[0].confirmed, true);
  assert.equal(confirmed.portraitPresetId, null);
  await a.request(`/api/companion/stories/${s.id}/images`, {
    method: "POST",
    body: input,
  });
  assert.equal((await a.request("/api/companion")).json.imageRemaining, 1);
  await a.request(`/api/companion/stories/${s.id}`, { method: "DELETE" });
  assert.equal((await a.request(url)).status, 404);
});

test("external-consent withdrawal cancels an in-flight image and prevents late storage", async (t) => {
  const h = await setup(t, { image: true });
  const a = await h.client("fiction-revoke-image");
  const s = (
    await a.request("/api/companion/stories", {
      method: "POST",
      body: { character, adultConfirmed: true },
    })
  ).json.story;
  h.setMode("wait");
  const job = (
    await a.request(`/api/companion/stories/${s.id}/images`, {
      method: "POST",
      body: { clientJobId: "revoke-image", kind: "portrait", scene: 0 },
    })
  ).json.job;
  await a.request("/api/me/external-ai-consent", {
    method: "PUT",
    body: { accepted: false },
  });
  h.release();
  await new Promise((r) => setTimeout(r, 20));
  const result = (await a.request(`/api/companion/jobs/${job.id}`)).json;
  assert.equal(result.job.status, "cancelled");
  assert.equal(result.story.assets.length, 0);
  assert.equal((await a.request("/api/companion")).json.consent, false);
});

test("withdrawing consent during draft body upload prevents any provider request", async (t) => {
  const { request: httpRequest } = await import("node:http");
  const h = await setup(t);
  const a = await h.client("fiction-slow-upload");
  let req;
  const response = new Promise((resolve, reject) => {
    req = httpRequest(
      h.base + "/api/companion/draft",
      { method: "POST", headers: a.rawHeaders() },
      (res) => {
        let text = "";
        res.on("data", (v) => (text += v));
        res.on("end", () => resolve({ status: res.statusCode, text }));
      },
    );
    req.on("error", reject);
  });
  req.write('{"description":');
  await new Promise((r) => setTimeout(r, 20));
  await a.request("/api/companion/consent", {
    method: "PUT",
    body: { accepted: false },
  });
  req.end('"Adult painter","age":25,"locale":"en"}');
  const result = await response;
  assert.equal(result.status, 403);
  assert.equal(h.calls(), 0);
});

test("bundled portraits work without image provider, with owner/CSRF/version protection", async (t) => {
  const h = await setup(t);
  const a = await h.client("preset-owner");
  const b = await h.client("preset-other");
  const created = await a.request("/api/companion/stories", {
    method: "POST",
    body: {
      character,
      locale: "en",
      adultConfirmed: true,
      portraitPresetId: "portrait-01",
    },
  });
  assert.equal(created.status, 200);
  const story = created.json.story;
  assert.equal(story.portraitPresetId, "portrait-01");
  const path = `/api/companion/stories/${story.id}/portrait-preset`;
  const body = { presetId: "portrait-20", expectedVersion: 0 };
  assert.equal((await b.request(path, { method: "POST", body })).status, 404);
  assert.equal(
    (await a.request(path, { method: "POST", body, noCsrf: true })).status,
    403,
  );
  assert.equal(
    (
      await a.request(path, {
        method: "POST",
        body,
        origin: "https://other.test",
      })
    ).status,
    403,
  );
  const changed = await a.request(path, { method: "POST", body });
  assert.equal(changed.status, 200);
  assert.equal(changed.json.story.portraitPresetId, "portrait-20");
  assert.equal((await a.request(path, { method: "POST", body })).status, 409);
  assert.equal(h.calls(), 0);
  assert.equal((await a.request("/api/companion")).json.imageRemaining, 0);
  assert.equal(
    (await fetch(h.base + "/companion/presets/portrait-21.jpg")).status,
    404,
  );
  for (const suffix of ["", "-thumb"]) {
    const r = await fetch(
      h.base + `/companion/presets/portrait-01${suffix}.jpg`,
    );
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /image\/jpeg/);
    const bytes = new Uint8Array(await r.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [255, 216, 255]);
  }
});

test("preset changes cannot invalidate an in-flight paid story turn", async (t) => {
  const h = await setup(t);
  const a = await h.client("preset-concurrent");
  const story = (
    await a.request("/api/companion/stories", {
      method: "POST",
      body: { character, adultConfirmed: true },
    })
  ).json.story;
  h.setMode("wait");
  const turn = a.request(`/api/companion/stories/${story.id}/turn`, {
    method: "POST",
    body: { text: "Hello", clientTurnId: "slow-turn", expectedVersion: 0 },
  });
  for (let i = 0; i < 100 && !h.calls(); i++)
    await new Promise((r) => setTimeout(r, 5));
  const change = await a.request(
    `/api/companion/stories/${story.id}/portrait-preset`,
    { method: "POST", body: { presetId: "portrait-01", expectedVersion: 0 } },
  );
  h.release();
  const result = await turn;
  assert.equal(change.status, 409);
  assert.equal(change.json.error.code, "companion_busy");
  assert.match(result.text, /event: done/);
  assert.equal((await a.request("/api/companion")).json.story.turns.length, 2);
});
