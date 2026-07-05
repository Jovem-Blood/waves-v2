CREATE TABLE `autoplay_suggestions` (
	`id` integer PRIMARY KEY NOT NULL,
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
	`generated_at` text NOT NULL,
	`seed_fingerprint` text NOT NULL,
	CONSTRAINT "autoplay_suggestions_singleton_id" CHECK("autoplay_suggestions"."id" = 1),
	CONSTRAINT "autoplay_suggestions_duration_nonnegative" CHECK("autoplay_suggestions"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE `autoplay_rejections` (
	`spotify_track_id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `autoplay_rejections_expires_at_idx` ON `autoplay_rejections` (`expires_at`);
