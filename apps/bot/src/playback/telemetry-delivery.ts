import { setTimeout as delay } from 'node:timers/promises'

import type { BotLogger } from '../logger.js'
import { classifyPlaybackError } from '../observability.js'

/** Delivery retries reuse the caller's logical identity and never log raw errors. */
export async function deliverPlayback<T>(
  operation: string,
  identity: { playbackAttemptId: string; attempt: number; queueItemId: string },
  send: () => Promise<T>,
  logger: BotLogger,
  sleep: (ms: number) => Promise<unknown> = delay,
): Promise<T> {
  for (let delivery = 1; ; delivery += 1) {
    try {
      return await send()
    } catch (error) {
      const classified = classifyPlaybackError(error)
      const retryable =
        classified.httpStatus === undefined ||
        classified.httpStatus >= 500 ||
        classified.httpStatus === 408 ||
        classified.httpStatus === 429
      const exhausted = delivery >= 3 || !retryable
      logger.error(
        {
          operation,
          ...identity,
          delivery,
          ...classified,
          outcome: exhausted ? 'delivery_exhausted' : 'delivery_retry',
          diagnosticCode: 'PLAYBACK_TELEMETRY_FAILED',
        },
        'Playback delivery failed',
      )
      if (exhausted) throw error
      await sleep(250 * 2 ** (delivery - 1))
    }
  }
}
