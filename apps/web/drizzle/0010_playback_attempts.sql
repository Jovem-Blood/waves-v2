CREATE TABLE `playback_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`playback_attempt_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`queue_item_id` text NOT NULL REFERENCES `queue_items`(`id`),
	`outcome` text NOT NULL,
	`terminal` integer NOT NULL,
	`failure_stage` text,
	`failure_class` text,
	`error_code` text,
	`http_status` integer,
	`track_id` text NOT NULL,
	`track_provider` text NOT NULL,
	`provider_track_id` text NOT NULL,
	`track_title` text NOT NULL,
	`track_artists_json` text NOT NULL,
	`source_provider` text,
	`source_identifier` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	`playback_duration_ms` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "playback_attempts_outcome_valid" CHECK (`outcome` IN ('pending', 'played', 'failed', 'cancelled', 'skipped')),
	CONSTRAINT "playback_attempts_attempt_number_positive" CHECK (`attempt_number` >= 1),
	CONSTRAINT "playback_attempts_duration_nonnegative" CHECK (`duration_ms` IS NULL OR `duration_ms` >= 0),
	CONSTRAINT "playback_attempts_playback_duration_nonnegative" CHECK (`playback_duration_ms` IS NULL OR `playback_duration_ms` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playback_attempts_identity_unique` ON `playback_attempts` (`playback_attempt_id`, `attempt_number`);
--> statement-breakpoint
CREATE INDEX `playback_attempts_queue_item_id_idx` ON `playback_attempts` (`queue_item_id`);
--> statement-breakpoint
CREATE INDEX `playback_attempts_started_at_idx` ON `playback_attempts` (`started_at`);
--> statement-breakpoint
CREATE INDEX `playback_attempts_outcome_idx` ON `playback_attempts` (`outcome`);
--> statement-breakpoint
CREATE INDEX `playback_attempts_error_code_idx` ON `playback_attempts` (`error_code`);
--> statement-breakpoint
CREATE INDEX `playback_attempts_source_provider_idx` ON `playback_attempts` (`source_provider`);
--> statement-breakpoint
CREATE INDEX `playback_attempts_track_idx` ON `playback_attempts` (`track_provider`, `provider_track_id`);
