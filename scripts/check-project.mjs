import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "SECURITY.md",
  "index.html",
  "styles.css",
  "app.js",
  "runtime-config.js",
  "src/platform-client.js",
  "src/signal-engine.js",
  "src/state-schema.js",
  "admin/index.html",
  "admin/styles.css",
  "admin/app.js",
  "server/app.js",
  "server/database.js",
  "server/index.js",
  "server/security.js",
  "sites-runtime/index.js",
  "db/schema.ts",
  "drizzle/0000_sites_runtime.sql",
  "build-sites/build-sites.mjs",
  ".openai/hosting.json",
  "docs/PRD.md",
  "docs/ARCHITECTURE.md",
  "docs/DATA_MODEL.md",
  "docs/SAFETY.md",
  "docs/CONTENT_EVALUATION.md",
  ".github/pull_request_template.md",
  ".github/workflows/quality.yml",
];

for (const path of requiredFiles) {
  const info = await stat(path);
  assert.ok(info.isFile(), `${path} must be a file`);
}

const index = await readFile("index.html", "utf8");
assert.match(index, /Content-Security-Policy/);
assert.match(index, /connect-src 'self'/);
assert.match(index, /<script src="\.\/runtime-config\.js"><\/script>/);
assert.match(index, /<script type="module" src="\.\/app\.js"><\/script>/);
assert.doesNotMatch(
  index,
  /<(?:script|link|img)\b[^>]*\b(?:src|href)=["']https?:\/\//i,
  "index.html must not load external resources"
);

const app = await readFile("app.js", "utf8");
assert.doesNotMatch(app, /\bfetch\s*\(/, "app must not send relationship data over fetch");
assert.doesNotMatch(app, /\bXMLHttpRequest\b|\bWebSocket\b/, "app must not create network clients");

const platformClient = await readFile("src/platform-client.js", "utf8");
assert.match(platformClient, /\/api\/agent\/stream/);
assert.doesNotMatch(
  platformClient,
  /game-signal-lab:v2|toPortableState|contactId|boundaryStatus/,
  "platform client must not read or upload the local relationship journal"
);

const runtimeConfig = await readFile("runtime-config.js", "utf8");
assert.match(runtimeConfig, /apiEnabled:\s*false/);

const server = await readFile("server/app.js", "utf8");
assert.match(server, /ADMIN_BOOTSTRAP_PASSWORD/);
assert.match(server, /GAME_SAFETY_SYSTEM_PROMPT/);

const safety = await readFile("docs/SAFETY.md", "utf8");
for (const phrase of ["明确拒绝", "持续回避", "explicitDecline", "delayAvoidance"]) {
  assert.ok(safety.includes(phrase), `docs/SAFETY.md must cover ${phrase}`);
}

console.log(`Project structure check passed (${requiredFiles.length} required files).`);
