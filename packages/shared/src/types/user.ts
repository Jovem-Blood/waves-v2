import type { z } from 'zod'

import type {
  authUserResponseSchema,
  createDiscordLinkInputSchema,
  createDiscordLinkResponseSchema,
  createGuestSessionInputSchema,
  meResponseSchema,
  publicUserSchema,
  userKindSchema,
} from '../schemas/user.schema.js'

export type UserKind = z.infer<typeof userKindSchema>
export type PublicUser = z.infer<typeof publicUserSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
export type CreateGuestSessionInput = z.infer<typeof createGuestSessionInputSchema>
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>
export type CreateDiscordLinkInput = z.infer<typeof createDiscordLinkInputSchema>
export type CreateDiscordLinkResponse = z.infer<typeof createDiscordLinkResponseSchema>
