CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`discord_user_id` text,
	`discord_username` text,
	`discord_global_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_kind_valid" CHECK("users"."kind" in ('guest', 'discord')),
	CONSTRAINT "users_display_name_not_empty" CHECK(length(trim("users"."display_name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_user_id_unique` ON `users` (`discord_user_id`) WHERE "users"."discord_user_id" is not null;
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);
--> statement-breakpoint
ALTER TABLE `queue_items` ADD `requested_by_user_id` text REFERENCES users(id);
--> statement-breakpoint
CREATE INDEX `queue_items_requested_by_user_id_idx` ON `queue_items` (`requested_by_user_id`);
