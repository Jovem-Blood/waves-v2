ALTER TABLE playback_attempts ADD COLUMN resolution_duration_ms integer CHECK(resolution_duration_ms IS NULL OR resolution_duration_ms >= 0);
--> statement-breakpoint
ALTER TABLE playback_attempts ADD COLUMN fetch_latency_ms integer CHECK(fetch_latency_ms IS NULL OR fetch_latency_ms >= 0);
--> statement-breakpoint
ALTER TABLE playback_attempts ADD COLUMN time_to_first_audio_ms integer CHECK(time_to_first_audio_ms IS NULL OR time_to_first_audio_ms >= 0);
--> statement-breakpoint
ALTER TABLE playback_attempts ADD COLUMN expected_duration_ms integer CHECK(expected_duration_ms IS NULL OR expected_duration_ms >= 0);
--> statement-breakpoint
ALTER TABLE playback_attempts ADD COLUMN progress_at_failure_ms integer CHECK(progress_at_failure_ms IS NULL OR progress_at_failure_ms >= 0);
--> statement-breakpoint
CREATE INDEX playback_attempts_retention_idx ON playback_attempts (updated_at, terminal);
