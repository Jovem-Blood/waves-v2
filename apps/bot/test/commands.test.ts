import type { QueueItem } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import type { WavesApi } from '../src/api/waves-api.client.js'
import { WavesApiError } from '../src/api/waves-api.errors.js'
import { commandDefinitions, commands, executeCommand } from '../src/commands/index.js'
import { formatQueue } from '../src/commands/queue.command.js'
import type { CommandContext, CommandResponder } from '../src/commands/types.js'
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
  requestedByDisplayName: 'Luis',
  status: 'queued',
  position: 0,
  createdAt: '2026-06-18T18:00:00.000Z',
  updatedAt: '2026-06-18T18:00:00.000Z',
}

function setup(overrides: Partial<CommandContext> = {}) {
  const deferEphemeral = vi.fn().mockResolvedValue(undefined)
  const publicReply = vi.fn().mockResolvedValue(undefined)
  const ephemeralReply = vi.fn().mockResolvedValue(undefined)
  const responder: CommandResponder = {
    deferEphemeral,
    public: publicReply,
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
  const joinVoice = vi.fn().mockResolvedValue('connected' as const)
  const leaveVoice = vi.fn().mockReturnValue(true)
  const voiceManager: VoiceManager = {
    join: joinVoice,
    leave: leaveVoice,
    isConnected: vi.fn().mockReturnValue(true),
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
  }
  const api: WavesApi = {
    claimPlayback,
    completePlayback,
    getQueue,
    play,
    resolveSource,
    skip,
    sendEvent,
  }
  const context: CommandContext = {
    name: 'test',
    userId: 'user-1',
    displayName: 'Luis',
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
      getQueue,
      play,
      publicReply,
      startPlayback,
      skipPlayback,
      destroyPlaybackGuild,
      sendEvent,
      skip,
      joinVoice,
      leaveVoice,
    },
  }
}

describe('bot commands', () => {
  it('defines exactly the five phase-one commands', () => {
    expect(commandDefinitions.map((definition) => definition.toJSON().name)).toEqual([
      'play',
      'queue',
      'skip',
      'join',
      'leave',
    ])
    expect(commands.size).toBe(5)
  })

  it('play sends query and requester identity', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'track',
    })

    await commands.get('play')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.deferEphemeral).toHaveBeenCalledOnce()
    expect(mocks.play).toHaveBeenCalledWith({
      query: 'track',
      requestedByDiscordUserId: 'user-1',
      requestedByDisplayName: 'Luis',
    })
    expect(mocks.publicReply).toHaveBeenCalledWith(
      'Adicionada à fila: **Track One** — Artist One. Use `/join` para iniciar a reprodução.',
    )
  })

  it('play handles missing tracks with a friendly response', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'missing',
    })
    mocks.play.mockRejectedValue(new WavesApiError('TRACK_NOT_FOUND', 404))

    await commands.get('play')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.ephemeralReply).toHaveBeenCalledWith(
      'Não encontrei nenhuma faixa para essa busca.',
    )
  })

  it('play handles API unavailability without technical details', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({
      name: 'play',
      query: 'track',
    })
    mocks.play.mockRejectedValue(new Error('http://internal/token-secret'))

    await commands.get('play')!.execute(context, api, voiceManager, playbackManager)

    expect(mocks.ephemeralReply).toHaveBeenCalledWith(
      'Não consegui acessar o Waves agora. Tente novamente em instantes.',
    )
    expect(JSON.stringify(mocks.ephemeralReply.mock.calls)).not.toContain('token-secret')
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
      voiceChannelId: 'voice-1',
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
        voiceChannelId: 'voice-1',
      }),
    )
    expect(inside.mocks.ephemeralReply).toHaveBeenCalledWith('Waves conectado ao seu canal de voz.')
    expect(inside.mocks.ephemeralReply.mock.invocationCallOrder[0]).toBeLessThan(
      inside.mocks.sendEvent.mock.invocationCallOrder[0]!,
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
      voiceChannelId: 'voice-1',
      voiceAdapterCreator: vi.fn(),
    })
    join.mocks.sendEvent.mockRejectedValue(new Error('web unavailable'))

    await expect(
      commands
        .get('join')!
        .execute(join.context, join.api, join.voiceManager, join.playbackManager),
    ).resolves.toBeUndefined()
    expect(join.mocks.ephemeralReply).toHaveBeenCalledWith('Waves conectado ao seu canal de voz.')
    expect(join.mocks.leaveVoice).not.toHaveBeenCalled()

    const leave = setup({ name: 'leave', guildId: 'guild-1' })
    leave.mocks.sendEvent.mockRejectedValue(new Error('web unavailable'))

    await expect(
      commands
        .get('leave')!
        .execute(leave.context, leave.api, leave.voiceManager, leave.playbackManager),
    ).resolves.toBeUndefined()
    expect(leave.mocks.ephemeralReply).toHaveBeenCalledWith('Waves desconectado do canal de voz.')
  })

  it('ignores unknown commands without executing the API', async () => {
    const { api, context, mocks, playbackManager, voiceManager } = setup({ name: 'unknown' })

    await expect(executeCommand(context, api, voiceManager, playbackManager)).resolves.toBe(false)
    expect(mocks.getQueue).not.toHaveBeenCalled()
    expect(mocks.play).not.toHaveBeenCalled()
    expect(mocks.skip).not.toHaveBeenCalled()
  })
})
