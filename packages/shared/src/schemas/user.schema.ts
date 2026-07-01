import { z } from 'zod'

const requiredTextSchema = z.string().trim().min(1)
const optionalTextSchema = requiredTextSchema.optional()

export const userKindSchema = z.enum(['guest', 'discord'])

export const publicUserSchema = z
  .object({
    id: requiredTextSchema,
    kind: userKindSchema,
    displayName: requiredTextSchema,
    avatarUrl: optionalTextSchema,
    discordUserId: optionalTextSchema,
  })
  .strict()

export const meResponseSchema = z
  .object({
    user: publicUserSchema.nullable(),
  })
  .strict()

export const createGuestSessionInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40),
  })
  .strict()

export const authUserResponseSchema = z
  .object({
    user: publicUserSchema,
  })
  .strict()

export const createDiscordLinkInputSchema = z
  .object({
    discordUserId: requiredTextSchema,
    discordUsername: requiredTextSchema,
    discordGlobalName: optionalTextSchema,
    discordAvatarUrl: optionalTextSchema,
    guildId: optionalTextSchema,
  })
  .strict()

export const createDiscordLinkResponseSchema = z
  .object({
    url: z.url({ protocol: /^https?$/ }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict()
