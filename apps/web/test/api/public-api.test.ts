import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'

import {
  apiErrorSchema,
  autoplayStateSchema,
  historyPageSchema,
  type AddQueueItemInput,
  type TrackMetadata,
} from '@waves/shared'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createApp, createRouter, toNodeListener } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { healthHandler } from '../../server/api/health.get'
import { createGuestAuthHandler } from '../../server/api/auth/guest.post'
import { createLogoutHandler } from '../../server/api/auth/logout.post'
import { createDiscordLinkCreateHandler } from '../../server/api/auth/discord-link/create.post'
import { createDiscordLinkConsumeHandler } from '../../server/routes/auth/discord-link.get'
import { createMeHandler } from '../../server/api/me.get'
import { createPlayerGetHandler } from '../../server/api/player/index.get'
import { createPlayerSkipHandler } from '../../server/api/player/skip.post'
import { createQueueRemoveHandler } from '../../server/api/queue/[id].delete'
import { createQueueMoveHandler } from '../../server/api/queue/[id]/move.post'
import { createQueueRestoreHandler } from '../../server/api/queue/[id]/restore.post'
import { createQueueListHandler } from '../../server/api/queue/index.get'
import { createQueueAddHandler } from '../../server/api/queue/index.post'
import { createHistoryListHandler } from '../../server/api/history/index.get'
import { createSpotifySearchHandler } from '../../server/api/spotify/search.get'
import { createOperationalStatusHandler } from '../../server/api/status.get'
import { createAutoplayGetHandler } from '../../server/api/autoplay/index.get'
import { createAutoplayUpdateHandler } from '../../server/api/autoplay/index.put'
import { createAutoplaySuggestionRejectHandler } from '../../server/api/autoplay/suggestion.delete'
import { createRealtimeEventsHandler } from '../../server/api/events.get'
import { SpotifyUnavailableError } from '../../server/clients/spotify.errors'
import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { PlayerStateRepository } from '../../server/repositories/player-state.repository'
import { OperationalStatusRepository } from '../../server/repositories/operational-status.repository'
import { QueueRepository } from '../../server/repositories/queue.repository'
import { SessionRepository } from '../../server/repositories/session.repository'
import { DiscordLoginTokenRepository } from '../../server/repositories/discord-login-token.repository'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import { UserRepository } from '../../server/repositories/user.repository'
import { AutoplayRepository } from '../../server/repositories/autoplay.repository'
import { AutoplaySuggestionRepository } from '../../server/repositories/autoplay-suggestion.repository'
import { AuthService } from '../../server/services/auth.service'
import { PlayerStateService } from '../../server/services/player-state.service'
import { OperationalStatusService } from '../../server/services/operational-status.service'
import { QueueService } from '../../server/services/queue.service'
import { HistoryService } from '../../server/services/history.service'
import { AutoplayService } from '../../server/services/autoplay.service'
import type {
  PublicApiDependencies,
  PublicSpotifyService,
} from '../../server/utils/public-api-dependencies'
import { createRealtimeEventBus, type RealtimeEventBus } from '../../server/utils/realtime-events'

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url))
const now = () => new Date('2026-06-18T16:00:00.000Z')

const firstTrack: TrackMetadata = {
  id: 'spotify:track-1',
  provider: 'spotify',
  providerTrackId: 'track-1',
  title: 'Track One',
  artists: ['Artist One'],
  durationMs: 120_000,
}

const secondTrack: TrackMetadata = {
  ...firstTrack,
  id: 'spotify:track-2',
  providerTrackId: 'track-2',
  title: 'Track Two',
}

interface TestContext {
  baseUrl: string
  connection: DatabaseConnection
  dependencies: PublicApiDependencies
  server: Server
  spotifySearch: ReturnType<typeof vi.fn<(query: string) => Promise<TrackMetadata[]>>>
  realtimeBus: RealtimeEventBus
  sessionCookie?: string
}

let context: TestContext | undefined

async function startTestApi(): Promise<TestContext> {
  const connection = createDatabaseConnection({ url: ':memory:' })
  migrate(connection.db, { migrationsFolder })

  const queueRepository = new QueueRepository(connection.db)
  const userRepository = new UserRepository(connection.db)
  const sessionRepository = new SessionRepository(connection.db)
  const discordLoginTokenRepository = new DiscordLoginTokenRepository(connection.db)
  const playerStateRepository = new PlayerStateRepository(connection.db, now)
  const operationalStatusRepository = new OperationalStatusRepository(connection.db, now)
  const unitOfWork = new DatabaseUnitOfWork(connection.db, now)
  const autoplayService = new AutoplayService(
    new AutoplayRepository(connection.db, now),
    new AutoplaySuggestionRepository(connection.db),
    now,
  )
  let nextId = 0
  const spotifySearch = vi
    .fn<(query: string) => Promise<TrackMetadata[]>>()
    .mockResolvedValue([firstTrack])
  const spotifyService: PublicSpotifyService = {
    searchTracks: spotifySearch,
  }
  const realtimeBus = createRealtimeEventBus()
  const dependencies: PublicApiDependencies = {
    queueService: new QueueService(queueRepository, unitOfWork, now, () => `queue-${++nextId}`),
    historyService: new HistoryService(queueRepository),
    playerStateService: new PlayerStateService(playerStateRepository, unitOfWork, now),
    operationalStatusService: new OperationalStatusService(
      operationalStatusRepository,
      playerStateRepository,
      now,
    ),
    authService: new AuthService(
      userRepository,
      sessionRepository,
      discordLoginTokenRepository,
      queueRepository,
      now,
      vi
        .fn<() => string>()
        .mockReturnValueOnce('user-1')
        .mockReturnValueOnce('session-1')
        .mockReturnValueOnce('user-2')
        .mockReturnValueOnce('session-2'),
      () => 'test-session-token',
    ),
    spotifyService,
    autoplayService,
  }
  const getDependencies = () => dependencies
  const router = createRouter()

  router.get('/api/health', healthHandler)
  router.get('/api/me', createMeHandler(getDependencies))
  router.post('/api/auth/guest', createGuestAuthHandler(getDependencies))
  router.post('/api/auth/logout', createLogoutHandler(getDependencies))
  router.post(
    '/api/auth/discord-link/create',
    createDiscordLinkCreateHandler(
      getDependencies,
      () => 'https://waves.example.com',
      () => 'internal-token',
    ),
  )
  router.get('/auth/discord-link', createDiscordLinkConsumeHandler(getDependencies))
  router.get('/api/spotify/search', createSpotifySearchHandler(getDependencies))
  router.get('/api/queue', createQueueListHandler(getDependencies))
  router.get('/api/history', createHistoryListHandler(getDependencies))
  router.post('/api/queue', createQueueAddHandler(getDependencies))
  router.delete('/api/queue/:id', createQueueRemoveHandler(getDependencies))
  router.post('/api/queue/:id/move', createQueueMoveHandler(getDependencies))
  router.post('/api/queue/:id/restore', createQueueRestoreHandler(getDependencies))
  router.get('/api/player', createPlayerGetHandler(getDependencies))
  router.post('/api/player/skip', createPlayerSkipHandler(getDependencies))
  router.get('/api/status', createOperationalStatusHandler(getDependencies))
  router.get('/api/events', createRealtimeEventsHandler(getDependencies, () => realtimeBus))
  router.get('/api/autoplay', createAutoplayGetHandler(getDependencies))
  router.put('/api/autoplay', createAutoplayUpdateHandler(getDependencies))
  router.delete('/api/autoplay/suggestion', createAutoplaySuggestionRejectHandler(getDependencies))

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
    server,
    spotifySearch,
    realtimeBus,
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

  const response = await fetch(`${context.baseUrl}${path}`, {
    ...init,
    headers: {
      ...(context.sessionCookie ? { Cookie: context.sessionCookie } : {}),
      ...Object.fromEntries(new Headers(init?.headers).entries()),
    },
  })
  return {
    response,
    body: await response.json(),
  }
}

async function postJson(path: string, body: unknown, headers?: HeadersInit) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function createGuest(displayName = 'Luis') {
  const { response, body } = await postJson('/api/auth/guest', { displayName })
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('Guest session did not set a cookie')
  if (context) context.sessionCookie = setCookie.split(';')[0]
  return { response, body }
}

async function addTrack(track: TrackMetadata) {
  if (!context?.sessionCookie) {
    await createGuest()
  }
  return postJson('/api/queue', { track } satisfies AddQueueItemInput)
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

describe('public API', () => {
  it('returns health without consulting external dependencies', async () => {
    const { response, body } = await request('/api/health')

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true })
    expect(context?.spotifySearch).not.toHaveBeenCalled()
  })

  it.each(['/api/spotify/search', '/api/spotify/search?q=', '/api/spotify/search?q=a&q=b'])(
    'rejects invalid Spotify query: %s',
    async (path) => {
      const { response, body } = await request(path)

      expect(response.status).toBe(400)
      expect(apiErrorSchema.parse(body)).toEqual(body)
      expect(body).toMatchObject({
        statusCode: 400,
        statusMessage: 'Invalid request',
        data: { code: 'VALIDATION_ERROR' },
      })
      expect(context?.spotifySearch).not.toHaveBeenCalled()
    },
  )

  it('returns normalized Spotify tracks through HTTP', async () => {
    const { response, body } = await request('/api/spotify/search?q=track%20one')

    expect(response.status).toBe(200)
    expect(body).toEqual([firstTrack])
    expect(context?.spotifySearch).toHaveBeenCalledWith('track one')
  })

  it('creates, reads and clears a guest session', async () => {
    const initial = await request('/api/me')
    expect(initial.response.status).toBe(200)
    expect(initial.body).toEqual({ user: null })

    const guest = await createGuest('  Luis  ')
    expect(guest.response.status).toBe(200)
    expect(guest.body).toMatchObject({
      user: { id: 'user-1', kind: 'guest', displayName: 'Luis' },
    })

    const me = await request('/api/me')
    expect(me.response.status).toBe(200)
    expect(me.body).toMatchObject({
      user: { id: 'user-1', kind: 'guest', displayName: 'Luis' },
    })

    const logout = await postJson('/api/auth/logout', {})
    expect(logout.response.status).toBe(200)
    expect(logout.body).toEqual({ ok: true })
    if (context) context.sessionCookie = undefined

    expect((await request('/api/me')).body).toEqual({ user: null })
  })

  it('creates Discord link tokens only for the internal bot', async () => {
    const unauthorized = await postJson('/api/auth/discord-link/create', {
      discordUserId: 'discord-1',
      discordUsername: 'luis',
    })
    expect(unauthorized.response.status).toBe(401)

    const authorized = await postJson(
      '/api/auth/discord-link/create',
      {
        discordUserId: 'discord-1',
        discordUsername: 'luis',
        discordGlobalName: 'Luis',
        guildId: 'guild-1',
      },
      { Authorization: 'Bearer internal-token' },
    )
    expect(authorized.response.status).toBe(200)
    expect(authorized.body).toEqual({
      url: 'https://waves.example.com/auth/discord-link?token=test-session-token',
      expiresAt: '2026-06-18T16:10:00.000Z',
    })
  })

  it('consumes a Discord link and authenticates the browser session', async () => {
    const authorized = await postJson(
      '/api/auth/discord-link/create',
      {
        discordUserId: 'discord-1',
        discordUsername: 'luis',
        discordGlobalName: 'Luis',
        guildId: 'guild-1',
      },
      { Authorization: 'Bearer internal-token' },
    )
    expect(authorized.response.status).toBe(200)

    const link = new URL((authorized.body as { url: string }).url)
    const consume = await fetch(`${context?.baseUrl}${link.pathname}${link.search}`, {
      redirect: 'manual',
    })
    expect(consume.status).toBe(302)
    expect(consume.headers.get('location')).toBe('/')

    const setCookie = consume.headers.get('set-cookie')
    expect(setCookie).toContain('waves_session=')
    if (context) context.sessionCookie = setCookie?.split(';')[0]

    const me = await request('/api/me')
    expect(me.body).toMatchObject({
      user: {
        kind: 'discord',
        displayName: 'Luis',
        discordUserId: 'discord-1',
      },
    })
  })

  it('sanitizes Spotify failures', async () => {
    context?.spotifySearch.mockRejectedValue(new SpotifyUnavailableError('search'))

    const { response, body } = await request('/api/spotify/search?q=secret')

    expect(response.status).toBe(503)
    expect(apiErrorSchema.parse(body)).toEqual(body)
    expect(JSON.stringify(body)).not.toContain('secret')
    expect(body).toMatchObject({
      statusCode: 503,
      statusMessage: 'Spotify unavailable',
      data: { code: 'SPOTIFY_UNAVAILABLE' },
    })
  })

  it('adds and lists active queue items in order', async () => {
    expect((await addTrack(firstTrack)).response.status).toBe(200)
    expect((await addTrack(secondTrack)).response.status).toBe(200)

    const { response, body } = await request('/api/queue')

    expect(response.status).toBe(200)
    expect(body).toEqual([
      expect.objectContaining({
        id: 'queue-1',
        position: 0,
        track: firstTrack,
        requestedByUserId: 'user-1',
        requestedByDisplayName: 'Luis',
        requestedByUser: { id: 'user-1', kind: 'guest', displayName: 'Luis' },
      }),
      expect.objectContaining({ id: 'queue-2', position: 1, track: secondTrack }),
    ])
  })

  it('opens realtime SSE with an initial state snapshot', async () => {
    await addTrack(firstTrack)
    const controller = new AbortController()
    const response = await fetch(`${context?.baseUrl}/api/events`, {
      signal: controller.signal,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const reader = response.body?.getReader()
    if (!reader) throw new Error('SSE response did not expose a body')
    const chunk = await reader.read()
    controller.abort()
    await reader.cancel().catch(() => undefined)
    const text = new TextDecoder().decode(chunk.value)

    expect(text).toContain('event: sync.snapshot')
    expect(text).toContain('"type":"sync.snapshot"')
    expect(text).toContain('"queue"')
  })

  it('returns terminal history and rejects malformed cursors', async () => {
    const repository = new QueueRepository(context?.connection.db)
    repository.insert({
      id: 'played',
      track: firstTrack,
      status: 'played',
      position: 0,
      createdAt: '2026-06-18T12:00:00.000Z',
      updatedAt: '2026-06-18T12:03:00.000Z',
    })
    repository.insert({
      id: 'queued',
      track: secondTrack,
      status: 'queued',
      position: 1,
      createdAt: '2026-06-18T12:00:00.000Z',
      updatedAt: '2026-06-18T12:04:00.000Z',
    })

    const history = await request('/api/history')
    expect(history.response.status).toBe(200)
    expect(historyPageSchema.parse(history.body)).toMatchObject({
      items: [{ id: 'played', status: 'played' }],
      nextCursor: null,
    })

    const invalid = await request('/api/history?cursor=first&cursor=second')
    expect(invalid.response.status).toBe(400)
    expect(invalid.body).toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid request',
      data: { code: 'VALIDATION_ERROR' },
    })
  })

  it('requires a guest session before adding a track', async () => {
    const added = await postJson('/api/queue', { track: firstTrack })

    expect(added.response.status).toBe(401)
    expect(added.body).toMatchObject({ data: { code: 'UNAUTHORIZED' } })
  })

  it('persists autoplay globally and requires a session to update it', async () => {
    const initial = await request('/api/autoplay')
    expect(initial.body).toMatchObject({ enabled: false, failureCode: null })

    const unauthorized = await request('/api/autoplay', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    expect(unauthorized.response.status).toBe(401)

    await createGuest()
    const updated = await request('/api/autoplay', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    expect(updated.response.status).toBe(200)
    expect(updated.body).toMatchObject({ enabled: true, failureCode: null })
    expect((await request('/api/autoplay')).body).toMatchObject({ enabled: true })
  })

  it('requires authentication to reject a persisted autoplay suggestion', async () => {
    const repository = new AutoplaySuggestionRepository(context?.connection.db)
    repository.replaceAll([
      {
        track: firstTrack,
        provider: 'spotify',
        generatedAt: '2026-06-18T16:00:00.000Z',
        seedFingerprint: 'seed',
      },
      {
        track: { ...secondTrack, providerTrackId: 'track-2' },
        provider: 'spotify',
        generatedAt: '2026-06-18T16:00:00.000Z',
        seedFingerprint: 'seed',
      },
    ])

    expect((await request('/api/autoplay/suggestion', { method: 'DELETE' })).response.status).toBe(
      401,
    )
    await createGuest()
    const rejected = await request('/api/autoplay/suggestion', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerTrackId: 'track-1' }),
    })
    expect(rejected.response.status).toBe(200)
    const rejectedState = autoplayStateSchema.parse(rejected.body)
    expect(rejectedState.suggestions).toHaveLength(1)
    expect(rejectedState.suggestions[0]?.track.providerTrackId).toBe('track-2')
    expect(repository.listRejected('2026-06-18T16:30:00.000Z')).toEqual(new Set(['track-1']))
  })

  it('rejects invalid and extra queue fields', async () => {
    const { response, body } = await postJson('/api/queue', {
      track: firstTrack,
      unexpected: true,
    })

    expect(response.status).toBe(400)
    expect(apiErrorSchema.parse(body)).toEqual(body)
  })

  it('rejects duplicate active tracks and restores a removed item', async () => {
    expect((await addTrack(firstTrack)).response.status).toBe(200)

    const duplicate = await addTrack(firstTrack)
    expect(duplicate.response.status).toBe(409)
    expect(duplicate.body).toMatchObject({ data: { code: 'DUPLICATE_TRACK' } })

    const removed = await request('/api/queue/queue-1', { method: 'DELETE' })
    expect(removed.response.status).toBe(200)
    const restored = await postJson('/api/queue/queue-1/restore', {})
    expect(restored.response.status).toBe(200)
    expect(restored.body).toMatchObject({
      restoredItem: { id: 'queue-1', status: 'queued', position: 0 },
      queue: [{ id: 'queue-1', status: 'queued', position: 0 }],
    })
  })

  it('inserts a track next and returns public operational status', async () => {
    await addTrack(firstTrack)
    const next = await postJson('/api/queue', { track: secondTrack, placement: 'next' })
    expect(next.response.status).toBe(200)

    const queue = await request('/api/queue')
    expect((queue.body as Array<{ id: string }>).map(({ id }) => id)).toEqual([
      'queue-2',
      'queue-1',
    ])

    const status = await request('/api/status')
    expect(status.response.status).toBe(200)
    expect(status.body).toMatchObject({
      web: { status: 'available' },
      bot: { status: 'offline' },
      voice: { status: 'disconnected' },
    })
  })

  it('moves and removes queue items through HTTP', async () => {
    await addTrack(firstTrack)
    await addTrack(secondTrack)

    const moved = await postJson('/api/queue/queue-2/move', { newPosition: 0 })
    expect(moved.response.status).toBe(200)
    expect(moved.body).toEqual([
      expect.objectContaining({ id: 'queue-2', position: 0 }),
      expect.objectContaining({ id: 'queue-1', position: 1 }),
    ])

    const removed = await request('/api/queue/queue-2', { method: 'DELETE' })
    expect(removed.response.status).toBe(200)
    expect(removed.body).toMatchObject({
      queue: [expect.objectContaining({ id: 'queue-1', position: 0 })],
      removal: { queueItemId: 'queue-2', expiresAt: '2026-06-18T16:00:10.000Z' },
    })
  })

  it('returns contract errors for missing items and invalid moves', async () => {
    const missingMove = await postJson('/api/queue/missing/move', { newPosition: 0 })
    const missingDelete = await request('/api/queue/missing', { method: 'DELETE' })
    const invalidMove = await postJson('/api/queue/missing/move', { newPosition: -1 })

    expect(missingMove.response.status).toBe(404)
    expect(missingDelete.response.status).toBe(404)
    expect(invalidMove.response.status).toBe(400)

    for (const body of [missingMove.body, missingDelete.body, invalidMove.body]) {
      expect(apiErrorSchema.parse(body)).toEqual(body)
    }
  })

  it('creates idle player state and performs a consistent logical skip', async () => {
    const initial = await request('/api/player')
    expect(initial.response.status).toBe(200)
    expect(initial.body).toMatchObject({
      status: 'idle',
      updatedAt: '2026-06-18T16:00:00.000Z',
    })

    await addTrack(firstTrack)
    await addTrack(secondTrack)

    const skipped = await postJson('/api/player/skip', {})
    expect(skipped.response.status).toBe(200)
    expect(skipped.body).toMatchObject({
      player: {
        status: 'playing',
        currentQueueItemId: 'queue-2',
        updatedAt: '2026-06-18T16:00:00.000Z',
      },
      queue: [
        expect.objectContaining({
          id: 'queue-2',
          position: 0,
          status: 'playing',
        }),
      ],
    })

    const queue = await request('/api/queue')
    expect(queue.body).toEqual([
      expect.objectContaining({
        id: 'queue-2',
        position: 0,
        status: 'playing',
      }),
    ])
  })

  it('returns current Discord connection names without exposing name fallbacks from IDs', async () => {
    context?.dependencies.playerStateService.voiceConnected(
      'guild-1',
      'Waves',
      'voice-1',
      'ondas-da-noite',
    )

    const connected = await request('/api/player')
    expect(connected.response.status).toBe(200)
    expect(connected.body).toMatchObject({
      guildId: 'guild-1',
      guildName: 'Waves',
      voiceChannelId: 'voice-1',
      voiceChannelName: 'ondas-da-noite',
    })
  })
})
