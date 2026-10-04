CREATE TABLE `track_playback_health` (
	`track_key` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_track_id` text NOT NULL,
	`track_id` text NOT NULL,
	`title` text NOT NULL,
	`artists_json` text NOT NULL,
	`successes` integer DEFAULT 0 NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`content_failures` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_failure_class` text,
	`last_failure_stage` text,
	`last_failed_at` text,
	`last_played_at` text,
	`updated_at` text NOT NULL,
	CONSTRAINT "track_playback_health_counts_nonnegative" CHECK("track_playback_health"."successes" >= 0 and "track_playback_health"."failures" >= 0 and "track_playback_health"."content_failures" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_playback_health_identity_unique` ON `track_playback_health` (`provider`,`provider_track_id`);--> statement-breakpoint
CREATE INDEX `track_playback_health_failures_idx` ON `track_playback_health` (`failures`,`last_failed_at`);
--> statement-breakpoint
WITH terminal AS (
  SELECT * FROM playback_attempts
  WHERE terminal = 1 AND outcome IN ('played', 'failed')
), ranked AS (
  SELECT *, row_number() OVER (
    PARTITION BY track_provider, provider_track_id ORDER BY updated_at DESC, id DESC
  ) AS rank FROM terminal
), ranked_failures AS (
  SELECT *, row_number() OVER (
    PARTITION BY track_provider, provider_track_id ORDER BY updated_at DESC, id DESC
  ) AS rank FROM terminal WHERE outcome = 'failed'
), totals AS (
  SELECT track_provider, provider_track_id,
    sum(CASE WHEN outcome = 'played' THEN 1 ELSE 0 END) AS successes,
    sum(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failures,
    max(CASE WHEN outcome = 'played' THEN updated_at END) AS last_played_at,
    max(CASE WHEN outcome = 'failed' THEN updated_at END) AS last_failed_at,
    max(updated_at) AS updated_at
  FROM terminal GROUP BY track_provider, provider_track_id
)
INSERT INTO track_playback_health (
  track_key, provider, provider_track_id, track_id, title, artists_json,
  successes, failures, content_failures, last_error_code, last_failure_class,
  last_failure_stage, last_failed_at, last_played_at, updated_at
)
SELECT totals.track_provider || ':' || totals.provider_track_id,
  totals.track_provider, totals.provider_track_id, latest.track_id,
  latest.track_title, latest.track_artists_json, totals.successes, totals.failures,
  (SELECT count(*) FROM terminal content
    WHERE content.track_provider = totals.track_provider
      AND content.provider_track_id = totals.provider_track_id
      AND content.outcome = 'failed'
      AND content.error_code IN ('SOURCE_NOT_FOUND', 'SOURCE_GEO_BLOCKED')
      AND (totals.last_played_at IS NULL OR content.updated_at > totals.last_played_at)),
  failure.error_code, failure.failure_class, failure.failure_stage,
  totals.last_failed_at, totals.last_played_at, totals.updated_at
FROM totals
JOIN ranked latest ON latest.track_provider = totals.track_provider
  AND latest.provider_track_id = totals.provider_track_id AND latest.rank = 1
LEFT JOIN ranked_failures failure ON failure.track_provider = totals.track_provider
  AND failure.provider_track_id = totals.provider_track_id AND failure.rank = 1;
