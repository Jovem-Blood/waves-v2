ALTER TABLE `player_state` ADD `volume` integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE `player_state` ADD `progress_ms` integer DEFAULT 0 NOT NULL;
