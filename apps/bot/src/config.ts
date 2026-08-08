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
  appHostname: httpUrlSchema,
  logLevel: logLevelSchema,
  apiTimeoutMs: z.coerce.number().int().min(1).max(60_000).default(10_000),
  healthHost: z.string().trim().min(1).default('127.0.0.1'),
  healthPort: z.coerce.number().int().min(1).max(65_535).default(3_002),
  heartbeatMaxAgeMs: z.coerce.number().int().min(1_000).max(300_000).default(120_000),
})

export interface BotConfig {
  discordToken: string
  discordClientId: string
  discordGuildId: string
  internalApiToken: string
  apiBaseUrl: string
  appHostname: string
  logLevel: z.infer<typeof logLevelSchema>
  apiTimeoutMs?: number
  healthHost?: string
  healthPort?: number
  heartbeatMaxAgeMs?: number
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
  internalApiToken: 'BOT_INTERNAL_SECRET',
  apiBaseUrl: 'INTERNAL_WEB_URL/BOT_API_BASE_URL',
  appHostname: 'PUBLIC_APP_URL/APP_HOSTNAME',
  logLevel: 'LOG_LEVEL',
  apiTimeoutMs: 'BOT_API_TIMEOUT_MS',
  healthHost: 'BOT_HEALTH_HOST',
  healthPort: 'BOT_HEALTH_PORT',
  heartbeatMaxAgeMs: 'BOT_HEARTBEAT_MAX_AGE_MS',
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
  const internalWebUrl = source.INTERNAL_WEB_URL
  const legacyApiBaseUrl = source.BOT_API_BASE_URL
  const apiBaseUrl =
    internalWebUrl === undefined ? legacyApiBaseUrl : `${internalWebUrl.replace(/\/+$/, '')}/api`
  const result = botConfigSchema.safeParse({
    discordToken: source.DISCORD_TOKEN,
    discordClientId: source.DISCORD_CLIENT_ID,
    discordGuildId: source.DISCORD_GUILD_ID,
    internalApiToken: source.BOT_INTERNAL_SECRET?.trim() || source.INTERNAL_API_TOKEN,
    apiBaseUrl,
    appHostname: source.PUBLIC_APP_URL ?? source.APP_HOSTNAME,
    logLevel: source.LOG_LEVEL ?? (source.NODE_ENV === 'development' ? 'debug' : 'info'),
    apiTimeoutMs: source.BOT_API_TIMEOUT_MS,
    healthHost: source.BOT_HEALTH_HOST,
    healthPort: source.BOT_HEALTH_PORT,
    heartbeatMaxAgeMs: source.BOT_HEARTBEAT_MAX_AGE_MS,
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
