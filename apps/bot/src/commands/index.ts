import { SlashCommandBuilder } from 'discord.js'

import { joinCommand } from './join.command.js'
import { leaveCommand } from './leave.command.js'
import { loginCommand } from './login.command.js'
import { playCommand } from './play.command.js'
import { queueCommand } from './queue.command.js'
import { skipCommand } from './skip.command.js'
import { pauseCommand } from './pause.command.js'
import { resumeCommand } from './resume.command.js'
import { volumeCommand } from './volume.command.js'
import type { BotCommand } from './types.js'
import type { CommandContext } from './types.js'
import type { WavesApi } from '../api/waves-api.client.js'
import type { PlaybackManager } from '../playback/audio-player-manager.js'
import type { VoiceManager } from '../voice/voice-manager.js'

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Adiciona uma faixa e inicia a reprodução quando conectado')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Nome da música ou artista')
        .setRequired(true)
        .setMinLength(1),
    ),
  new SlashCommandBuilder().setName('queue').setDescription('Mostra a fila atual'),
  new SlashCommandBuilder()
    .setName('login')
    .setDescription('Gera um link privado para vincular sua sessão web ao Discord'),
  new SlashCommandBuilder().setName('skip').setDescription('Pula a faixa atual'),
  new SlashCommandBuilder().setName('join').setDescription('Conecta o Waves ao seu canal de voz'),
  new SlashCommandBuilder().setName('leave').setDescription('Desconecta o Waves do canal de voz'),
  new SlashCommandBuilder().setName('pause').setDescription('Pausa a faixa atual'),
  new SlashCommandBuilder().setName('resume').setDescription('Retoma a faixa pausada'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta o volume da reprodução')
    .addIntegerOption((option) =>
      option
        .setName('valor')
        .setDescription('Volume entre 0 e 100')
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true),
    ),
] as const

export const commands = new Map<string, BotCommand>(
  [
    playCommand,
    queueCommand,
    loginCommand,
    skipCommand,
    joinCommand,
    leaveCommand,
    pauseCommand,
    resumeCommand,
    volumeCommand,
  ].map((command) => [command.name, command]),
)

export async function executeCommand(
  context: CommandContext,
  api: WavesApi,
  voiceManager: VoiceManager,
  playbackManager: PlaybackManager,
): Promise<boolean> {
  const command = commands.get(context.name)
  if (!command) {
    return false
  }

  await command.execute(context, api, voiceManager, playbackManager)
  return true
}
