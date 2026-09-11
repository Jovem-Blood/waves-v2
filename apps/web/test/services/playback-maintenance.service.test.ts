import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, describe, expect, it } from 'vitest'
import type { QueueItem } from '@waves/shared'
import { createDatabaseConnection, type DatabaseConnection } from '../../server/db/client'
import { DatabaseUnitOfWork } from '../../server/repositories/unit-of-work'
import { PlaybackMaintenanceService } from '../../server/services/playback/maintenance.service'

const connections: DatabaseConnection[] = []
const startedAt = '2026-09-01T10:00:00.000Z'
const now = () => new Date('2026-09-01T10:03:00.000Z')
afterEach(() => {
  for (const c of connections.splice(0)) c.close()
})
function setup() {
  const connection = createDatabaseConnection({ url: ':memory:' })
  connections.push(connection)
  migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  const uow = new DatabaseUnitOfWork(connection.db, now)
  const item: QueueItem = {
    id: 'q',
    track: {
      id: 't',
      provider: 'spotify',
      providerTrackId: 't',
      title: 'Track',
      artists: ['A'],
      durationMs: 180_000,
    },
    status: 'playing',
    position: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  }
  uow.run(({ queue, playerState, playbackAttempt }) => {
    queue.insert(item)
    playerState.update({ status: 'paused', currentQueueItemId: item.id })
    playbackAttempt.start({
      playbackAttemptId: 'logical',
      attemptNumber: 1,
      queueItem: item,
      startedAt,
    })
  })
  return { uow, item, service: new PlaybackMaintenanceService(uow, now) }
}
describe('playback maintenance', () => {
  it('reconciles a crashed bot once and releases the queue item', () => {
    const { service, uow } = setup()
    expect(service.reconcile()).toBe(1)
    expect(service.reconcile()).toBe(0)
    expect(uow.run(({ playbackAttempt }) => playbackAttempt.find('logical', 1))).toMatchObject({
      terminal: true,
      errorCode: 'PLAYBACK_ORPHANED',
    })
    expect(uow.run(({ queue }) => queue.findById('q'))?.status).toBe('queued')
  })
  it('keeps paused/resolving attempts alive through heartbeat leases', () => {
    const { service, uow } = setup()
    expect(
      service.reconcile({ occurredAt: now().toISOString(), activePlaybackAttemptIds: ['logical'] }),
    ).toBe(0)
    expect(service.reconcile()).toBe(0)
    expect(uow.run(({ playbackAttempt }) => playbackAttempt.find('logical', 1))?.terminal).toBe(
      false,
    )
  })
  it('classifies pre-start attempts as bot restarts', () => {
    const { service, uow } = setup()
    service.reconcile({
      occurredAt: now().toISOString(),
      startedAt: '2026-09-01T10:02:00.000Z',
      activePlaybackAttemptIds: [],
    })
    expect(uow.run(({ playbackAttempt }) => playbackAttempt.find('logical', 1))?.errorCode).toBe(
      'BOT_RESTARTED',
    )
  })
  it('does not terminalize the failed physical retry of a completed logical execution', () => {
    const { service, uow, item } = setup()
    uow.run(({ playbackAttempt }) => {
      playbackAttempt.report(
        {
          queueItemId: item.id,
          playbackAttemptId: 'logical',
          attempt: 1,
          outcome: 'failed',
          terminal: false,
        },
        item,
        startedAt,
      )
      playbackAttempt.report(
        {
          queueItemId: item.id,
          playbackAttemptId: 'logical',
          attempt: 2,
          outcome: 'played',
          terminal: true,
        },
        item,
        startedAt,
      )
    })
    expect(service.reconcile()).toBe(0)
  })
  it('keeps intentional removals out of operational failures', () => {
    const { service, uow } = setup()
    uow.run(({ queue }) =>
      queue.updateStatusAndPosition('q', { status: 'removed', position: 0, updatedAt: startedAt }),
    )
    service.reconcile()
    expect(uow.run(({ playbackAttempt }) => playbackAttempt.find('logical', 1))).toMatchObject({
      outcome: 'cancelled',
      failureClass: 'intentional',
    })
  })
})
