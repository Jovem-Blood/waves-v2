import { GatewayIntentBits } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'

import type { BotConfig } from '../src/config.js'
import { createDiscordClient, registerCommandsAndLogin } from '../src/index.js'

const config: BotConfig = {
  discordToken: 'discord-token',
  discordClientId: 'client-id',
  discordGuildId: 'guild-id',
  internalApiToken: 'internal-token',
  apiBaseUrl: 'http://localhost:3000/api',
  appHostname: 'http://localhost:3000',
  logLevel: 'info',
}

describe('Discord client', () => {
  it('requests the guild and voice state intents required by @discordjs/voice', async () => {
    const client = createDiscordClient()

    expect(client.options.intents.has(GatewayIntentBits.Guilds)).toBe(true)
    expect(client.options.intents.has(GatewayIntentBits.GuildVoiceStates)).toBe(true)

    await client.destroy()
  })

  it('registers guild commands before logging in', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const login = vi.fn().mockResolvedValue('discord-token')

    await registerCommandsAndLogin(config, { login }, register)

    expect(register).toHaveBeenCalledWith(config)
    expect(login).toHaveBeenCalledWith(config.discordToken)
    expect(register.mock.invocationCallOrder[0]).toBeLessThan(login.mock.invocationCallOrder[0]!)
  })
})
