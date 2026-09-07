# Visual novel stage update · 2026-09-06

## Shipped scope

- Node companion entry: full-viewport illustrated stage, independent narrator / player / companion dialogue, streaming type-in with reveal-all, history and collapsible choices.
- Twenty existing illustrated adults (15 women, 5 men), plus five new locally bundled backgrounds: café, rainy street, living room, coast and garden. No image-provider configuration or credits are needed for these presets.
- Scene-matched SVG rain, waves, leaves and light particles; reduced-motion setting and system preference disable decorative motion. Artwork prompts are in `companion/scenes/prompts.json`. Background JPEGs total about 1.5 MB; only the current scene is requested.
- Optional bilingual reference page at `/companion/guide/`. User-supplied course material is summarized critically, not uploaded or reproduced.

## Relationship events

The server stores a private per-story seed inside the existing encrypted story document. New conversations sample a beat only at explicit progression / “share another moment” or every third successful turn; retries and refreshes do not reroll it. Failed streams do not commit an event.

At creation, 25% of stories are steady, 60% balanced and 15% eventful. At eligible beats, base weights are:

| Temperament | Normal | Sweet | Conflict | Painful | Breakup |
|---|---:|---:|---:|---:|---:|
| Steady | 60 | 40 | 0 | 0 | 0 |
| Balanced | 58 | 27 | 8 | 5 | 2 |
| Eventful | 42 | 28 | 15 | 10 | 5 |

Unresolved tension moves up to six percentage points from normal to conflict. Explicit talk/space choices during conflict lead to repair; the player may also choose to end a relationship with confirmation. A steady story can remain conflict-free throughout, while other stories may end early. Outcomes never depend on payment, login frequency or absence. These are authored game rules, not psychological predictions.

An ending preserves the story, turns and memories in read-only mode. No automatic deletion, forced recovery quest or payment prompt. Earlier stories gain a deterministic state on read and persist it on their next successful turn without erasing existing data. Scene count remains the existing three authored chapter titles, with five possible visual environments—not an unlimited chapter-generation system.

The model receives the planned event and is asked to write only its character's spoken words. Narration comes from the engine. Existing historical messages are preserved rather than destructively rewritten; old mixed-prose replies can still contain their original wording.

## Recording changes

- FunASR only. Removed cloud voice fallback, TTS endpoints, obsolete provider controls and runtime code.
- Recording stops on user action (or the existing safety duration limit), uploads once, then returns a complete editable transcript. It is not advertised as incremental ASR.
- Default upstream ASR deadline: 20 seconds; browser deadline: 35 seconds. Errors release the in-flight slot; the next recording can start. Disconnects abort the proxy request. Already-running CPU inference may continue until the inference worker finishes.
- Raw transcript is immediately sendable. DeepSeek punctuation is an optional separate action; late results never replace newer edits. There is no automatic sending or voice playback.
- WebSocket adapters must signal an independent whole-recording `is_end` ACK. Segment-level `is_final` is not sufficient. For stock servers without that ACK, use the provided HTTP adapter or implement the terminal ACK; otherwise the request times out rather than silently truncating.

## Upgrade

Follow `docs/COMPANION_RELEASE.md` for git pull, dependency installation, database backup and Node service restart. This release appends migration 7 to delete the obsolete encrypted voice-provider configuration; earlier migrations are unchanged. Existing DeepSeek and FunASR settings remain. No production database migration or deployment is performed by committing this release.

On a 2-core / 4 GB host, keep FunASR concurrency at one, prewarm the model, and avoid running image generation locally. The preset JPEGs and SVG effects execute on the client. Actual microphone accuracy, CPU latency and throughput must be measured on your deployment; mocked tests do not establish production performance.

## Verification

Run `npm run check`. New tests cover deterministic distribution, early and explicit endings, retry stability, role separation, initial narration, reduced-motion/typewriter cleanup, bundled assets, multi-segment ASR completion, cancellation, repeated calls and nonblocking punctuation.

Browser visual checks use fictional fixture data. Real microphone and production-provider integration still require a deployment smoke test. Sites remains the legacy application; this release is published to GitHub only.

Verified before publication: 129/129 tests passed, syntax and static-build checks passed. Chromium visual fixtures at 1440×1000 and 390×844 loaded all artwork; mobile Send remains within the viewport, navigation is visible, Enter toggles choices, and reduced-motion disables the decorative SVG animation. Production voice providers and microphones were not exercised. Existing dependency audit still reports one moderate and one high issue, documented in the prior companion release.
