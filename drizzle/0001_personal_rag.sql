CREATE TABLE `user_rag_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `external_id` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('profile', 'contact', 'event')),
  `title` text NOT NULL,
  `content` text NOT NULL,
  `content_hash` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_rag_documents_owner_external_uq`
  ON `user_rag_documents` (`user_id`, `external_id`);
--> statement-breakpoint
CREATE INDEX `user_rag_documents_owner_updated_idx`
  ON `user_rag_documents` (`user_id`, `updated_at`);
