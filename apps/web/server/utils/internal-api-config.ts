import { z } from 'zod'

const internalApiConfigSchema = z.strictObject({
  token: z.string().trim().min(1),
})

export interface InternalApiConfig {
  token: string
}

export class InternalApiConfigurationError extends Error {
  readonly code = 'INTERNAL_API_CONFIGURATION_ERROR'

  constructor() {
    super('Invalid internal API configuration: INTERNAL_API_TOKEN')
    this.name = 'InternalApiConfigurationError'
  }
}

export function parseInternalApiConfig(
  environment: Record<string, string | undefined> = process.env,
): InternalApiConfig {
  const result = internalApiConfigSchema.safeParse({
    token: environment.INTERNAL_API_TOKEN,
  })

  if (!result.success) {
    throw new InternalApiConfigurationError()
  }

  return result.data
}
