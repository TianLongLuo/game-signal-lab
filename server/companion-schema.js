// Additive Linux migration; companion content never shares legacy message tables.
export const COMPANION_MIGRATION = `
CREATE TABLE companion_consents (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 policy_version TEXT NOT NULL, accepted INTEGER NOT NULL CHECK(accepted IN(0,1)), updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE companion_stories (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 0,
 data TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE companion_turns (
 id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES companion_stories(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client_turn_id TEXT NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(story_id, client_turn_id)
) STRICT;
CREATE TABLE companion_memories (
 id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES companion_stories(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_turn_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE TABLE companion_jobs (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 story_id TEXT NOT NULL REFERENCES companion_stories(id) ON DELETE CASCADE,
 client_job_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('portrait','scene')),
 scene INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN('queued','running','succeeded','failed','cancelled')),
 error_code TEXT, asset_id TEXT, created_at TEXT NOT NULL,
 UNIQUE(user_id, client_job_id)
) STRICT;
CREATE TABLE companion_assets (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 story_id TEXT NOT NULL REFERENCES companion_stories(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, scene INTEGER NOT NULL, data BLOB NOT NULL,
 confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN(0,1)), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE companion_image_usage (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 used INTEGER NOT NULL DEFAULT 0 CHECK(used >= 0)
) STRICT;
CREATE TABLE companion_index_queue (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 generation INTEGER NOT NULL DEFAULT 1, retry_at INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE companion_memory_exclusions (
 story_id TEXT NOT NULL REFERENCES companion_stories(id) ON DELETE CASCADE,
 source_turn_id TEXT NOT NULL, PRIMARY KEY(story_id,source_turn_id)
) STRICT;
CREATE INDEX companion_turn_story ON companion_turns(story_id, created_at);
CREATE INDEX companion_memory_story ON companion_memories(story_id, created_at);
CREATE INDEX companion_job_queue ON companion_jobs(status, created_at);
`;
