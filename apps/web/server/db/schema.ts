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
    requestedByUserId: text('requested_by_user_id').references(() => users.id),
    requestedByDiscordUserId: text('requested_by_discord_user_id'),
    requestedByDisplayName: text('requested_by_display_name'),
    origin: text('origin', { enum: ['human', 'autoplay'] })
      .notNull()
      .default('human'),
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
    index('queue_items_requested_by_user_id_idx').on(table.requestedByUserId),
    uniqueIndex('queue_items_active_position_unique')
      .on(table.position)
      .where(sql`${table.status} in ('queued', 'playing')`),
    uniqueIndex('queue_items_single_playing_unique')
      .on(table.status)
      .where(sql`${table.status} = 'playing'`),
    check('queue_items_position_nonnegative', sql`${table.position} >= 0`),
    check('queue_items_duration_nonnegative', sql`${table.durationMs} >= 0`),
    check('queue_items_origin_valid', sql`${table.origin} in ('human', 'autoplay')`),
    uniqueIndex('queue_items_active_track_unique')
      .on(table.provider, table.providerTrackId)
      .where(sql`${table.status} in ('queued', 'playing')`),
  ],
)

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['guest', 'discord'] }).notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    discordUserId: text('discord_user_id'),
    discordUsername: text('discord_username'),
    discordGlobalName: text('discord_global_name'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('users_discord_user_id_unique')
      .on(table.discordUserId)
      .where(sql`${table.discordUserId} is not null`),
    check('users_kind_valid', sql`${table.kind} in ('guest', 'discord')`),
    check('users_display_name_not_empty', sql`length(trim(${table.displayName})) > 0`),
  ],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const discordLoginTokens = sqliteTable(
  'discord_login_tokens',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    discordUserId: text('discord_user_id').notNull(),
    discordUsername: text('discord_username').notNull(),
    discordGlobalName: text('discord_global_name'),
    discordAvatarUrl: text('discord_avatar_url'),
    guildId: text('guild_id'),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('discord_login_tokens_token_hash_unique').on(table.tokenHash),
    index('discord_login_tokens_discord_user_id_idx').on(table.discordUserId),
    index('discord_login_tokens_expires_at_idx').on(table.expiresAt),
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

export const autoplayState = sqliteTable(
  'autoplay_state',
  {
    id: integer('id').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    failureCode: text('failure_code', {
      enum: [
        'spotify_unavailable',
        'invalid_response',
        'recommendation_unavailable',
        'metadata_unavailable',
        'no_seeds',
        'no_candidates',
      ],
    }),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [check('autoplay_state_singleton_id', sql`${table.id} = 1`)],
)

export const autoplaySuggestions = sqliteTable(
  'autoplay_suggestions',
  {
    id: integer('id').primaryKey(),
    position: integer('position').notNull(),
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
    generatedAt: text('generated_at').notNull(),
    seedFingerprint: text('seed_fingerprint').notNull(),
    strategy: text('strategy', {
      enum: ['similar', 'adjacent', 'explore', 'fallback'],
    }).notNull(),
    sourceTag: text('source_tag'),
  },
  (table) => [
    uniqueIndex('autoplay_suggestions_position_unique').on(table.position),
    uniqueIndex('autoplay_suggestions_track_unique').on(table.provider, table.providerTrackId),
    check('autoplay_suggestions_position_range', sql`${table.position} between 0 and 5`),
    check('autoplay_suggestions_duration_nonnegative', sql`${table.durationMs} >= 0`),
  ],
)

export const autoplayCandidates = sqliteTable(
  'autoplay_candidates',
  {
    id: integer('id').primaryKey(),
    position: integer('position').notNull(),
    identityKey: text('identity_key').notNull(),
    title: text('title').notNull(),
    artistsJson: text('artists_json').notNull(),
    strategy: text('strategy', {
      enum: ['similar', 'adjacent', 'explore', 'fallback'],
    }).notNull(),
    score: integer('score').notNull(),
    baseScore: integer('base_score').notNull(),
    seedTrackKey: text('seed_track_key').notNull(),
    sourceTag: text('source_tag'),
    seedFingerprint: text('seed_fingerprint').notNull(),
    generatedAt: text('generated_at').notNull(),
  },
  (table) => [
    uniqueIndex('autoplay_candidates_position_unique').on(table.position),
    uniqueIndex('autoplay_candidates_identity_unique').on(table.identityKey),
    check('autoplay_candidates_position_range', sql`${table.position} between 0 and 29`),
    check('autoplay_candidates_score_range', sql`${table.score} between -1000 and 1000`),
    check('autoplay_candidates_base_score_range', sql`${table.baseScore} between -1000 and 1000`),
  ],
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

export const playbackAttempts = sqliteTable(
  'playback_attempts',
  {
    id: text('id').primaryKey(),
    playbackAttemptId: text('playback_attempt_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    queueItemId: text('queue_item_id')
      .notNull()
      .references(() => queueItems.id),
    outcome: text('outcome', {
      enum: ['pending', 'played', 'failed', 'cancelled', 'skipped'],
    }).notNull(),
    terminal: integer('terminal', { mode: 'boolean' }).notNull(),
    failureStage: text('failure_stage'),
    failureClass: text('failure_class'),
    errorCode: text('error_code'),
    httpStatus: integer('http_status'),
    trackId: text('track_id').notNull(),
    trackProvider: text('track_provider').notNull(),
    providerTrackId: text('provider_track_id').notNull(),
    trackTitle: text('track_title').notNull(),
    trackArtistsJson: text('track_artists_json').notNull(),
    sourceProvider: text('source_provider'),
    sourceIdentifier: text('source_identifier'),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    durationMs: integer('duration_ms'),
    playbackDurationMs: integer('playback_duration_ms'),
    resolutionDurationMs: integer('resolution_duration_ms'),
    fetchLatencyMs: integer('fetch_latency_ms'),
    timeToFirstAudioMs: integer('time_to_first_audio_ms'),
    expectedDurationMs: integer('expected_duration_ms'),
    progressAtFailureMs: integer('progress_at_failure_ms'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('playback_attempts_identity_unique').on(
      table.playbackAttemptId,
      table.attemptNumber,
    ),
    index('playback_attempts_queue_item_id_idx').on(table.queueItemId),
    index('playback_attempts_started_at_idx').on(table.startedAt),
    index('playback_attempts_outcome_idx').on(table.outcome),
    index('playback_attempts_error_code_idx').on(table.errorCode),
    index('playback_attempts_source_provider_idx').on(table.sourceProvider),
    index('playback_attempts_retention_idx').on(table.updatedAt, table.terminal),
    index('playback_attempts_track_idx').on(table.trackProvider, table.providerTrackId),
    check('playback_attempts_attempt_number_positive', sql`${table.attemptNumber} >= 1`),
    check(
      'playback_attempts_duration_nonnegative',
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
    check(
      'playback_attempts_playback_duration_nonnegative',
      sql`${table.playbackDurationMs} is null or ${table.playbackDurationMs} >= 0`,
    ),
  ],
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
