CREATE TABLE `autoplay_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`failure_code` text,
	`updated_at` text NOT NULL,
	CONSTRAINT "autoplay_state_singleton_id" CHECK("autoplay_state"."id" = 1)
);
