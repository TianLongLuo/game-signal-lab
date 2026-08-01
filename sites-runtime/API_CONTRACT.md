# Sites runtime API contract

This contract describes the security-sensitive differences enforced by the
Cloudflare Worker deployment adapter.

## Authentication

Before `POST /api/auth/register`, `POST /api/auth/login`, or
`POST /api/admin/v1/session`, the client must:

1. request `GET /api/auth/csrf`;
2. retain the returned Secure, HttpOnly pre-auth cookie;
3. echo the returned `csrfToken` in `X-CSRF-Token`; and
4. send an `Origin` header exactly matching the request origin.

Every unsafe method requires an exact same-origin `Origin`. Authenticated
mutations additionally require the session CSRF token.

## External-AI consent

`GET /api/me` returns:

```json
{
  "externalAiConsent": {
    "policyVersion": "2026-07-30-v1",
    "accepted": true,
    "current": true,
    "consentedAt": "2026-07-30T00:00:00.000Z"
  }
}
```

Agent calls require `current: true`. Consent is created or revoked only through
`PUT /api/me/external-ai-consent`; submitting an Agent prompt never creates
consent.

## Personal knowledge / RAG isolation

The browser may explicitly synchronize a user's selected anonymous profile and
event records through `PUT /api/me/knowledge`:

```json
{
  "documents": [
    {
      "externalId": "contact:local-id",
      "kind": "contact",
      "title": "A · 对象档案",
      "content": "用户主动选择同步的最少必要内容"
    }
  ]
}
```

The endpoint requires the authenticated session, session CSRF, exact same
origin, and current external-AI consent. Documents are stored with a mandatory
`user_id` owner key, bounded length/count, and a per-owner index. `GET
/api/me/knowledge` returns only the current user's document count and update
time; `DELETE /api/me/knowledge` clears that user's records. Revoking external
AI consent also clears the user's server-side knowledge records.

`POST /api/agent/stream` retrieves only documents whose `user_id` equals the
authenticated session user. The retrieved snippets are added as a server-owned
private context before the DeepSeek call; the client cannot provide a system
message or another user's identifier. Administrators receive no document
content or search results. Sites/D1 does not expose a vector extension, so this
adapter is a bounded owner-filtered fallback; Linux/Node production uses the
Qdrant vector adapter documented in `docs/DEPLOY_LINUX.md`.

## Agent authorization

Agent access is:

```text
global_enabled AND (
  administrator
  OR (
    membership is active
    AND membership is unexpired
    AND per-user Agent grant is enabled
  )
)
```

No role bypasses the global switch.

The canonical administrator endpoints for the global switch are:

- `GET /api/admin/v1/integrations/deepseek/access`, returning
  `{ "globalEnabled": boolean }`;
- `PATCH /api/admin/v1/integrations/deepseek/access`, accepting only
  `{ "globalEnabled": boolean }`.

The mutation requires an administrator session, exact same-origin `Origin`, and
the session CSRF token. The policy change and its `agent.global.enable` or
`agent.global.disable` audit event execute in one D1 batch. The former
`/api/admin/deepseek/access` and `/api/admin/deepseek/access/global` routes
remain available as compatibility aliases.

## DeepSeek configuration

The endpoint is fixed internally to `https://api.deepseek.com/`. Provider
configuration requests must not include `baseUrl`.

Accepted model values are exactly:

- `deepseek-v4-flash` — default;
- `deepseek-v4-pro`.

Legacy `deepseek-chat` and `deepseek-reasoner` values return `400
INVALID_MODEL`.

## MiMo V2.5 TTS configuration and proxy

Administrator configuration is available at
`/api/admin/v1/integrations/mimo-tts`. The upstream base URL is fixed to
`https://api.xiaomimimo.com/v1/`; accepted models are `mimo-v2.5-tts` and the
legacy-compatible `mimo-v2-tts`. The GET response only exposes
`apiKeyConfigured`, never a key or masked suffix. Keys are encrypted with the
same AES-256-GCM service-side configuration used for DeepSeek.

`POST /api/voice/tts` accepts a short `{ "text": string, "voice"?: string }`
payload. It requires the same authentication, Agent entitlement and current
external-AI consent as the text Agent. The Worker calls MiMo server-side and
returns only audio bytes; prompts, audio payloads and provider response bodies
are not persisted or written to audit logs.

## Entitlement mutation

`PATCH /api/admin/v1/users/{userId}/entitlements` changes exactly one
entitlement per request and requires `expectedVersion` plus a fixed
`reasonCode`:

- `membership_approved`
- `membership_revoked`
- `agent_approved`
- `agent_revoked`
- `security_review`
- `account_request`

The entitlement mutation, optimistic-version marker, and audit record execute
in the same D1 batch.

`GET /api/admin/v1/users` returns `expiresAt` for each account.
`membershipEnabled` is true only when the membership plan is `member`, its
status is `active`, and `expiresAt` is either absent or later than the current
time.

## Streaming response

`POST /api/agent/stream` returns sanitized SSE. Each output event may contain
only:

- `choices[0].delta.role` with value `assistant`;
- `choices[0].delta.content`;
- a known `choices[0].finish_reason`;
- the terminal `data: [DONE]`.

Provider IDs, model names, usage, indexes, system fingerprints, log probabilities,
and reasoning fields are removed. The stream fails closed on malformed frames,
unexpected roles, an oversized frame, output overflow, timeout, client
cancellation, or a missing `[DONE]`.
