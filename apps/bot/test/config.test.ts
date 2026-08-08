import { describe, expect, it } from 'vitest'

import { BotConfigurationError, parseBotConfig } from '../src/config.js'

const validEnvironment = {
  DISCORD_TOKEN: 'discord-token',
  DISCORD_CLIENT_ID: 'client-id',
  DISCORD_GUILD_ID: 'guild-id',
  BOT_INTERNAL_SECRET: 'internal-token',
  INTERNAL_WEB_URL: 'http://localhost:3000',
  PUBLIC_APP_URL: 'http://localhost:3000',
}

describe('parseBotConfig', () => {
  it('accepts valid bot configuration', () => {
    expect(parseBotConfig(validEnvironment)).toEqual({
      discordToken: 'discord-token',
      discordClientId: 'client-id',
      discordGuildId: 'guild-id',
      internalApiToken: 'internal-token',
      apiBaseUrl: 'http://localhost:3000/api',
      appHostname: 'http://localhost:3000',
      logLevel: 'info',
      apiTimeoutMs: 10_000,
      healthHost: '127.0.0.1',
      healthPort: 3_002,
      heartbeatMaxAgeMs: 120_000,
    })
  })

  it('keeps compatibility with legacy internal API variables', () => {
    expect(
      parseBotConfig({
        DISCORD_TOKEN: 'discord-token',
        DISCORD_CLIENT_ID: 'client-id',
        DISCORD_GUILD_ID: 'guild-id',
        INTERNAL_API_TOKEN: 'legacy-token',
        BOT_API_BASE_URL: 'http://localhost:3000/api',
        APP_HOSTNAME: 'http://localhost:3000',
      }),
    ).toMatchObject({
      internalApiToken: 'legacy-token',
      apiBaseUrl: 'http://localhost:3000/api',
      appHostname: 'http://localhost:3000',
    })
  })

  it('uses the legacy token when the preferred variable is empty', () => {
    expect(
      parseBotConfig({
        ...validEnvironment,
        BOT_INTERNAL_SECRET: '   ',
        INTERNAL_API_TOKEN: 'legacy-token',
      }),
    ).toMatchObject({
      internalApiToken: 'legacy-token',
    })
  })

  it('rejects invalid fields without exposing values', () => {
    let error: unknown
    try {
      parseBotConfig({
        ...validEnvironment,
        DISCORD_TOKEN: '',
        INTERNAL_WEB_URL: 'invalid',
        PUBLIC_APP_URL: 'invalid',
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(BotConfigurationError)
    expect(String(error)).toContain('DISCORD_TOKEN')
    expect(String(error)).toContain('INTERNAL_WEB_URL/BOT_API_BASE_URL')
    expect(String(error)).toContain('PUBLIC_APP_URL/APP_HOSTNAME')
    expect(String(error)).not.toContain('internal-token')
  })
})
