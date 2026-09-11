import {
  playbackHealthResponseSchema,
  type PlaybackHealthQuery,
  type PlaybackHealthResponse,
} from '@waves/shared'

import type {
  PlaybackAttemptRecord,
  PlaybackAttemptRepository,
} from '../../repositories/playback-attempt.repository'

interface LogicalPlayback {
  attempts: PlaybackAttemptRecord[]
  final: PlaybackAttemptRecord
}

function lastOccurrence(record: PlaybackAttemptRecord): string {
  return record.finishedAt ?? record.updatedAt
}

function groupByPlaybackAttempt(records: PlaybackAttemptRecord[]): LogicalPlayback[] {
  const groups = new Map<string, PlaybackAttemptRecord[]>()
  for (const record of records) {
    const group = groups.get(record.playbackAttemptId) ?? []
    group.push(record)
    groups.set(record.playbackAttemptId, group)
  }

  return [...groups.values()].map((attempts) => {
    attempts.sort((left, right) => left.attemptNumber - right.attemptNumber)
    return { attempts, final: attempts.find((attempt) => attempt.terminal) ?? attempts.at(-1)! }
  })
}

function increment(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

export class PlaybackHealthService {
  constructor(
    private readonly repository: PlaybackAttemptRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly reconcile: () => void = () => {},
  ) {}

  get(query: PlaybackHealthQuery = {}): PlaybackHealthResponse {
    this.reconcile()
    const to = query.to ? new Date(query.to) : this.now()
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fromIso = from.toISOString()
    const toIso = to.toISOString()
    const records = this.repository.listSince(fromIso, toIso)
    const executions = groupByPlaybackAttempt(records).filter(({ final }) => {
      if (query.sourceProvider && final.sourceProvider !== query.sourceProvider) return false
      if (query.errorCode && final.errorCode !== query.errorCode) return false
      return true
    })
    const plays = executions.filter(
      ({ final }) => final.terminal && (final.outcome === 'played' || final.outcome === 'failed'),
    )
    const successes = plays.filter(({ final }) => final.outcome === 'played')
    const failures = plays.filter(({ final }) => final.outcome === 'failed')
    const cancelled = executions.filter(
      ({ final }) => final.outcome === 'cancelled' || final.outcome === 'skipped',
    )

    const errors = new Map<string, { failures: number; lastOccurrence: string }>()
    const providers = new Map<string, { failures: number; lastOccurrence: string }>()
    const tracks = new Map<
      string,
      {
        track: PlaybackAttemptRecord
        executions: number
        failures: number
        retries: number
        errors: Map<string, number>
        lastOccurrence: string
        playbackAttemptId: string
      }
    >()

    for (const execution of executions) {
      const { final, attempts } = execution
      const trackKey = `${final.trackProvider}:${final.providerTrackId}`
      const track = tracks.get(trackKey) ?? {
        track: final,
        executions: 0,
        failures: 0,
        retries: 0,
        errors: new Map<string, number>(),
        lastOccurrence: lastOccurrence(final),
        playbackAttemptId: final.playbackAttemptId,
      }
      track.executions += final.outcome === 'played' || final.outcome === 'failed' ? 1 : 0
      track.failures += final.outcome === 'failed' ? 1 : 0
      track.retries += Math.max(0, attempts.length - 1)
      if (lastOccurrence(final) > track.lastOccurrence) track.lastOccurrence = lastOccurrence(final)
      track.playbackAttemptId = final.playbackAttemptId
      for (const attempt of attempts) {
        if (attempt.outcome === 'failed' && attempt.errorCode)
          increment(track.errors, attempt.errorCode)
      }
      tracks.set(trackKey, track)

      if (final.outcome === 'failed') {
        if (final.errorCode) {
          const entry = errors.get(final.errorCode) ?? {
            failures: 0,
            lastOccurrence: lastOccurrence(final),
          }
          entry.failures += 1
          if (lastOccurrence(final) > entry.lastOccurrence)
            entry.lastOccurrence = lastOccurrence(final)
          errors.set(final.errorCode, entry)
        }
        if (final.sourceProvider) {
          const entry = providers.get(final.sourceProvider) ?? {
            failures: 0,
            lastOccurrence: lastOccurrence(final),
          }
          entry.failures += 1
          if (lastOccurrence(final) > entry.lastOccurrence)
            entry.lastOccurrence = lastOccurrence(final)
          providers.set(final.sourceProvider, entry)
        }
      }
    }

    const problematicTracks = [...tracks.values()]
      .filter((track) => track.failures > 0)
      .sort(
        (left, right) =>
          right.failures - left.failures || right.lastOccurrence.localeCompare(left.lastOccurrence),
      )
      .slice(0, 50)
      .map((track) => ({
        trackId: track.track.trackId,
        trackTitle: track.track.trackTitle,
        trackArtists: track.track.trackArtists.join(', '),
        trackProvider: track.track.trackProvider,
        executions: track.executions,
        failures: track.failures,
        failureRate: track.executions === 0 ? 0 : track.failures / track.executions,
        retries: track.retries,
        primaryErrorCode:
          [...track.errors.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null,
        lastOccurrence: track.lastOccurrence,
        playbackAttemptId: track.playbackAttemptId,
      }))

    const recentFailures = failures
      .sort((left, right) => lastOccurrence(right.final).localeCompare(lastOccurrence(left.final)))
      .slice(0, 30)
      .map(({ final }) => ({
        playbackAttemptId: final.playbackAttemptId,
        queueItemId: final.queueItemId,
        trackTitle: final.trackTitle,
        trackArtists: final.trackArtists.join(', '),
        sourceProvider: final.sourceProvider,
        errorCode: final.errorCode,
        occurredAt: lastOccurrence(final),
      }))

    return playbackHealthResponseSchema.parse({
      period: { from: fromIso, to: toIso },
      summary: {
        plays: plays.length,
        successes: successes.length,
        failures: failures.length,
        cancelled: cancelled.length,
        retries: executions.reduce(
          (total, execution) => total + Math.max(0, execution.attempts.length - 1),
          0,
        ),
        successRate: plays.length === 0 ? 0 : successes.length / plays.length,
        incomplete: executions.filter(({ final }) => !final.terminal).length,
        stale: executions.filter(
          ({ final }) =>
            !final.terminal && new Date(final.updatedAt).getTime() < this.now().getTime() - 120_000,
        ).length,
        orphaned: executions.filter(({ final }) =>
          ['PLAYBACK_ORPHANED', 'BOT_RESTARTED'].includes(final.errorCode ?? ''),
        ).length,
        denominator: 'terminal_played_or_failed',
      },
      topErrors: [...errors.entries()]
        .sort((left, right) => right[1].failures - left[1].failures)
        .slice(0, 20)
        .map(([errorCode, value]) => ({ errorCode, ...value })),
      providers: [...providers.entries()]
        .sort((left, right) => right[1].failures - left[1].failures)
        .map(([sourceProvider, value]) => ({ sourceProvider, ...value })),
      problematicTracks,
      recentFailures,
    })
  }
}
