CREATE TABLE `agent_usage_quotas` (
  `user_id` text PRIMARY KEY NOT NULL,
  `included_limit` integer DEFAULT 50 NOT NULL CHECK (`included_limit` >= 0),
  `used_count` integer DEFAULT 0 NOT NULL CHECK (`used_count` >= 0),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_usage_quotas_remaining_idx`
  ON `agent_usage_quotas` (`used_count`, `included_limit`);
--> statement-breakpoint
INSERT INTO `agent_usage_quotas`
  (`user_id`, `included_limit`, `used_count`, `created_at`, `updated_at`)
SELECT `id`, 50, 0, datetime('now'), datetime('now')
FROM `users`
WHERE `role` = 'member';
