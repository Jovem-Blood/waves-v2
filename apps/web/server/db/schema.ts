import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const queueItems = sqliteTable(
  'queue_items',
  {
    id: text('id').primaryKey(),
    trackId: text('track_id').notNull(),
    provider: text('provider', { enum: ['spotify'] }).notNull(),
    providerTrackId: text('provider_track_id').notNull(),
    title: text('title').notNull(),
    artistsJson: text('artists_json').notNull(),
    albumName: text('album_name'),
    durationMs: integer('duration_ms').notNull(),
    coverUrl: text('cover_url'),
    externalUrl: text('external_url'),
    isrc: text('isrc'),
    requestedByDiscordUserId: text('requested_by_discord_user_id'),
    requestedByDisplayName: text('requested_by_display_name'),
    status: text('status', {
      enum: ['queued', 'playing', 'played', 'skipped', 'failed', 'removed'],
    }).notNull(),
    position: integer('position').notNull(),
    removedAt: text('removed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('queue_items_status_idx').on(table.status),
    index('queue_items_position_idx').on(table.position),
    index('queue_items_created_at_idx').on(table.createdAt),
    uniqueIndex('queue_items_active_position_unique')
      .on(table.position)
      .where(sql`${table.status} in ('queued', 'playing')`),
    uniqueIndex('queue_items_single_playing_unique')
      .on(table.status)
      .where(sql`${table.status} = 'playing'`),
    check('queue_items_position_nonnegative', sql`${table.position} >= 0`),
    check('queue_items_duration_nonnegative', sql`${table.durationMs} >= 0`),
    uniqueIndex('queue_items_active_track_unique')
      .on(table.provider, table.providerTrackId)
      .where(sql`${table.status} in ('queued', 'playing')`),
  ],
)

export const operationalState = sqliteTable(
  'operational_state',
  {
    id: integer('id').primaryKey(),
    botLastSeenAt: text('bot_last_seen_at'),
    voiceStatus: text('voice_status', {
      enum: ['connected', 'disconnected', 'reconnecting'],
    })
      .notNull()
      .default('disconnected'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('operational_state_singleton_id', sql`${table.id} = 1`)],
)

export const playerState = sqliteTable(
  'player_state',
  {
    id: integer('id').primaryKey(),
    status: text('status', { enum: ['idle', 'playing', 'paused', 'stopped'] }).notNull(),
    currentQueueItemId: text('current_queue_item_id').references(() => queueItems.id),
    voiceChannelId: text('voice_channel_id'),
    voiceChannelName: text('voice_channel_name'),
    guildId: text('guild_id'),
    guildName: text('guild_name'),
    volume: integer('volume').notNull().default(100),
    progressMs: integer('progress_ms').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('player_state_singleton_id', sql`${table.id} = 1`),
    check('player_state_volume_range', sql`${table.volume} between 0 and 100`),
    check('player_state_progress_nonnegative', sql`${table.progressMs} >= 0`),
  ],
)

export const resolvedSources = sqliteTable(
  'resolved_sources',
  {
    id: text('id').primaryKey(),
    queueItemId: text('queue_item_id')
      .notNull()
      .references(() => queueItems.id, { onDelete: 'cascade' }),
    sourceProvider: text('source_provider').notNull(),
    sourceIdentifier: text('source_identifier').notNull(),
    streamUrl: text('stream_url').notNull(),
    expiresAt: text('expires_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('resolved_sources_queue_item_id_idx').on(table.queueItemId)],
)

export const allowedUsers = sqliteTable(
  'allowed_users',
  {
    id: text('id').primaryKey(),
    discordUserId: text('discord_user_id').notNull(),
    displayName: text('display_name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('allowed_users_discord_user_id_unique').on(table.discordUserId)],
)
