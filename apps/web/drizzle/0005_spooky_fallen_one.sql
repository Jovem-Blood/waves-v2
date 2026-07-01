CREATE TABLE `discord_login_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`discord_user_id` text NOT NULL,
	`discord_username` text NOT NULL,
	`discord_global_name` text,
	`discord_avatar_url` text,
	`guild_id` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_login_tokens_token_hash_unique` ON `discord_login_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `discord_login_tokens_discord_user_id_idx` ON `discord_login_tokens` (`discord_user_id`);--> statement-breakpoint
CREATE INDEX `discord_login_tokens_expires_at_idx` ON `discord_login_tokens` (`expires_at`);