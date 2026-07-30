import assert from "node:assert/strict";
import test from "node:test";

import worker from "../dist/server/index.js";

const ORIGIN = "https://game.example";

test("built Sites worker serves embedded static assets without an ASSETS binding", async () => {
  const home = await worker.fetch(new Request(`${ORIGIN}/`), {}, {});
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.match(home.headers.get("content-security-policy"), /connect-src 'self'/);
  assert.match(await home.text(), /GAME Signal Lab/);

  const script = await worker.fetch(
    new Request(`${ORIGIN}/app.js`, { method: "HEAD" }),
    {},
    {}
  );
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /^text\/javascript/);
  assert.equal(await script.text(), "");

  const admin = await worker.fetch(new Request(`${ORIGIN}/admin/`), {}, {});
  assert.equal(admin.status, 200);
  assert.equal(
    admin.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive"
  );
  assert.match(await admin.text(), /管理员登录/);

  const missing = await worker.fetch(new Request(`${ORIGIN}/missing.txt`), {}, {});
  assert.equal(missing.status, 404);
});

test("built Sites worker falls back when the production ASSETS binding returns 404", async () => {
  const env = {
    ASSETS: {
      async fetch() {
        return new Response("asset binding miss", { status: 404 });
      },
    },
  };
  const home = await worker.fetch(new Request(`${ORIGIN}/`), env, {});
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.match(await home.text(), /GAME Signal Lab/);
});
