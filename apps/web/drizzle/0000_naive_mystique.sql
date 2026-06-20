CREATE TABLE `allowed_users` (
	`id` text PRIMARY KEY NOT NULL,
	`discord_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`enabled` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `allowed_users_discord_user_id_unique` ON `allowed_users` (`discord_user_id`);--> statement-breakpoint
CREATE TABLE `player_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`current_queue_item_id` text,
	`voice_channel_id` text,
	`guild_id` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`current_queue_item_id`) REFERENCES `queue_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "player_state_singleton_id" CHECK("player_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_track_id` text NOT NULL,
	`title` text NOT NULL,
	`artists_json` text NOT NULL,
	`album_name` text,
	`duration_ms` integer NOT NULL,
	`cover_url` text,
	`external_url` text,
	`isrc` text,
	`requested_by_discord_user_id` text,
	`requested_by_display_name` text,
	`status` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "queue_items_position_nonnegative" CHECK("queue_items"."position" >= 0),
	CONSTRAINT "queue_items_duration_nonnegative" CHECK("queue_items"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX `queue_items_status_idx` ON `queue_items` (`status`);--> statement-breakpoint
CREATE INDEX `queue_items_position_idx` ON `queue_items` (`position`);--> statement-breakpoint
CREATE INDEX `queue_items_created_at_idx` ON `queue_items` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `queue_items_active_position_unique` ON `queue_items` (`position`) WHERE "queue_items"."status" in ('queued', 'playing');--> statement-breakpoint
CREATE UNIQUE INDEX `queue_items_single_playing_unique` ON `queue_items` (`status`) WHERE "queue_items"."status" = 'playing';--> statement-breakpoint
CREATE TABLE `resolved_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`queue_item_id` text NOT NULL,
	`source_provider` text NOT NULL,
	`source_identifier` text NOT NULL,
	`stream_url` text NOT NULL,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`queue_item_id`) REFERENCES `queue_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resolved_sources_queue_item_id_idx` ON `resolved_sources` (`queue_item_id`);