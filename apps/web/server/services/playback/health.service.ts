import {
  playbackHealthResponseSchema,
  type PlaybackHealthQuery,
  type PlaybackHealthResponse,
} from '@waves/shared'

import type {
  PlaybackAttemptRecord,
  PlaybackAttemptRepository,
} from '../../repositories/playback-attempt.repository'
import { PLAYBACK_RETENTION_DAYS, PLAYBACK_STALE_AFTER_MS } from './maintenance.service'

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

function percentiles(values: Array<number | null>) {
  const samples = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  return {
    samples: samples.length,
    p50: samples.length >= 5 ? samples[Math.ceil(samples.length * 0.5) - 1] : null,
    p95: samples.length >= 20 ? samples[Math.ceil(samples.length * 0.95) - 1] : null,
  }
}

function recovered(execution: LogicalPlayback): boolean {
  return (
    execution.final.terminal &&
    execution.final.outcome === 'played' &&
    execution.attempts.some((attempt) => attempt.outcome === 'failed')
  )
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
    const executions = groupByPlaybackAttempt(records).filter(({ final, attempts }) => {
      if (query.sourceProvider && final.sourceProvider !== query.sourceProvider) return false
      if (
        query.errorCode &&
        (query.errorScope === 'encountered'
          ? !attempts.some((attempt) => attempt.errorCode === query.errorCode)
          : !final.terminal || final.errorCode !== query.errorCode)
      )
        return false
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
    const providers = new Map<
      string,
      {
        executions: number
        successes: number
        failures: number
        recoveredRetries: number
        lastOccurrence: string
      }
    >()
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
      track.executions +=
        final.terminal && (final.outcome === 'played' || final.outcome === 'failed') ? 1 : 0
      track.failures += final.terminal && final.outcome === 'failed' ? 1 : 0
      track.retries += Math.max(0, attempts.length - 1)
      if (
        final.terminal &&
        final.outcome === 'failed' &&
        (track.failures === 1 || lastOccurrence(final) >= track.lastOccurrence)
      ) {
        track.lastOccurrence = lastOccurrence(final)
        track.playbackAttemptId = final.playbackAttemptId
      }
      if (final.terminal && final.outcome === 'failed' && final.errorCode)
        increment(track.errors, final.errorCode)
      tracks.set(trackKey, track)

      if (final.sourceProvider) {
        const entry = providers.get(final.sourceProvider) ?? {
          executions: 0,
          successes: 0,
          failures: 0,
          recoveredRetries: 0,
          lastOccurrence: lastOccurrence(final),
        }
        if (final.terminal && (final.outcome === 'played' || final.outcome === 'failed'))
          entry.executions++
        if (final.terminal && final.outcome === 'played') entry.successes++
        if (final.terminal && final.outcome === 'failed') entry.failures++
        if (recovered(execution)) entry.recoveredRetries++
        if (lastOccurrence(final) > entry.lastOccurrence)
          entry.lastOccurrence = lastOccurrence(final)
        providers.set(final.sourceProvider, entry)
      }

      if (final.terminal && final.outcome === 'failed') {
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
        failureStage: final.failureStage,
        failureClass: final.failureClass,
        httpStatus: final.httpStatus,
        resolutionDurationMs: final.resolutionDurationMs,
        fetchLatencyMs: final.fetchLatencyMs,
        timeToFirstAudioMs: final.timeToFirstAudioMs,
        playbackDurationMs: final.playbackDurationMs,
        expectedDurationMs: final.expectedDurationMs,
        progressAtFailureMs: final.progressAtFailureMs,
        occurredAt: lastOccurrence(final),
      }))

    return playbackHealthResponseSchema.parse({
      period: { from: fromIso, to: toIso },
      availableProviders: [
        ...new Set(
          records.flatMap((record) => (record.sourceProvider ? [record.sourceProvider] : [])),
        ),
      ].sort(),
      availableErrorCodes: [
        ...new Set(
          records.flatMap((record) =>
            record.terminal && record.errorCode ? [record.errorCode] : [],
          ),
        ),
      ].sort(),
      dataCompleteness: {
        truncated: false,
        retentionDays: PLAYBACK_RETENTION_DAYS,
        retentionMayApply:
          from.getTime() < this.now().getTime() - PLAYBACK_RETENTION_DAYS * 86_400_000,
        incompleteExecutions: executions.filter(({ final }) => !final.terminal).length,
        telemetryFailures: executions.filter(({ final }) =>
          [
            'PLAYBACK_TELEMETRY_FAILED',
            'PLAYBACK_SYNC_FAILED',
            'PLAYBACK_ORPHANED',
            'BOT_RESTARTED',
          ].includes(final.errorCode ?? ''),
        ).length,
        diagnosticCode: executions.some(({ final }) =>
          [
            'PLAYBACK_TELEMETRY_FAILED',
            'PLAYBACK_SYNC_FAILED',
            'PLAYBACK_ORPHANED',
            'BOT_RESTARTED',
          ].includes(final.errorCode ?? ''),
        )
          ? 'PLAYBACK_TELEMETRY_FAILED'
          : null,
      },
      latency: {
        resolution: percentiles(
          executions.flatMap(({ attempts }) =>
            attempts.map((attempt) => attempt.resolutionDurationMs),
          ),
        ),
        fetch: percentiles(
          executions.flatMap(({ attempts }) => attempts.map((attempt) => attempt.fetchLatencyMs)),
        ),
        firstAudio: percentiles(
          executions.flatMap(({ attempts }) =>
            attempts.map((attempt) => attempt.timeToFirstAudioMs),
          ),
        ),
      },
      summary: {
        plays: plays.length,
        successes: successes.length,
        failures: failures.length,
        cancelled: cancelled.length,
        recoveredRetries: executions.filter(recovered).length,
        retries: executions.reduce(
          (total, execution) => total + Math.max(0, execution.attempts.length - 1),
          0,
        ),
        successRate: plays.length === 0 ? 0 : successes.length / plays.length,
        incomplete: executions.filter(({ final }) => !final.terminal).length,
        stale: executions.filter(
          ({ final }) =>
            !final.terminal &&
            new Date(final.updatedAt).getTime() < this.now().getTime() - PLAYBACK_STALE_AFTER_MS,
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
        .map(([sourceProvider, value]) => ({
          sourceProvider,
          ...value,
          failureRate: value.executions ? value.failures / value.executions : 0,
        })),
      problematicTracks,
      recentFailures,
    })
  }
}
