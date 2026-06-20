import { Routes } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'

import type { BotConfig } from '../src/config.js'
import { registerCommands } from '../src/register-commands.js'

const config: BotConfig = {
  discordToken: 'discord-token',
  discordClientId: 'client-id',
  discordGuildId: 'guild-id',
  internalApiToken: 'internal-token',
  apiBaseUrl: 'http://localhost:3000/api',
}

describe('registerCommands', () => {
  it('registers exactly five commands in the configured guild', async () => {
    const putCommands = vi.fn().mockResolvedValue([])

    await registerCommands(config, putCommands)

    expect(putCommands).toHaveBeenCalledOnce()
    const [route, body] = putCommands.mock.calls[0] as [string, Array<{ name: string }>]
    expect(route).toBe(
      Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId),
    )
    expect(body.map(({ name }) => name)).toEqual(['play', 'queue', 'skip', 'join', 'leave'])
  })
})
