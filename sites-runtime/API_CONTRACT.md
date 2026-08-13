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
    "policyVersion": "2026-08-02-v2",
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

After current external-AI consent and an explicit Agent form submission, the
browser updates that user's bounded anonymous profile/contact/event records
through `PUT /api/me/knowledge` before calling the model:

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

## MiMo V2.5 TTS configuration and TTS/ASR proxy

Administrator configuration is available at
`/api/admin/v1/integrations/mimo-tts`. The upstream base URL is fixed to
`https://token-plan-cn.xiaomimimo.com/v1/`; accepted models are `mimo-v2.5-tts` and the
legacy-compatible `mimo-v2-tts`. The GET response only exposes
`apiKeyConfigured`, never a key or masked suffix. Keys are encrypted with the
same AES-256-GCM service-side configuration used for DeepSeek.

`POST /api/voice/tts` accepts a short `{ "text": string, "voice"?: string }`
payload. Add `"stream": true` to use MiMo's low-latency streaming contract:
the Worker requests `audio.format = "pcm16"` and proxies the SSE audio deltas
without buffering; the browser schedules 24 kHz mono PCM chunks immediately.
Without `stream`, the endpoint retains the WAV compatibility response. It
requires the same authentication, Agent entitlement and current external-AI
consent as the text Agent. Prompts, audio payloads and provider response
bodies are not persisted or written to audit logs.

`POST /api/voice/asr` accepts a WAV or MP3 data URL in
`{ "audio": "data:<audio-mime>;base64,...", "priority": "live|final",
"language": "auto|zh|en" }`. Add `"stream": true` to
receive MiMo's SSE partial text deltas; without it the endpoint returns the
final JSON response. Browser PCM is downsampled and
encoded as mono 16 kHz WAV before upload; WebM, OGG and MP4 are rejected because
the upstream MiMo V2.5 ASR contract does not accept them. The client sends
small incremental WAV chunks over the streaming ASR contract while recording
(2.2 second cadence, 1.2 second minimum), then sends the full WAV on stop for
final correction before the text is organized. Final requests preempt a stale
same-user live request and briefly wait for the single local CPU slot; live
requests never fall back to the slower cloud provider. The browser adopts its
already visible live transcript when the bounded final pass runs long, and
offers an explicit “use current text” action instead of locking the editor.
The endpoint
requires the same authentication, Agent entitlement and current external-AI
consent, and calls the fixed `mimo-v2.5-asr` model with the official
`input_audio` message shape. It returns `{ "text": string }`; uploaded audio
and provider response bodies are not persisted or written to audit logs.

After the final full-audio pass, the browser may call
`POST /api/voice/organize` with `{ "text": string }`. This endpoint uses the
configured DeepSeek model to add minimal punctuation and paragraph breaks and
correct only obvious ASR ambiguities while preserving facts, code-switching,
proper nouns and uncertainty. It returns `{ "text": string, "provider":
"deepseek" }`, requires the same authentication, Agent entitlement and current
external-AI consent, and never writes the transcript or provider response to
audit logs.

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
