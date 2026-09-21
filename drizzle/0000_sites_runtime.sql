CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `username_norm` text NOT NULL,
  `email` text,
  `password_hash` text NOT NULL,
  `password_salt` text NOT NULL,
  `password_iterations` integer NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('admin', 'member')),
  `version` integer DEFAULT 1 NOT NULL,
  `last_mutation_token` text,
  `must_change_password` integer DEFAULT 0 NOT NULL CHECK (`must_change_password` IN (0, 1)),
  `disabled_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_norm_uq` ON `users` (`username_norm`);
--> statement-breakpoint
CREATE TABLE `memberships` (
  `user_id` text PRIMARY KEY NOT NULL,
  `plan` text DEFAULT 'free' NOT NULL CHECK (`plan` IN ('free', 'member')),
  `status` text DEFAULT 'active' NOT NULL CHECK (`status` IN ('active', 'suspended', 'expired')),
  `expires_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `csrf_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text,
  `action` text NOT NULL,
  `resource_type` text,
  `resource_id` text,
  `result` text DEFAULT 'success' NOT NULL CHECK (`result` IN ('success', 'denied', 'failure')),
  `reason_code` text,
  `request_id` text NOT NULL,
  `occurred_at` text NOT NULL,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_occurred_at_idx` ON `audit_events` (`occurred_at`);
--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_user_id`);
--> statement-breakpoint
CREATE TABLE `provider_configs` (
  `provider` text PRIMARY KEY NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL CHECK (`enabled` IN (0, 1)),
  `model` text DEFAULT 'deepseek-v4-flash' NOT NULL,
  `ciphertext` text,
  `iv` text,
  `algorithm` text DEFAULT 'AES-256-GCM' NOT NULL,
  `key_version` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `agent_access_policy` (
  `singleton_id` integer PRIMARY KEY NOT NULL CHECK (`singleton_id` = 1),
  `global_enabled` integer DEFAULT 0 NOT NULL CHECK (`global_enabled` IN (0, 1)),
  `updated_at` text NOT NULL,
  `updated_by` text,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `agent_member_grants` (
  `user_id` text PRIMARY KEY NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL CHECK (`enabled` IN (0, 1)),
  `updated_at` text NOT NULL,
  `updated_by` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `external_ai_consents` (
  `user_id` text PRIMARY KEY NOT NULL,
  `policy_version` text NOT NULL,
  `consented_at` text,
  `revoked_at` text,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
  `scope` text NOT NULL,
  `key_hash` text NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `window_started_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limits_scope_key_uq` ON `auth_rate_limits` (`scope`, `key_hash`);
--> statement-breakpoint
CREATE INDEX `auth_rate_limits_expires_at_idx` ON `auth_rate_limits` (`expires_at`);
--> statement-breakpoint
CREATE TRIGGER `auth_rate_limits_capacity_guard`
BEFORE INSERT ON `auth_rate_limits`
WHEN
  (SELECT COUNT(*) FROM `auth_rate_limits`) >= 10000
  AND NOT EXISTS (
    SELECT 1 FROM `auth_rate_limits`
    WHERE `scope` = NEW.`scope` AND `key_hash` = NEW.`key_hash`
  )
BEGIN
  SELECT RAISE(ABORT, 'auth_rate_limit_capacity');
END;
