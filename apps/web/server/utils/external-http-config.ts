import { z } from 'zod'

const externalHttpTimeoutSchema = z.coerce.number().int().min(1_000).max(60_000)

export class ExternalHttpConfigurationError extends Error {
  constructor() {
    super('Invalid external HTTP configuration: EXTERNAL_HTTP_TIMEOUT_MS')
    this.name = 'ExternalHttpConfigurationError'
  }
}

export function parseExternalHttpTimeout(
  environment: Record<string, string | undefined> = process.env,
): number {
  const result = externalHttpTimeoutSchema.safeParse(environment.EXTERNAL_HTTP_TIMEOUT_MS ?? 10_000)
  if (!result.success) {
    throw new ExternalHttpConfigurationError()
  }
  return result.data
}
