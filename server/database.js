import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        username_norm TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
        disabled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE memberships (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL DEFAULT 'free',
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'suspended', 'expired')),
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

      CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
        ip_hash TEXT,
        user_agent_hash TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX audit_events_created_at_idx ON audit_events(created_at);
      CREATE INDEX audit_events_actor_idx ON audit_events(actor_user_id);

      CREATE TABLE provider_configs (
        provider TEXT PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE agent_access_policy (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        global_enabled INTEGER NOT NULL DEFAULT 0 CHECK (global_enabled IN (0, 1)),
        updated_at TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE agent_member_grants (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        updated_at TEXT NOT NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    apply: migrateToVersion2,
  },
  {
    version: 3,
    apply: migrateToVersion3,
  },
];

export function openDatabase(path) {
  if (!path) throw new Error("A database path is required");
  const databasePath = path === ":memory:" ? path : resolve(path);
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  }

  const db = new DatabaseSync(databasePath);
  try {
    if (databasePath !== ":memory:") chmodSync(databasePath, 0o600);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 1000");
    if (databasePath !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT
    `);

    applyMigrations(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function applyMigrations(db) {
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version)
  );
  const knownVersions = new Set(MIGRATIONS.map((migration) => migration.version));
  const unknownVersions = [...applied].filter((version) => !knownVersions.has(version));
  if (unknownVersions.length) {
    throw new Error(
      `Database schema version is newer or unknown: ${unknownVersions.join(", ")}`
    );
  }

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (migration.sql) db.exec(migration.sql);
      else migration.apply(db);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString()
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function migrateToVersion2(db) {
  const userColumns = tableColumns(db, "users");
  if (!userColumns.has("version")) {
    db.exec("ALTER TABLE users ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
  }

  const auditColumns = tableColumns(db, "audit_events");
  const auditNeedsRebuild =
    !auditColumns.has("reason_code") ||
    !auditColumns.has("request_id") ||
    auditColumns.has("ip_hash") ||
    auditColumns.has("user_agent_hash") ||
    auditColumns.has("metadata_json");
  if (auditNeedsRebuild) {
    db.exec(`
      DROP INDEX IF EXISTS audit_events_created_at_idx;
      DROP INDEX IF EXISTS audit_events_actor_idx;
      ALTER TABLE audit_events RENAME TO audit_events_v1;

      CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
        reason_code TEXT,
        request_id TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
    `);
    const reasonExpression = auditColumns.has("reason_code") ? "reason_code" : "NULL";
    const requestExpression = auditColumns.has("request_id") ? "request_id" : "NULL";
    db.exec(`
      INSERT INTO audit_events
        (id, actor_user_id, action, target_type, target_id, outcome,
         reason_code, request_id, created_at)
      SELECT id, actor_user_id, action, target_type, target_id, outcome,
             ${reasonExpression}, ${requestExpression}, created_at
      FROM audit_events_v1;
      DROP TABLE audit_events_v1;
      CREATE INDEX audit_events_created_at_idx ON audit_events(created_at);
      CREATE INDEX audit_events_actor_idx ON audit_events(actor_user_id);
    `);
  }

  const providerColumns = tableColumns(db, "provider_configs");
  db.exec("ALTER TABLE provider_configs RENAME TO provider_configs_v1");
  db.exec(`
    CREATE TABLE provider_configs (
      provider TEXT PRIMARY KEY,
      ciphertext TEXT,
      iv TEXT,
      auth_tag TEXT,
      algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
      key_version INTEGER NOT NULL DEFAULT 1,
      model TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      CHECK (
        (ciphertext IS NULL AND iv IS NULL AND auth_tag IS NULL) OR
        (ciphertext IS NOT NULL AND iv IS NOT NULL AND auth_tag IS NOT NULL)
      )
    ) STRICT;
  `);
  const algorithmExpression = providerColumns.has("algorithm")
    ? "algorithm"
    : "'AES-256-GCM'";
  const keyVersionExpression = providerColumns.has("key_version") ? "key_version" : "1";
  const enabledExpression = providerColumns.has("enabled")
    ? "enabled"
    : "1";
  db.exec(`
    INSERT INTO provider_configs
      (provider, ciphertext, iv, auth_tag, algorithm, key_version, model, enabled,
       created_at, updated_at, updated_by)
    SELECT provider, ciphertext, iv, auth_tag, ${algorithmExpression},
           ${keyVersionExpression},
           CASE
             WHEN model IN ('deepseek-chat', 'deepseek-reasoner') THEN 'deepseek-v4-flash'
             ELSE model
           END,
           ${enabledExpression}, created_at, updated_at, updated_by
    FROM provider_configs_v1;
    DROP TABLE provider_configs_v1;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS external_ai_consents (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      policy_version TEXT NOT NULL,
      consented_at TEXT,
      revoked_at TEXT,
      updated_at TEXT NOT NULL
    ) STRICT;
  `);
}

function migrateToVersion3(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_rag_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      external_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('profile', 'contact', 'event')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, external_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS user_rag_documents_user_idx
      ON user_rag_documents(user_id, updated_at DESC);
    CREATE VIRTUAL TABLE IF NOT EXISTS user_rag_documents_fts USING fts5(
      user_id UNINDEXED,
      document_id UNINDEXED,
      kind UNINDEXED,
      title,
      content,
      tokenize = 'unicode61'
    );
    CREATE TRIGGER IF NOT EXISTS user_rag_documents_after_delete
      AFTER DELETE ON user_rag_documents
      BEGIN
        DELETE FROM user_rag_documents_fts WHERE rowid = old.id;
      END;
  `);
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

export function runTransaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    if (result && typeof result.then === "function") {
      throw new TypeError("DatabaseSync transaction callbacks must be synchronous");
    }
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
