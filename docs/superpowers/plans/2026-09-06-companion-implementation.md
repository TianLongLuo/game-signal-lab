# Companion first-release implementation

Goal: deliver the approved adult, fictional romance companion on Linux/Node and publish the reviewed change to the existing GitHub branch. Do not deploy Sites.
Architecture: isolated companion HTML/CSS/JS entry; session-authenticated companion API; SQLite source of truth; bounded DeepSeek SSE; private optional generated artwork. Legacy application remains at /legacy/.
Tech stack: existing Node 22/SQLite, vanilla modules, existing authentication and ASR.
Spec: docs/superpowers/specs/2026-09-06-companion-romance-design.md (user approved Sep 6).

## Global constraints
- Preserve legacy storage and endpoints. Never send legacy contacts to companion models.
- Every companion read/write derives owner from session; writes need Origin and CSRF.
- Require adult character + explicit private-server-storage/external-provider consent.
- No TTS. No automatic voice send. Text budget reuses existing quota.
- Image provider absent => truthful unconfigured state, no simulated generated character.
- Honest staged release: neutral portrait and first background generation first; no promise of finished infinite chapters or reference-consistent expressions without validated adapter.
- New Node root enabled unless COMPANION_ENABLED=false. Sites build retains legacy root.

## Task 1: server domain and persistence (Codex)
Create server/companion.js and tests/companion.test.mjs; append migration 6 in database.js.
Test red: session ownership, adult confirmation, version/idempotency conflicts, incomplete generation, memory deletion. Implement draft, story, turns, memories and explicit branch state.
Integrate /api/companion routes in server/app.js using existing auth/CSRF/quota helpers; separate private data from admin legacy conversation archives.
API contract in docs/superpowers/plans/companion-api.md, shared with UI. Run node --test tests/companion.test.mjs.

## Task 2: companion frontend (scoped implementer)
Create companion/index.html, styles.css, app.js and src/companion-client.js only. Three tabs, adult character creation, confirmation, stream dialogue and user choices, memories CRUD, world overview, inline auth/settings modal, voice capture with full draft preservation/manual sending. Bilingual, keyboard/reduced-motion/mobile. Tests first for stream/voice pure helpers. API contract is binding; no backend edits.

## Task 3: provider and legacy integration (Codex)
Reuse encrypted DeepSeek config and existing quota; bounded cancellable completion. Optional private image jobs with explicit server environment configuration, durable statuses, timeout/cancel/retry, successful-result accounting. No runtime use of development imagegen tool. Node-only new root and /legacy mappings; capability endpoint. Exact same-origin source policy. Test failed/missing providers and foreign assets.

## Task 4: documentation, review and verification
Update deployment instructions with backup, migration, feature rollback, image configuration and genuine limitations. Keep production secrets out. Run npm run check and targeted module syntax. Review frontend/backend boundary and tests. No real-account/personal-data browser tests. GitHub connector publish and verify remote tree; report branch and commit.

## Execution decisions
- Existing clean non-main feature checkout retained to preserve the pending approved spec commit and user branch; no worktree operation performed without additional consent.
- Static atmosphere is explicitly decorative, not represented as AI-generated portrait. Story text stays usable when optional image configuration is absent.
- Companion vector retrieval now uses a dedicated scoped Qdrant collection and revalidates every hit against SQLite; recent confirmed same-story data is the fallback only.
- Local Hermes was attempted for low-risk UI copy review; its log directory write was denied. Codex completed the copy/checking fallback without changing Hermes permissions.
