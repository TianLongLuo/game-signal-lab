import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    usernameNorm: text("username_norm").notNull(),
    email: text("email"),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    version: integer("version").notNull().default(1),
    lastMutationToken: text("last_mutation_token"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    disabledAt: text("disabled_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_username_norm_uq").on(table.usernameNorm)]
);

export const memberships = sqliteTable("memberships", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: text("plan", { enum: ["free", "member"] }).notNull().default("free"),
  status: text("status", {
    enum: ["active", "suspended", "expired"],
  })
    .notNull()
    .default("active"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfHash: text("csrf_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    result: text("result", { enum: ["success", "denied", "failure"] })
      .notNull()
      .default("success"),
    reasonCode: text("reason_code"),
    requestId: text("request_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("audit_events_occurred_at_idx").on(table.occurredAt),
    index("audit_events_actor_idx").on(table.actorUserId),
  ]
);

export const providerConfigs = sqliteTable("provider_configs", {
  provider: text("provider").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  model: text("model").notNull().default("deepseek-v4-flash"),
  ciphertext: text("ciphertext"),
  iv: text("iv"),
  algorithm: text("algorithm").notNull().default("AES-256-GCM"),
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const agentAccessPolicy = sqliteTable("agent_access_policy", {
  singletonId: integer("singleton_id").primaryKey(),
  globalEnabled: integer("global_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const agentMemberGrants = sqliteTable("agent_member_grants", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export const agentUsageQuotas = sqliteTable(
  "agent_usage_quotas",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    includedLimit: integer("included_limit").notNull().default(50),
    usedCount: integer("used_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("agent_usage_quotas_remaining_idx").on(
      table.usedCount,
      table.includedLimit
    ),
  ]
);

export const externalAiConsents = sqliteTable("external_ai_consents", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  policyVersion: text("policy_version").notNull(),
  consentedAt: text("consented_at"),
  revokedAt: text("revoked_at"),
  updatedAt: text("updated_at").notNull(),
});

export const authRateLimits = sqliteTable(
  "auth_rate_limits",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_rate_limits_scope_key_uq").on(
      table.scope,
      table.keyHash
    ),
    index("auth_rate_limits_expires_at_idx").on(table.expiresAt),
  ]
);

export const userRagDocuments = sqliteTable(
  "user_rag_documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    kind: text("kind", { enum: ["profile", "contact", "event"] }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("user_rag_documents_owner_external_uq").on(
      table.userId,
      table.externalId
    ),
    index("user_rag_documents_owner_updated_idx").on(
      table.userId,
      table.updatedAt
    ),
  ]
);
