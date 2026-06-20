import { describe, expect, it } from 'vitest'

import { BotConfigurationError, parseBotConfig } from '../src/config.js'

const validEnvironment = {
  DISCORD_TOKEN: 'discord-token',
  DISCORD_CLIENT_ID: 'client-id',
  DISCORD_GUILD_ID: 'guild-id',
  INTERNAL_API_TOKEN: 'internal-token',
  BOT_API_BASE_URL: 'http://localhost:3000/api',
}

describe('parseBotConfig', () => {
  it('accepts valid bot configuration', () => {
    expect(parseBotConfig(validEnvironment)).toEqual({
      discordToken: 'discord-token',
      discordClientId: 'client-id',
      discordGuildId: 'guild-id',
      internalApiToken: 'internal-token',
      apiBaseUrl: 'http://localhost:3000/api',
      logLevel: 'info',
    })
  })

  it('rejects invalid fields without exposing values', () => {
    let error: unknown
    try {
      parseBotConfig({ ...validEnvironment, DISCORD_TOKEN: '', BOT_API_BASE_URL: 'invalid' })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(BotConfigurationError)
    expect(String(error)).toContain('DISCORD_TOKEN')
    expect(String(error)).toContain('BOT_API_BASE_URL')
    expect(String(error)).not.toContain('internal-token')
  })
})
