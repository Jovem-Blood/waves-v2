import { z } from 'zod'

const playbackHealthTrackSchema = z
  .object({
    trackId: z.string(),
    trackTitle: z.string(),
    trackArtists: z.string(),
    trackProvider: z.string(),
    executions: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    failureRate: z.number().min(0).max(1),
    retries: z.number().int().nonnegative(),
    primaryErrorCode: z.string().nullable(),
    lastOccurrence: z.string(),
    playbackAttemptId: z.string().nullable(),
  })
  .strict()

export const playbackHealthQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    sourceProvider: z.string().trim().min(1).optional(),
    errorCode: z.string().trim().min(1).optional(),
    errorScope: z.enum(['terminal', 'encountered']).optional(),
  })
  .strict()
  .refine((query) => !query.from || !query.to || new Date(query.from) < new Date(query.to), {
    message: 'from must precede to',
  })

const latencySchema = z
  .object({
    samples: z.number().int().nonnegative(),
    p50: z.number().nonnegative().nullable(),
    p95: z.number().nonnegative().nullable(),
  })
  .strict()

export const playbackHealthResponseSchema = z
  .object({
    period: z
      .object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
      })
      .strict(),
    summary: z
      .object({
        plays: z.number().int().nonnegative(),
        successes: z.number().int().nonnegative(),
        failures: z.number().int().nonnegative(),
        cancelled: z.number().int().nonnegative(),
        retries: z.number().int().nonnegative(),
        recoveredRetries: z.number().int().nonnegative().default(0),
        successRate: z.number().min(0).max(1),
        incomplete: z.number().int().nonnegative().default(0),
        stale: z.number().int().nonnegative().default(0),
        orphaned: z.number().int().nonnegative().default(0),
        denominator: z.literal('terminal_played_or_failed').default('terminal_played_or_failed'),
      })
      .strict(),
    topErrors: z.array(
      z
        .object({
          errorCode: z.string(),
          failures: z.number().int().nonnegative(),
          lastOccurrence: z.string(),
        })
        .strict(),
    ),
    providers: z.array(
      z
        .object({
          sourceProvider: z.string(),
          executions: z.number().int().nonnegative().default(0),
          successes: z.number().int().nonnegative().default(0),
          recoveredRetries: z.number().int().nonnegative().default(0),
          failureRate: z.number().min(0).max(1).default(0),
          failures: z.number().int().nonnegative(),
          lastOccurrence: z.string(),
        })
        .strict(),
    ),
    problematicTracks: z.array(playbackHealthTrackSchema),
    availableProviders: z.array(z.string()).optional(),
    availableErrorCodes: z.array(z.string()).optional(),
    dataCompleteness: z
      .object({
        truncated: z.boolean(),
        retentionDays: z.number().int().positive(),
        retentionMayApply: z.boolean(),
        incompleteExecutions: z.number().int().nonnegative(),
        telemetryFailures: z.number().int().nonnegative(),
        diagnosticCode: z.literal('PLAYBACK_TELEMETRY_FAILED').nullable(),
      })
      .strict()
      .optional(),
    latency: z
      .object({ resolution: latencySchema, fetch: latencySchema, firstAudio: latencySchema })
      .strict()
      .optional(),
    recentFailures: z.array(
      z
        .object({
          playbackAttemptId: z.string(),
          queueItemId: z.string(),
          failureStage: z.string().nullable().default(null),
          failureClass: z.string().nullable().default(null),
          httpStatus: z.number().int().nullable().default(null),
          resolutionDurationMs: z.number().nullable().default(null),
          fetchLatencyMs: z.number().nullable().default(null),
          timeToFirstAudioMs: z.number().nullable().default(null),
          playbackDurationMs: z.number().nullable().default(null),
          expectedDurationMs: z.number().nullable().default(null),
          progressAtFailureMs: z.number().nullable().default(null),
          trackTitle: z.string(),
          trackArtists: z.string(),
          sourceProvider: z.string().nullable(),
          errorCode: z.string().nullable(),
          occurredAt: z.string(),
        })
        .strict(),
    ),
  })
  .strict()
