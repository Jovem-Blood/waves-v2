CREATE TABLE `autoplay_suggestions_new` (
	`id` integer PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
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
	CONSTRAINT "autoplay_suggestions_position_range" CHECK("position" BETWEEN 0 AND 2),
	CONSTRAINT "autoplay_suggestions_duration_nonnegative" CHECK("duration_ms" >= 0)
);
--> statement-breakpoint
INSERT INTO `autoplay_suggestions_new` (
	`id`, `position`, `track_id`, `provider`, `provider_track_id`, `title`, `artists_json`,
	`album_name`, `duration_ms`, `cover_url`, `external_url`, `isrc`, `generated_at`, `seed_fingerprint`
)
SELECT
	`id`, 0, `track_id`, `provider`, `provider_track_id`, `title`, `artists_json`,
	`album_name`, `duration_ms`, `cover_url`, `external_url`, `isrc`, `generated_at`, `seed_fingerprint`
FROM `autoplay_suggestions`;
--> statement-breakpoint
DROP TABLE `autoplay_suggestions`;
--> statement-breakpoint
ALTER TABLE `autoplay_suggestions_new` RENAME TO `autoplay_suggestions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_suggestions_position_unique` ON `autoplay_suggestions` (`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_suggestions_track_unique` ON `autoplay_suggestions` (`provider`, `provider_track_id`);
