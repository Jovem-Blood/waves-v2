import { z } from 'zod'

const requiredTextSchema = z.string().trim().min(1)
const optionalTextSchema = requiredTextSchema.optional()

export const botEventSchema = z
  .object({
    type: requiredTextSchema,
    occurredAt: z.iso.datetime({ offset: true }),
    guildId: optionalTextSchema,
    voiceChannelId: optionalTextSchema,
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
    }

    if (event.type === 'voice.disconnected' && !event.guildId) {
      context.addIssue({
        code: 'custom',
        path: ['guildId'],
        message: 'guildId is required for voice.disconnected',
      })
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
