import type { WavesLogger } from './logger'

export function classifyExternalError(error: unknown): {
  errorCode: string
  httpStatus?: number
} {
  if (typeof error === 'object' && error !== null) {
    const errorCode =
      'code' in error && typeof error.code === 'string'
        ? error.code
        : error instanceof Error
          ? error.name
          : 'UNKNOWN'
    const httpStatus =
      'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : undefined
    return { errorCode, ...(httpStatus === undefined ? {} : { httpStatus }) }
  }
  return { errorCode: 'UNKNOWN' }
}

export async function loggedOperation<T>(
  logger: WavesLogger,
  bindings: Record<string, unknown>,
  operation: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now()
  logger.info({ ...bindings, outcome: 'started' }, 'Internal operation started')
  try {
    const result = await operation()
    logger.info(
      { ...bindings, outcome: 'completed', durationMs: Date.now() - startedAt },
      'Internal operation completed',
    )
    return result
  } catch (error) {
    logger.error(
      {
        ...bindings,
        outcome: 'failed',
        durationMs: Date.now() - startedAt,
        ...classifyExternalError(error),
      },
      'Internal operation failed',
    )
    throw error
  }
}
