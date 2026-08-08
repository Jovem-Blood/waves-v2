import type { BotLogger } from '../logger.js'

export interface BestEffortResult {
  ok: boolean
  failure?: unknown
}

export async function runBestEffort(
  operation: string,
  logger: BotLogger | undefined,
  bindings: Record<string, unknown>,
  action: () => Promise<void>,
): Promise<BestEffortResult> {
  try {
    await action()
    return { ok: true }
  } catch (error) {
    logger?.warn(
      {
        operation,
        ...bindings,
        outcome: 'failed',
        err: error,
      },
      'Best-effort operation failed',
    )
    return { ok: false, failure: error }
  }
}
