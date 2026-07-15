ALTER TABLE `queue_items` ADD `origin` text DEFAULT 'human' NOT NULL CHECK (`origin` in ('human', 'autoplay'));
--> statement-breakpoint
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
	`strategy` text DEFAULT 'similar' NOT NULL,
	`source_tag` text,
	CONSTRAINT "autoplay_suggestions_position_range" CHECK("position" BETWEEN 0 AND 5),
	CONSTRAINT "autoplay_suggestions_duration_nonnegative" CHECK("duration_ms" >= 0),
	CONSTRAINT "autoplay_suggestions_strategy_valid" CHECK("strategy" IN ('similar', 'adjacent', 'explore', 'fallback'))
);
--> statement-breakpoint
INSERT INTO `autoplay_suggestions_new` (
	`id`, `position`, `track_id`, `provider`, `provider_track_id`, `title`, `artists_json`,
	`album_name`, `duration_ms`, `cover_url`, `external_url`, `isrc`, `generated_at`,
	`seed_fingerprint`, `strategy`
)
SELECT
	`id`, `position`, `track_id`, `provider`, `provider_track_id`, `title`, `artists_json`,
	`album_name`, `duration_ms`, `cover_url`, `external_url`, `isrc`, `generated_at`,
	`seed_fingerprint`, 'similar'
FROM `autoplay_suggestions`;
--> statement-breakpoint
DROP TABLE `autoplay_suggestions`;
--> statement-breakpoint
ALTER TABLE `autoplay_suggestions_new` RENAME TO `autoplay_suggestions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_suggestions_position_unique` ON `autoplay_suggestions` (`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_suggestions_track_unique` ON `autoplay_suggestions` (`provider`,`provider_track_id`);
--> statement-breakpoint
DROP TABLE `autoplay_rejections`;
--> statement-breakpoint
CREATE TABLE `autoplay_candidates` (
	`id` integer PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`identity_key` text NOT NULL,
	`title` text NOT NULL,
	`artists_json` text NOT NULL,
	`strategy` text NOT NULL,
	`score` integer NOT NULL,
	`base_score` integer NOT NULL,
	`seed_track_key` text NOT NULL,
	`source_tag` text,
	`seed_fingerprint` text NOT NULL,
	`generated_at` text NOT NULL,
	CONSTRAINT "autoplay_candidates_position_range" CHECK("position" BETWEEN 0 AND 29),
	CONSTRAINT "autoplay_candidates_score_range" CHECK("score" BETWEEN -1000 AND 1000),
	CONSTRAINT "autoplay_candidates_base_score_range" CHECK("base_score" BETWEEN -1000 AND 1000),
	CONSTRAINT "autoplay_candidates_strategy_valid" CHECK("strategy" IN ('similar', 'adjacent', 'explore', 'fallback'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_candidates_position_unique` ON `autoplay_candidates` (`position`);
--> statement-breakpoint
CREATE UNIQUE INDEX `autoplay_candidates_identity_unique` ON `autoplay_candidates` (`identity_key`);
