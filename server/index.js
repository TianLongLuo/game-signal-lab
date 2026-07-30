import { pathToFileURL } from "node:url";

import { createBackend } from "./app.js";

export async function startFromEnvironment(env = process.env) {
  const backend = await createBackend({ env });
  const port = parsePort(env.PORT ?? "8787");
  const host = env.HOST?.trim() || "127.0.0.1";
  await backend.listen({ port, host });
  const address = backend.server.address();
  process.stdout.write(`GAME backend listening on ${address.address}:${address.port}\n`);

  const shutdown = async () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await backend.close();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return backend;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535");
  }
  return port;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startFromEnvironment().catch((error) => {
    process.stderr.write(`Failed to start GAME backend: ${error.message}\n`);
    process.exitCode = 1;
  });
}
