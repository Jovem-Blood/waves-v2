ALTER TABLE `queue_items` ADD `removed_at` text;
--> statement-breakpoint
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY provider, provider_track_id
      ORDER BY position ASC, created_at ASC, id ASC
    ) AS duplicate_rank
  FROM queue_items
  WHERE status IN ('queued', 'playing')
)
UPDATE queue_items
SET
  status = 'removed',
  removed_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM ranked WHERE duplicate_rank > 1);
--> statement-breakpoint
UPDATE queue_items
SET position = position + 1000000
WHERE status IN ('queued', 'playing');
--> statement-breakpoint
WITH compacted AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY position ASC, created_at ASC, id ASC) - 1 AS new_position
  FROM queue_items
  WHERE status IN ('queued', 'playing')
)
UPDATE queue_items
SET position = (SELECT new_position FROM compacted WHERE compacted.id = queue_items.id)
WHERE id IN (SELECT id FROM compacted);
--> statement-breakpoint
CREATE UNIQUE INDEX `queue_items_active_track_unique`
ON `queue_items` (`provider`, `provider_track_id`)
WHERE `status` IN ('queued', 'playing');
--> statement-breakpoint
CREATE TABLE `operational_state` (
  `id` integer PRIMARY KEY NOT NULL,
  `bot_last_seen_at` text,
  `voice_status` text DEFAULT 'disconnected' NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT "operational_state_singleton_id" CHECK("operational_state"."id" = 1)
);
