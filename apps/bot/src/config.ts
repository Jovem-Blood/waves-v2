import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

const httpUrlSchema = z.url({ protocol: /^https?$/ })
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])
const botConfigSchema = z.strictObject({
  discordToken: z.string().trim().min(1),
  discordClientId: z.string().trim().min(1),
  discordGuildId: z.string().trim().min(1),
  internalApiToken: z.string().trim().min(1),
  apiBaseUrl: httpUrlSchema,
  logLevel: logLevelSchema,
})

export interface BotConfig {
  discordToken: string
  discordClientId: string
  discordGuildId: string
  internalApiToken: string
  apiBaseUrl: string
  logLevel: z.infer<typeof logLevelSchema>
}

export class BotConfigurationError extends Error {
  constructor(readonly invalidVariables: readonly string[]) {
    super(`Invalid bot configuration: ${invalidVariables.join(', ')}`)
    this.name = 'BotConfigurationError'
  }
}

const variableNames = {
  discordToken: 'DISCORD_TOKEN',
  discordClientId: 'DISCORD_CLIENT_ID',
  discordGuildId: 'DISCORD_GUILD_ID',
  internalApiToken: 'INTERNAL_API_TOKEN',
  apiBaseUrl: 'BOT_API_BASE_URL',
  logLevel: 'LOG_LEVEL',
} as const

export function parseBotConfig(environment?: Record<string, string | undefined>): BotConfig {
  if (!environment) {
    try {
      loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)))
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code !== 'ENOENT') {
        throw error
      }
    }
  }

  const source = environment ?? process.env
  const result = botConfigSchema.safeParse({
    discordToken: source.DISCORD_TOKEN,
    discordClientId: source.DISCORD_CLIENT_ID,
    discordGuildId: source.DISCORD_GUILD_ID,
    internalApiToken: source.INTERNAL_API_TOKEN,
    apiBaseUrl: source.BOT_API_BASE_URL,
    logLevel: source.LOG_LEVEL ?? (source.NODE_ENV === 'development' ? 'debug' : 'info'),
  })

  if (!result.success) {
    const variables = result.error.issues.flatMap((issue) => {
      const field = issue.path[0]
      return typeof field === 'string' && field in variableNames
        ? [variableNames[field as keyof typeof variableNames]]
        : []
    })
    throw new BotConfigurationError([...new Set(variables)])
  }

  return result.data
}
