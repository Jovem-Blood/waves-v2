import { z } from 'zod'

const optionalTextSchema = z.string().trim().min(1).optional()
const optionalDateSchema = z.iso.datetime({ offset: true }).optional()

export const voiceOperationalStatusSchema = z.enum(['connected', 'disconnected', 'reconnecting'])

export const botHeartbeatInputSchema = z
  .object({
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict()

export const operationalStatusSchema = z
  .object({
    web: z
      .object({
        status: z.literal('available'),
        checkedAt: z.iso.datetime({ offset: true }),
      })
      .strict(),
    bot: z
      .object({
        status: z.enum(['online', 'offline']),
        lastSeenAt: optionalDateSchema,
      })
      .strict(),
    voice: z
      .object({
        status: voiceOperationalStatusSchema,
        guildName: optionalTextSchema,
        voiceChannelName: optionalTextSchema,
      })
      .strict(),
  })
  .strict()
