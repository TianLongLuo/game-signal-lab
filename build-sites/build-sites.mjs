import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = join(root, "dist");
const staticRoot = join(dist, "static");

const staticEntries = [
  ["index.html", "index.html"],
  ["app.js", "app.js"],
  ["styles.css", "styles.css"],
  ["src", "src"],
  ["admin", "admin"],
];

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "server"), { recursive: true });
await mkdir(staticRoot, { recursive: true });
await mkdir(join(dist, ".openai"), { recursive: true });

await cp(
  join(root, "sites-runtime", "index.js"),
  join(dist, "server", "index.js")
);
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
