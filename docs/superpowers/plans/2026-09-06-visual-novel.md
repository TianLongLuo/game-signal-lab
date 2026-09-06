# Visual Novel Upgrade Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development for isolated tasks, root integrates and publishes.

**Goal:** Deliver the user-approved visual novel stage, causal varied relationship stories and FunASR-only voice input.
**Architecture:** Keep the existing owner-scoped encrypted companion store and streaming transport. Add a deterministic relationship-event engine and public bundled stage artwork; keep view rendering independent from authoritative plot state. Remove runtime MiMo integrations, preserve immutable migration history and legacy user data.
**Tech Stack:** Vanilla JS/CSS/SVG, Node SQLite, existing DeepSeek and FunASR.
**Spec:** User approved the five-part design in this conversation; balanced relationship mode and generated visual assets explicitly approved.

## Constraints
- Adult fictional romance only; distinguish player speech, character speech and narration.
- Events follow seeded per-story probability, context and explicit player choices; no reroll on retries, no login guilt or payment-based emotional pressure.
- Conflict-free runs and early separations both possible. Failed streams never advance the plot. Ending remains readable, never deletes history.
- Input remains editable and requires explicit Send. Transcription cleanup must not overwrite newer edits or block indefinitely.
- No runtime MiMo network requests or configuration UI. Preserve migrations already published; cleanup obsolete stored provider config via a new migration if necessary.
- Keep 20 portraits (15 women, 5 men); generate and bundle five environment backgrounds; SVG/CSS motion is decorative, accessible, reduced-motion compatible.
- Do not publish the supplied DOCX verbatim. Write a bilingual optional reference guide distinguishing source claims and practical suggestions; explicit refusals remain refusals.
- GitHub only, no production deployment. No private data/keys in tests or logs.

## Task A — FunASR-only transcription (voice agent)
Files: server/app.js, src/platform-client.js, legacy app.js, admin/, sites-runtime/, deploy/funasr/, ASR tests and runtime docs. Excludes companion/app.js and companion/styles.css.
- [x] Add failing tests for no cloud fallback, cancellation/timeout and repeated calls.
- [x] Remove MiMo runtime integrations/configuration, repair FunASR lifecycle and return actionable errors.
- [x] Update runtime/legacy documentation and run focused tests.

## Task B — Galgame stage (UI agent)
Files: companion/app.js, companion/index.html, companion/styles.css, src/companion-stage.js, client tests.
- [x] Add tests for speaker labels, stream rendering, response drawer, stage selection, accessibility and voice-draft preservation.
- [x] Build full-viewport stage, translucent dialogue panel, player/character/narrator separation, atmosphere layers and mobile layout.
- [x] Keep responsive streaming and cancelable voice transcription; make punctuation optional/nonblocking.

## Task C — Relationship engine and assets (root)
Files: server/companion-events.js, server/companion.js, server/companion-api.js, src/companion-scenes.js, companion/scenes/, reference guide, engine/API tests.
- [x] Test deterministic weighted events, early breakup, peaceful path, repair, explicit ending and replay.
- [x] Persist relationship state only with successful turns; expose speaker-tagged event narration, prevent model from speaking for player.
- [x] Generate five illustrated settings and publish bundled asset manifest; add optional bilingual guide.

## Task D — Integration and delivery (root/reviewer)
- [x] Verify static routes, no MiMo requests, all real image files and model-independent test coverage.
- [x] Independent review; run npm run check and build:sites; document target-server benchmarks still required.
- [ ] Commit explicit files, upload through GitHub connector and verify remote tree and branch.
