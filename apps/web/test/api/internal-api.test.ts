import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'

import { apiErrorSchema, type TrackMetadata } from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInternalEventsHandler } from '../../server/api/internal/bot/events.post'
import { createInternalPlayHandler } from '../../server/api/internal/bot/play.post'
import { createInternalPlaybackClaimHandler } from '../../server/api/internal/bot/playback/claim.post'
import { createInternalPlaybackCompleteHandler } from '../../server/api/internal/bot/playback/complete.post'
import { createInternalQueueHandler } from '../../server/api/internal/bot/queue.get'
import { createInternalSkipHandler } from '../../server/api/internal/bot/skip.post'
import { createInternalResolveSourceHandler } from '../../server/api/internal/bot/sources/[queueItemId]/resolve.post'
import { createQueueListHandler } from '../../server/api/queue/index.get'
import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import { PlayerStateService } from '../../server/services/player-state.service'
import { QueueService } from '../../server/services/queue.service'
import type { WavesLogger } from '../../server/utils/logger'
import type {
  PublicApiDependencies,
  PublicSpotifyService,
} from '../../server/utils/public-api-dependencies'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const expectedToken = 'internal-test-token'
const now = () => new Date('2026-06-18T17:00:00.000Z')

const firstTrack: TrackMetadata = {
  id: 'spotify:track-1',
  provider: 'spotify',
  providerTrackId: 'track-1',
  title: 'First Result',
  artists: ['Artist One'],
  durationMs: 120_000,
}

const secondTrack: TrackMetadata = {
  ...firstTrack,
  id: 'spotify:track-2',
  providerTrackId: 'track-2',
  title: 'Second Result',
}

interface TestContext {
  baseUrl: string
  connection: DatabaseConnection
  dependencies: PublicApiDependencies
  loggerInfo: ReturnType<typeof vi.fn>
  server: Server
  spotifySearch: ReturnType<typeof vi.fn<(query: string) => Promise<TrackMetadata[]>>>
  sourceResolve: ReturnType<typeof vi.fn>
}

let context: TestContext | undefined

async function startTestApi(): Promise<TestContext> {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })
  const queueRepository = new QueueRepository(connection.db)
  const playerStateRepository = new PlayerStateRepository(connection.db, now)
  const unitOfWork = new DatabaseUnitOfWork(connection.db, now)
  let nextId = 0
  const spotifySearch = vi
    .fn<(query: string) => Promise<TrackMetadata[]>>()
    .mockResolvedValue([firstTrack, secondTrack])
  const spotifyService: PublicSpotifyService = { searchTracks: spotifySearch }
  const sourceResolve = vi.fn().mockResolvedValue({
    queueItemId: 'queue-1',
    source: {
      provider: 'youtube_music',
      sourceIdentifier: 'youtube-1',
      streamUrl: 'https://stream.example/signed',
      expiresAt: '2026-06-20T12:05:00.000Z',
    },
  })
  const dependencies: PublicApiDependencies = {
    queueService: new QueueService(queueRepository, unitOfWork, now, () => `queue-${++nextId}`),
    playerStateService: new PlayerStateService(playerStateRepository, unitOfWork, now),
    spotifyService,
  }
  const loggerInfo = vi.fn()
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: loggerInfo,
    warn: vi.fn(),
  } as unknown as WavesLogger
  const getDependencies = () => dependencies
  const getExpectedToken = () => expectedToken
  const router = createRouter()

  router.get('/api/queue', createQueueListHandler(getDependencies))
  router.get(
    '/api/internal/bot/queue',
    createInternalQueueHandler(getDependencies, getExpectedToken),
  )
  router.post(
    '/api/internal/bot/play',
    createInternalPlayHandler(getDependencies, getExpectedToken),
  )
  router.post(
    '/api/internal/bot/playback/claim',
    createInternalPlaybackClaimHandler(getDependencies, getExpectedToken),
  )
  router.post(
    '/api/internal/bot/playback/complete',
    createInternalPlaybackCompleteHandler(getDependencies, getExpectedToken),
  )
  router.post(
    '/api/internal/bot/skip',
    createInternalSkipHandler(getDependencies, getExpectedToken),
  )
  router.post(
    '/api/internal/bot/events',
    createInternalEventsHandler(
      getExpectedToken,
      () => logger,
      () => dependencies.playerStateService,
    ),
  )
  router.post(
    '/api/internal/bot/sources/:queueItemId/resolve',
    createInternalResolveSourceHandler(
      () => ({ audioSourceService: { resolve: sourceResolve } }),
      getExpectedToken,
    ),
  )

  const app = createApp()
  app.use(router.handler)
  const server = createServer(toNodeListener(app))

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Test API did not bind to a TCP port')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    connection,
    dependencies,
    loggerInfo,
    server,
    spotifySearch,
    sourceResolve,
  }
}

async function closeTestApi(testContext: TestContext): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    testContext.server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
  testContext.connection.close()
}

async function request(
  path: string,
  init?: RequestInit,
): Promise<{ body: unknown; response: Response }> {
  if (!context) {
    throw new Error('Test API is not running')
  }

  const response = await fetch(`${context.baseUrl}${path}`, init)
  return { response, body: await response.json() }
}

function authorized(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers)),
      Authorization: `Bearer ${expectedToken}`,
    },
  }
}

async function postJson(path: string, body: unknown, withAuthorization = true) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
  return request(path, withAuthorization ? authorized(init) : init)
}

beforeEach(async () => {
  context = await startTestApi()
})

afterEach(async () => {
  if (context) {
    await closeTestApi(context)
    context = undefined
  }
})

describe('internal bot API authorization', () => {
  const endpoints = [
    { path: '/api/internal/bot/queue', method: 'GET' },
    { path: '/api/internal/bot/play', method: 'POST' },
    { path: '/api/internal/bot/playback/claim', method: 'POST' },
    { path: '/api/internal/bot/playback/complete', method: 'POST' },
    { path: '/api/internal/bot/skip', method: 'POST' },
    { path: '/api/internal/bot/events', method: 'POST' },
    { path: '/api/internal/bot/sources/queue-1/resolve', method: 'POST' },
  ] as const

  it.each(endpoints)('returns 401 without authorization for $path', async ({ path, method }) => {
    const { response, body } = await request(path, {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? '{}' : undefined,
    })

    expect(response.status).toBe(401)
    expect(apiErrorSchema.parse(body)).toEqual(body)
  })

  it.each(endpoints)('returns 401 for malformed bearer on $path', async ({ path, method }) => {
    const { response } = await request(path, {
      method,
      headers: {
        Authorization: expectedToken,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'POST' ? '{}' : undefined,
    })

    expect(response.status).toBe(401)
  })

  it.each(endpoints)('returns 401 for invalid token on $path', async ({ path, method }) => {
    const { response } = await request(path, {
      method,
      headers: {
        Authorization: 'Bearer wrong-token',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'POST' ? '{}' : undefined,
    })

    expect(response.status).toBe(401)
  })

  it('does not accept a token from the query string or execute dependencies', async () => {
    const queueList = vi.spyOn(context!.dependencies.queueService, 'list')

    const { response } = await request(`/api/internal/bot/queue?token=${expectedToken}`)

    expect(response.status).toBe(401)
    expect(queueList).not.toHaveBeenCalled()
    expect(context?.spotifySearch).not.toHaveBeenCalled()
    expect(context?.loggerInfo).not.toHaveBeenCalled()
  })
})

describe('authorized internal bot API', () => {
  it('returns the same active queue as the public endpoint', async () => {
    context?.dependencies.queueService.add({ track: firstTrack })
    context?.dependencies.queueService.add({ track: secondTrack })

    const internalQueue = await request('/api/internal/bot/queue', authorized())
    const publicQueue = await request('/api/queue')

    expect(internalQueue.response.status).toBe(200)
    expect(internalQueue.body).toEqual(publicQueue.body)
  })

  it('validates play input and rejects extra fields', async () => {
    const invalid = await postJson('/api/internal/bot/play', {
      query: 'track',
      requestedByDiscordUserId: 'discord-1',
      requestedByDisplayName: 'Luis',
      extra: true,
    })

    expect(invalid.response.status).toBe(400)
    expect(apiErrorSchema.parse(invalid.body)).toEqual(invalid.body)
    expect(context?.spotifySearch).not.toHaveBeenCalled()
  })

  it('selects the first Spotify result and preserves requester identity', async () => {
    const { response, body } = await postJson('/api/internal/bot/play', {
      query: 'track',
      requestedByDiscordUserId: 'discord-1',
      requestedByDisplayName: 'Luis',
    })

    expect(response.status).toBe(200)
    expect(context?.spotifySearch).toHaveBeenCalledWith('track')
    expect(body).toMatchObject({
      track: firstTrack,
      item: {
        id: 'queue-1',
        track: firstTrack,
        requestedByDiscordUserId: 'discord-1',
        requestedByDisplayName: 'Luis',
      },
    })
  })

  it('returns TRACK_NOT_FOUND when Spotify has no results', async () => {
    context?.spotifySearch.mockResolvedValue([])

    const { response, body } = await postJson('/api/internal/bot/play', {
      query: 'missing',
      requestedByDiscordUserId: 'discord-1',
      requestedByDisplayName: 'Luis',
    })

    expect(response.status).toBe(404)
    expect(body).toMatchObject({
      statusCode: 404,
      statusMessage: 'Track not found',
      data: { code: 'TRACK_NOT_FOUND' },
    })
    expect(apiErrorSchema.parse(body)).toEqual(body)
  })

  it('returns a validated playable source through the internal boundary', async () => {
    const { response, body } = await postJson('/api/internal/bot/sources/queue-1/resolve', {})

    expect(response.status).toBe(200)
    expect(context?.sourceResolve).toHaveBeenCalledWith('queue-1', { forceRefresh: false })
    expect(body).toMatchObject({
      queueItemId: 'queue-1',
      source: {
        provider: 'youtube_music',
        sourceIdentifier: 'youtube-1',
        streamUrl: 'https://stream.example/signed',
        expiresAt: '2026-06-20T12:05:00.000Z',
      },
    })
  })

  it('claims and completes playback through atomic internal endpoints', async () => {
    context?.dependencies.queueService.add({ track: firstTrack })
    context?.dependencies.queueService.add({ track: secondTrack })
    context?.dependencies.playerStateService.voiceConnected('guild-1', 'voice-1')

    const claimed = await postJson('/api/internal/bot/playback/claim', {})
    expect(claimed.response.status).toBe(200)
    expect(claimed.body).toMatchObject({
      player: {
        status: 'playing',
        currentQueueItemId: 'queue-1',
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
      },
      item: {
        id: 'queue-1',
        status: 'playing',
      },
    })

    const completed = await postJson('/api/internal/bot/playback/complete', {
      queueItemId: 'queue-1',
      outcome: 'played',
    })
    expect(completed.response.status).toBe(200)
    expect(completed.body).toMatchObject({
      completedQueueItemId: 'queue-1',
      player: {
        status: 'playing',
        currentQueueItemId: 'queue-2',
      },
      nextItem: {
        id: 'queue-2',
        status: 'playing',
        position: 0,
      },
    })
  })

  it('executes the same logical skip service used by the public API', async () => {
    context?.dependencies.queueService.add({ track: firstTrack })
    context?.dependencies.queueService.add({ track: secondTrack })

    const { response, body } = await postJson('/api/internal/bot/skip', {})

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      player: {
        status: 'playing',
        currentQueueItemId: 'queue-2',
        updatedAt: '2026-06-18T17:00:00.000Z',
      },
      queue: [
        expect.objectContaining({
          id: 'queue-2',
          status: 'playing',
          position: 0,
        }),
      ],
    })
  })

  it('rejects invalid events and accepts valid events with safe structured logs', async () => {
    const invalid = await postJson('/api/internal/bot/events', {
      type: '',
      occurredAt: 'not-a-date',
      payload: {},
    })
    expect(invalid.response.status).toBe(400)
    expect(context?.loggerInfo).not.toHaveBeenCalled()

    const validEvent = {
      type: 'command.received',
      occurredAt: '2026-06-18T17:00:00.000Z',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      payload: {
        command: 'play',
        authorization: `Bearer ${expectedToken}`,
        secret: 'must-not-be-logged',
      },
    }
    const accepted = await postJson('/api/internal/bot/events', validEvent)

    expect(accepted.response.status).toBe(202)
    expect(accepted.body).toMatchObject({ accepted: true })
    expect(context?.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: validEvent.type,
        occurredAt: validEvent.occurredAt,
        guildId: validEvent.guildId,
        voiceChannelId: validEvent.voiceChannelId,
        operation: 'route.internal.events',
        outcome: 'accepted',
      }),
      'Bot event received',
    )
    const logged = JSON.stringify(context?.loggerInfo.mock.calls)
    expect(logged).not.toContain(expectedToken)
    expect(logged).not.toContain('must-not-be-logged')
    expect(logged).not.toContain('authorization')
    expect(logged).not.toContain('payload')
  })

  it('persists voice connection events and clears them on disconnect', async () => {
    const connected = await postJson('/api/internal/bot/events', {
      type: 'voice.connected',
      occurredAt: '2026-06-18T17:00:00.000Z',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      payload: { result: 'connected' },
    })

    expect(connected.response.status).toBe(202)
    expect(context?.dependencies.playerStateService.get()).toMatchObject({
      status: 'idle',
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      updatedAt: '2026-06-18T17:00:00.000Z',
    })

    const disconnected = await postJson('/api/internal/bot/events', {
      type: 'voice.disconnected',
      occurredAt: '2026-06-18T17:00:00.000Z',
      guildId: 'guild-1',
      payload: { reason: 'command' },
    })

    expect(disconnected.response.status).toBe(202)
    expect(context?.dependencies.playerStateService.get()).toMatchObject({
      status: 'idle',
      updatedAt: '2026-06-18T17:00:00.000Z',
    })
  })
})
