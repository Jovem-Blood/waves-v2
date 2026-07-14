import { z } from 'zod'

import { operationalStatusSchema } from './operational-status.schema.js'
import { playerStateSchema } from './player.schema.js'
import { queueItemSchema, queueSchema } from './queue.schema.js'

const requiredTextSchema = z.string().trim().min(1)
const optionalTextSchema = requiredTextSchema.optional()

export const botEventSchema = z
  .object({
    type: requiredTextSchema,
    occurredAt: z.iso.datetime({ offset: true }),
    guildId: optionalTextSchema,
    guildName: optionalTextSchema,
    voiceChannelId: optionalTextSchema,
    voiceChannelName: optionalTextSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.type === 'voice.connected') {
      if (!event.guildId) {
        context.addIssue({
          code: 'custom',
          path: ['guildId'],
          message: 'guildId is required for voice.connected',
        })
      }
      if (!event.voiceChannelId) {
        context.addIssue({
          code: 'custom',
          path: ['voiceChannelId'],
          message: 'voiceChannelId is required for voice.connected',
        })
      }
      if (!event.guildName) {
        context.addIssue({
          code: 'custom',
          path: ['guildName'],
          message: 'guildName is required for voice.connected',
        })
      }
      if (!event.voiceChannelName) {
        context.addIssue({
          code: 'custom',
          path: ['voiceChannelName'],
          message: 'voiceChannelName is required for voice.connected',
        })
      }
    }

    if (event.type === 'voice.disconnected' && !event.guildId) {
      context.addIssue({
        code: 'custom',
        path: ['guildId'],
        message: 'guildId is required for voice.disconnected',
      })
    }

    if (['voice.reconnecting', 'voice.reconnected'].includes(event.type)) {
      if (!event.guildId) {
        context.addIssue({
          code: 'custom',
          path: ['guildId'],
          message: `guildId is required for ${event.type}`,
        })
      }
      if (!event.voiceChannelId) {
        context.addIssue({
          code: 'custom',
          path: ['voiceChannelId'],
          message: `voiceChannelId is required for ${event.type}`,
        })
      }
    }

    if (
      [
        'playback.started',
        'playback.finished',
        'playback.failed',
        'playback.paused',
        'playback.resumed',
      ].includes(event.type)
    ) {
      if (!event.guildId) {
        context.addIssue({
          code: 'custom',
          path: ['guildId'],
          message: `guildId is required for ${event.type}`,
        })
      }
      if (typeof event.payload.queueItemId !== 'string' || !event.payload.queueItemId.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['payload', 'queueItemId'],
          message: `queueItemId is required for ${event.type}`,
        })
      }
    }
  })

export const queueRealtimeReasonSchema = z.enum([
  'added',
  'removed',
  'restored',
  'moved',
  'player_transition',
  'voice_changed',
])

export const realtimeEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('sync.snapshot'),
      queue: queueSchema,
      player: playerStateSchema,
      status: operationalStatusSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('queue.updated'),
      queue: queueSchema,
      reason: queueRealtimeReasonSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('queue.item_failed'),
      item: queueItemSchema,
      queue: queueSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('player.updated'),
      player: playerStateSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('status.changed'),
      status: operationalStatusSchema,
    })
    .strict(),
])
