import { z } from 'zod'

import { playerStateSchema } from './player.schema.js'
import { queueItemSchema, queueSchema } from './queue.schema.js'

export const playbackOutcomeSchema = z.enum(['played', 'failed'])

export const playbackAttemptOutcomeSchema = z.enum([
  'pending',
  'played',
  'failed',
  'cancelled',
  'skipped',
])

export const playbackFailureStageSchema = z.enum([
  'claim',
  'resolve',
  'transport',
  'demux',
  'resource',
  'player',
  'sync',
])

export const playbackFailureClassSchema = z.enum(['operational', 'intentional', 'sync', 'internal'])

const playbackDiagnosticFields = {
  playbackAttemptId: z.string().trim().min(1).optional(),
  retryCount: z.number().int().nonnegative().optional(),
  attempt: z.number().int().positive().optional(),
  trackId: z.string().trim().min(1).optional(),
  trackTitle: z.string().trim().min(1).optional(),
  trackArtists: z.string().trim().min(1).optional(),
  trackProvider: z.string().trim().min(1).optional(),
  sourceProvider: z.string().trim().min(1).optional(),
  sourceIdentifier: z.string().trim().min(1).optional(),
  failureStage: playbackFailureStageSchema.optional(),
  failureClass: playbackFailureClassSchema.optional(),
  errorCode: z.string().trim().min(1).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  playbackDurationMs: z.number().int().nonnegative().optional(),
}

export const playbackAttemptReportSchema = z
  .object({
    ...playbackDiagnosticFields,
    queueItemId: z.string().trim().min(1),
    playbackAttemptId: z.string().trim().min(1),
    attempt: z.number().int().positive(),
    outcome: playbackAttemptOutcomeSchema,
    terminal: z.boolean(),
  })
  .strict()

export const playbackClaimInputSchema = z
  .object({
    playbackAttemptId: z.string().trim().min(1).optional(),
  })
  .strict()

export const completePlaybackInputSchema = z
  .object({
    queueItemId: z.string().trim().min(1),
    outcome: playbackOutcomeSchema,
    nextPlaybackAttemptId: z.string().trim().min(1).optional(),
    ...playbackDiagnosticFields,
  })
  .strict()

export const playbackClaimResultSchema = z
  .object({
    player: playerStateSchema,
    item: queueItemSchema.optional(),
    playbackAttemptId: z.string().trim().min(1).optional(),
    attempt: z.number().int().positive().optional(),
  })
  .strict()

export const playbackTransitionResultSchema = z
  .object({
    completedQueueItemId: z.string().trim().min(1),
    player: playerStateSchema,
    queue: queueSchema,
    nextItem: queueItemSchema.optional(),
    nextPlaybackAttemptId: z.string().trim().min(1).optional(),
  })
  .strict()
