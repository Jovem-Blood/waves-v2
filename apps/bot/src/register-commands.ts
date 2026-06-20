import { REST, Routes } from 'discord.js'

import { commandDefinitions } from './commands/index.js'
import { parseBotConfig, type BotConfig } from './config.js'
import { createBotLogger } from './logger.js'

export async function registerCommands(
  config: BotConfig = parseBotConfig(),
  putCommands: (route: `/${string}`, body: readonly unknown[]) => Promise<unknown> = (
    route,
    body,
  ) => new REST({ version: '10' }).setToken(config.discordToken).put(route, { body }),
): Promise<void> {
  const logger = createBotLogger()
  const body = commandDefinitions.map((command) => command.toJSON())
  const route = Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)

  await putCommands(route, body)
  logger.info(
    { commandCount: body.length, commandNames: body.map(({ name }) => name) },
    'Discord guild commands registered',
  )
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') ===
    process.argv[1].replaceAll('\\', '/')

if (isEntrypoint) {
  void registerCommands().catch(() => {
    createBotLogger().fatal('Discord command registration failed')
    process.exitCode = 1
  })
}
