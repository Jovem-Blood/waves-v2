import { GatewayIntentBits } from 'discord.js'
import { describe, expect, it } from 'vitest'

import { createDiscordClient } from '../src/index.js'

describe('Discord client', () => {
  it('requests the guild and voice state intents required by @discordjs/voice', async () => {
    const client = createDiscordClient()

    expect(client.options.intents.has(GatewayIntentBits.Guilds)).toBe(true)
    expect(client.options.intents.has(GatewayIntentBits.GuildVoiceStates)).toBe(true)

    await client.destroy()
  })
})
