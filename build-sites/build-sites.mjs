import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "dist");
const staticRoot = join(dist, "static");

const staticEntries = [
  ["index.html", "index.html"],
  ["app.js", "app.js"],
  ["analytics.js", "analytics.js"],
  ["styles.css", "styles.css"],
  ["zine-system.css", "zine-system.css"],
  ["assets", "assets"],
  ["blog", "blog"],
  ["en", "en"],
  ["privacy", "privacy"],
  ["src", "src"],
  ["vendor", "vendor"],
  ["admin/index.html", "admin/index.html"],
  ["admin/app.js", "admin/app.js"],
  ["admin/styles.css", "admin/styles.css"],
  ["admin/zine-system.css", "admin/zine-system.css"],
];

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "server"), { recursive: true });
await mkdir(staticRoot, { recursive: true });
await mkdir(join(dist, ".openai"), { recursive: true });

await cp(
  join(root, ".openai", "hosting.json"),
  join(dist, ".openai", "hosting.json")
);

for (const [source, destination] of staticEntries) {
  const from = join(root, source);
  try {
    await access(from);
  } catch {
    continue;
  }
  await mkdir(dirname(join(staticRoot, destination)), { recursive: true });
  await cp(from, join(staticRoot, destination), { recursive: true });
}

await writeFile(
  join(staticRoot, "runtime-config.js"),
  "window.__GAME_RUNTIME__ = Object.freeze({ apiEnabled: true, deployment: \"sites\" });\n",
  "utf8"
);

const runtimeSource = await readFile(join(root, "sites-runtime", "index.js"), "utf8");
const embeddedAssets = {};
for (const file of await listFiles(staticRoot)) {
  const publicPath = `/${relative(staticRoot, file).split(sep).join("/")}`;
  const contentType = contentTypeFor(file);
  const binary = isBinaryContentType(contentType);
  embeddedAssets[publicPath] = {
    body: await readFile(file, binary ? "base64" : "utf8"),
    bodyEncoding: binary ? "base64" : "utf8",
    contentType,
    cacheControl: publicPath.endsWith(".html")
      ? "no-cache"
      : "public, max-age=300, must-revalidate",
  };
}

function isBinaryContentType(contentType) {
  return contentType.startsWith("image/") || contentType === "application/octet-stream";
}
const assetMarker = "const EMBEDDED_STATIC_ASSETS = null;";
if (!runtimeSource.includes(assetMarker)) {
  throw new Error("Sites runtime is missing the embedded-static-assets marker");
}
await writeFile(
  join(dist, "server", "index.js"),
  runtimeSource.replace(
    assetMarker,
    `const EMBEDDED_STATIC_ASSETS = Object.freeze(${JSON.stringify(embeddedAssets)});`
  ),
  "utf8"
);

try {
  await access(join(root, "drizzle"));
  await cp(join(root, "drizzle"), join(dist, ".openai", "drizzle"), {
    recursive: true,
  });
} catch {
  // A build without schema changes can omit migrations.
}

await Promise.all([
  access(join(dist, "server", "index.js")),
  access(join(dist, "static", "index.html")),
  access(join(dist, ".openai", "hosting.json")),
  access(join(dist, ".openai", "drizzle", "0000_sites_runtime.sql")),
]);

process.stdout.write(
  [
    "Sites artifact ready:",
    "  dist/server/index.js",
    "  dist/static/",
    "  dist/.openai/hosting.json",
    "  dist/.openai/drizzle/",
    "",
  ].join("\n")
);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

function contentTypeFor(path) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".webp": "image/webp",
    }[extname(path)] ?? "application/octet-stream"
  );
}
