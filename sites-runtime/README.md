# Sites / Cloudflare Worker runtime

This directory is the deployment adapter for OpenAI Sites. It deliberately
keeps the relationship journal local to the browser while moving only accounts,
membership and Agent authorization, audit metadata, external-AI consent, and
encrypted provider configuration into D1.

## Artifact contract

Run:

```sh
node build-sites/build-sites.mjs
```

The build emits the Sites contract without changing the existing local Node
runtime:

- `dist/server/index.js`: Cloudflare Worker-compatible ESM entry point，并内嵌一份经过构建校验的静态资源回退；托管环境未注入 `ASSETS` binding，或该 binding 对已知资源返回 404 时，首页仍可正常提供。
- `dist/static/**`: 同一份主站与管理员控制台资源，保留给支持静态资源 binding 的托管路径。
- `dist/.openai/hosting.json`: logical D1 binding declaration.
- `dist/.openai/drizzle/**`: D1 migration bundle.

The official Sites `package-site.sh` helper can then stage these files into the
deployment archive. A Sites project must be created only once; its opaque
`project_id` is added to `.openai/hosting.json` by the publishing flow.

## Runtime secrets

Configure these with the Sites runtime environment controls, never in source:

- `ADMIN_BOOTSTRAP_PASSWORD`: one-time credential used to create the first
  administrator on a successful login. No default exists.
- `CONFIG_MASTER_KEY`: exactly 32 random bytes encoded as base64/base64url, or
  64 hexadecimal characters. It encrypts the DeepSeek key with AES-256-GCM and
  keys privacy-preserving authentication rate-limit identifiers.
- `ADMIN_BOOTSTRAP_USERNAME`: optional; defaults to `Drac`.

The supplied bootstrap password is never written into a migration, a static
asset, a log, or an audit event. A bootstrap password shorter than the normal
12-character user policy is accepted only for the reserved administrator and
marks the account as requiring rotation.

The DeepSeek API key is entered in the administrator console, encrypted before
being written to D1, and never returned to the browser—not even as a suffix.
The Worker pins the provider endpoint to `https://api.deepseek.com/` and accepts
only `deepseek-v4-flash` or `deepseek-v4-pro`, defaulting to Flash. Legacy
`deepseek-chat` and `deepseek-reasoner` values are rejected; the browser cannot
override the endpoint.

## Data boundary

D1 stores only:

- account and membership state;
- Agent grants and the global access policy;
- session hashes and CSRF hashes;
- minimal audit metadata with fixed reason codes, but no network fingerprints;
- bounded, expiring authentication rate-limit counters in a dedicated table;
- external-AI consent metadata;
- encrypted provider configuration.

Anonymous contacts, relationship events, analysis text, review text, Agent
prompts, and Agent responses are not persisted in D1. The Worker streams model
output through to the browser and records only invocation metadata.

## Request and Agent safety

- Browser mutations require a present, exact same-origin `Origin` header.
- Registration and both user/admin login flows first fetch
  `GET /api/auth/csrf`, then echo its signed token in `X-CSRF-Token`; the matching
  token is also held in a Secure, HttpOnly, SameSite cookie.
- Agent access is
  `global_enabled AND (admin OR active, unexpired member with a per-user grant)`.
- The canonical administrator interface for the global policy is
  `GET`/`PATCH /api/admin/v1/integrations/deepseek/access`; its change and
  corresponding audit event are committed in one D1 batch.
- A current, explicit external-AI consent record is required before every
  Agent call. Sending a prompt never creates consent implicitly.
- The Worker parses upstream SSE and emits only `delta.role`,
  `delta.content`, a known `finish_reason`, and `[DONE]`. Provider identifiers,
  usage, and reasoning fields are dropped. Missing `[DONE]`, oversized frames,
  output caps, timeout, and client cancellation all fail closed.

## Authentication note

This adapter preserves the repository's existing username/password product
flow. For a private workspace-only Sites deployment, dispatch-owned ChatGPT
authentication and the `oai-authenticated-user-email` header can replace this
flow later. Authorization remains server-side in either model.
