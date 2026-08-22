import type { QueueItem } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import type { WavesApi } from '../src/api/waves-api.client.js'
import { WavesApiError } from '../src/api/waves-api.errors.js'
import { commandDefinitions, commands, executeCommand } from '../src/commands/index.js'
import { formatQueue } from '../src/commands/queue.command.js'
import type { CommandContext, CommandMessage, CommandResponder } from '../src/commands/types.js'
import type { BotLogger } from '../src/logger.js'
import type { PlaybackManager } from '../src/playback/audio-player-manager.js'
import type { VoiceManager } from '../src/voice/voice-manager.js'

const track = {
  id: 'spotify:track-1',
  provider: 'spotify' as const,
  providerTrackId: 'track-1',
  title: 'Track One',
  artists: ['Artist One'],
  durationMs: 1000,
}
const item: QueueItem = {
  id: 'queue-1',
  track,
  origin: 'human',
  requestedByDisplayName: 'Luis',
  status: 'queued',
  position: 0,
  createdAt: '2026-06-18T18:00:00.000Z',
  updatedAt: '2026-06-18T18:00:00.000Z',
}

function setup(overrides: Partial<CommandContext> = {}) {
  const deferEphemeral = vi.fn().mockResolvedValue(undefined)
  const publicReply = vi.fn().mockResolvedValue(undefined)
  const followUpPublic = vi
    .fn<(message: CommandMessage) => Promise<void>>()
    .mockResolvedValue(undefined)
  const ephemeralReply = vi.fn().mockResolvedValue(undefined)
  const responder: CommandResponder = {
    deferEphemeral,
    public: publicReply,
    followUpPublic,
    ephemeral: ephemeralReply,
  }
  const getQueue = vi.fn().mockResolvedValue([item])
  const play = vi.fn().mockResolvedValue({ item, track })
  const skip = vi.fn().mockResolvedValue({
    player: { status: 'idle', updatedAt: item.updatedAt },
    queue: [],
  })
  const resolveSource = vi.fn()
  const claimPlayback = vi.fn()
  const completePlayback = vi.fn()
  const sendEvent = vi.fn().mockResolvedValue(undefined)
  const reportPlaybackAttempt = vi.fn().mockResolvedValue(undefined)
  const createDiscordLink = vi.fn().mockResolvedValue({
    url: 'https://waves.example.com/auth/discord-link?token=secret',
    expiresAt: '2026-06-18T18:10:00.000Z',
  })
  const joinVoice = vi.fn().mockResolvedValue('connected' as const)
  const leaveVoice = vi.fn().mockReturnValue(true)
  const isConnected = vi.fn().mockReturnValue(true)
  const loggerError = vi.fn<(bindings: Record<string, unknown>, message: string) => void>()
  const loggerWarn = vi.fn<(bindings: Record<string, unknown>, message: string) => void>()
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: loggerError,
    fatal: vi.fn(),
    info: vi.fn(),
    warn: loggerWarn,
  }
  const voiceManager: VoiceManager = {
    join: joinVoice,
    leave: leaveVoice,
    getConnectedGuildIds: vi.fn().mockReturnValue(['guild-1']),
    getChannelId: vi.fn().mockReturnValue('voice-1'),
    isConnected,
    subscribe: vi.fn(),
    destroyAll: vi.fn(),
  }
  const startPlayback = vi.fn().mockResolvedValue('not-connected' as const)
  const skipPlayback = vi.fn().mockResolvedValue('empty' as const)
  const destroyPlaybackGuild = vi.fn()
  const playbackManager: PlaybackManager = {
    start: startPlayback,
    skip: skipPlayback,
    destroyGuild: destroyPlaybackGuild,
    destroyAll: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    setVolume: vi.fn(),
    synchronize: vi.fn(),
  }
  const api: WavesApi = {
    claimPlayback,
    completePlayback,
    reportPlaybackAttempt,
    getQueue,
    play,
    resolveSource,
    skip,
    sendEvent,
    getPlayer: vi.fn(),
    updateProgress: vi.fn(),
    heartbeat: vi.fn(),
    createDiscordLink,
  }
  const context: CommandContext = {
    name: 'test',
    appHostname: 'https://waves.example.com',
    userId: 'user-1',
    displayName: 'Luis',
    logger: logger as unknown as BotLogger,
    responder,
    ...overrides,
  }
  return {
    api,
    context,
    playbackManager,
    voiceManager,
    mocks: {
      deferEphemeral,
      ephemeralReply,
      followUpPublic,
      getQueue,
      play,
      publicReply,
      startPlayback,
      skipPlayback,
      destroyPlaybackGuild,
      sendEvent,
      createDiscordLink,
      skip,
      joinVoice,
      leaveVoice,
      isConnected,
      loggerError,
      loggerWarn,
    },
  }
}

describe('bot commands', () => {
  it('defines the playback control commands', () => {
    expect(commandDefinitions.map((definition) => definition.toJSON().name)).toEqual([
      'play',
      'queue',
      'login',
      'skip',
      'join',
      'leave',
      'pause',
      'resume',
      'volume',
    ])
    expect(commands.size).toBe(9)
  })

  it('login creates a private Discord link', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'login',
      userId: 'discord-1',
      displayName: 'Luis',
      discordUsername: 'luis',
      discordGlobalName: 'Luis Global',
      discordAvatarUrl: 'https://cdn.example/avatar.png',
      guildId: 'guild-1',
    })

    await commands.get('login')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.deferEphemeral).toHaveBeenCalledOnce()
    expect(mocks.createDiscordLink).toHaveBeenCalledWith({
      discordUserId: 'discord-1',
      discordUsername: 'luis',
      discordGlobalName: 'Luis Global',
      discordAvatarUrl: 'https://cdn.example/avatar.png',
      guildId: 'guild-1',
    })
    expect(mocks.ephemeralReply).toHaveBeenCalledWith(
      [
        'Use este link privado para vincular sua sessão do Waves ao Discord:',
        'https://waves.example.com/auth/discord-link?token=secret',
        'Ele expira em 10 minutos e só funciona uma vez.',
      ].join('\n'),
    )
  })

  it('play sends query and requester identity', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'track',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      voiceAdapterCreator: vi.fn(),
    })
    mocks.startPlayback.mockResolvedValue('started')

    await commands.get('play')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.deferEphemeral).toHaveBeenCalledOnce()
    expect(mocks.play).toHaveBeenCalledWith({
      query: 'track',
      requestedByDiscordUserId: 'user-1',
      requestedByDisplayName: 'Luis',
    })
    expect(mocks.publicReply).toHaveBeenCalledWith(
      'Adicionada à fila: **Track One** — Artist One. Reprodução iniciada.',
    )
  })

  it('play handles missing tracks with a friendly response', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'missing',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      voiceAdapterCreator: vi.fn(),
    })
    mocks.play.mockRejectedValue(new WavesApiError('TRACK_NOT_FOUND', 404))

    const result = await commands.get('play')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.ephemeralReply).toHaveBeenCalledWith(
      'Não encontrei nenhuma faixa para essa busca.',
    )
    expect(result.outcome).toBe('user_error')
    expect(result.failure).toBeInstanceOf(WavesApiError)
  })

  it('play explains duplicate tracks without exposing API details', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'track',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      voiceAdapterCreator: vi.fn(),
    })
    mocks.play.mockRejectedValue(new WavesApiError('DUPLICATE_TRACK', 409))

    const result = await commands.get('play')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.ephemeralReply).toHaveBeenCalledWith('Esta faixa já está na fila.')
    expect(result.outcome).toBe('user_error')
    expect(result.failure).toBeInstanceOf(WavesApiError)
  })

  it('play connects to the member voice channel before adding and starting playback', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'track',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      voiceAdapterCreator: vi.fn(),
    })
    mocks.isConnected.mockReturnValue(false)
    mocks.startPlayback.mockResolvedValue('started')

    const result = await commands.get('play')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.joinVoice).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'voice-1',
      adapterCreator: context.voiceAdapterCreator,
    })
    expect(mocks.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'voice.connected',
        guildId: 'guild-1',
        guildName: 'Waves',
        voiceChannelId: 'voice-1',
        voiceChannelName: 'ondas-da-noite',
      }),
    )
    expect(mocks.sendEvent.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.play.mock.invocationCallOrder[0]!,
    )
    expect(result).toEqual({ outcome: 'success' })
  })

  it('play requires the member to be in a voice channel', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'track',
      guildId: 'guild-1',
    })

    const rejectedResult = await commands
      .get('play')!
      .execute(context, api, voiceManager, playbackManager)

    expect(mocks.ephemeralReply).toHaveBeenCalledWith(
      'Entre em um canal de voz antes de usar este comando.',
    )
    expect(mocks.play).not.toHaveBeenCalled()
    expect(rejectedResult).toEqual({ outcome: 'rejected' })
  })

  it('play handles API unavailability without technical details', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'track',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      voiceAdapterCreator: vi.fn(),
    })
    mocks.play.mockRejectedValue(new Error('http://internal/token-secret'))

    const failureResult = await commands
      .get('play')!
      .execute(context, api, voiceManager, playbackManager)

    expect(mocks.ephemeralReply).toHaveBeenCalledWith(
      'Não consegui acessar o Waves agora. Tente novamente em instantes.',
    )
    expect(JSON.stringify(mocks.ephemeralReply.mock.calls)).not.toContain('token-secret')
    expect(failureResult.outcome).toBe('internal_error')
    expect(failureResult.failure).toBeInstanceOf(Error)
  })

  it('formats an empty queue and limits output to ten items', () => {
    expect(formatQueue([])).toBe('A fila está vazia.')
    const manyItems = Array.from({ length: 12 }, (_, index) => ({
      ...item,
      id: `queue-${index}`,
      position: index,
    }))
    const formatted = formatQueue(manyItems)
    expect(formatted).toContain('10. **Track One**')
    expect(formatted).not.toContain('11. **Track One**')
    expect(formatted).toContain('… e mais 2 faixa(s).')
  })

  it('skip formats an empty queue and the next item', async () => {
    const empty = setup({ name: 'skip' })
    await commands
      .get('skip')!
      .execute(empty.context, empty.api, empty.voiceManager, empty.playbackManager)
    expect(empty.mocks.ephemeralReply).toHaveBeenCalledWith(
      'Este comando só pode ser usado em um servidor.',
    )

    const next = setup({ name: 'skip', guildId: 'guild-1' })
    next.mocks.skipPlayback.mockResolvedValue('skipped')
    await commands
      .get('skip')!
      .execute(next.context, next.api, next.voiceManager, next.playbackManager)
    expect(next.mocks.publicReply).toHaveBeenCalledWith('Faixa pulada. A próxima faixa começou.')
  })

  it('joins and leaves voice while synchronizing events', async () => {
    const outside = setup({ name: 'join' })
    await commands
      .get('join')!
      .execute(outside.context, outside.api, outside.voiceManager, outside.playbackManager)
    expect(outside.mocks.ephemeralReply).toHaveBeenCalledWith(
      'Entre em um canal de voz antes de usar este comando.',
    )

    const inside = setup({
      name: 'join',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      voiceAdapterCreator: vi.fn(),
    })
    await commands
      .get('join')!
      .execute(inside.context, inside.api, inside.voiceManager, inside.playbackManager)
    expect(inside.mocks.deferEphemeral).toHaveBeenCalledOnce()
    expect(inside.mocks.joinVoice).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'voice-1',
      adapterCreator: inside.context.voiceAdapterCreator,
    })
    expect(inside.mocks.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'voice.connected',
        guildId: 'guild-1',
        guildName: 'Waves',
        voiceChannelId: 'voice-1',
        voiceChannelName: 'ondas-da-noite',
      }),
    )
    expect(inside.mocks.ephemeralReply).toHaveBeenCalledWith('Waves conectado ao seu canal de voz.')
    expect(inside.mocks.followUpPublic).toHaveBeenCalledOnce()
    const qrMessage = inside.mocks.followUpPublic.mock.calls[0]![0]
    expect(qrMessage.content).toBe('Controle essa Jam pelo link/qrcode:\nhttps://waves.example.com')
    expect(qrMessage.files?.[0]?.name).toBe('waves-qrcode.png')
    expect(Buffer.isBuffer(qrMessage.files?.[0]?.attachment)).toBe(true)
    expect(inside.mocks.sendEvent.mock.invocationCallOrder[0]).toBeLessThan(
      inside.mocks.ephemeralReply.mock.invocationCallOrder[0]!,
    )

    const leave = setup({ name: 'leave', guildId: 'guild-1' })
    await commands
      .get('leave')!
      .execute(leave.context, leave.api, leave.voiceManager, leave.playbackManager)
    expect(leave.mocks.deferEphemeral).toHaveBeenCalledOnce()
    expect(leave.mocks.leaveVoice).toHaveBeenCalledWith('guild-1')
    expect(leave.mocks.destroyPlaybackGuild).toHaveBeenCalledWith('guild-1')
    expect(leave.mocks.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'voice.disconnected',
        guildId: 'guild-1',
      }),
    )
    expect(leave.mocks.ephemeralReply).toHaveBeenCalledWith('Waves desconectado do canal de voz.')
    expect(leave.mocks.ephemeralReply.mock.invocationCallOrder[0]).toBeLessThan(
      leave.mocks.sendEvent.mock.invocationCallOrder[0]!,
    )
  })

  it('responds to voice commands even when event synchronization fails', async () => {
    const join = setup({
      name: 'join',
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
      voiceAdapterCreator: vi.fn(),
    })
    join.mocks.sendEvent.mockRejectedValue(new Error('web unavailable'))

    await expect(
      commands
        .get('join')!
        .execute(join.context, join.api, join.voiceManager, join.playbackManager),
    ).resolves.toMatchObject({ outcome: 'degraded' })
    expect(join.mocks.ephemeralReply).toHaveBeenCalledWith('Waves conectado ao seu canal de voz.')
    expect(join.mocks.leaveVoice).not.toHaveBeenCalled()

    const leave = setup({ name: 'leave', guildId: 'guild-1' })
    leave.mocks.sendEvent.mockRejectedValue(new Error('web unavailable'))

    await expect(
      commands
        .get('leave')!
        .execute(leave.context, leave.api, leave.voiceManager, leave.playbackManager),
    ).resolves.toMatchObject({ outcome: 'degraded' })
    expect(leave.mocks.ephemeralReply).toHaveBeenCalledWith('Waves desconectado do canal de voz.')
    expect(leave.mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'command.leave.event',
        outcome: 'failed',
      }),
      'Best-effort operation failed',
    )
    expect(leave.mocks.loggerWarn.mock.calls.at(-1)?.[0].err).toBeInstanceOf(Error)
  })

  it('ignores unknown commands without executing the API', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({ name: 'unknown' })

    await expect(executeCommand(context, api, voiceManager, playbackManager)).resolves.toEqual({
      outcome: 'unknown_command',
    })
    expect(mocks.getQueue).not.toHaveBeenCalled()
    expect(mocks.play).not.toHaveBeenCalled()
    expect(mocks.skip).not.toHaveBeenCalled()
  })
})
