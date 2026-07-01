import { z } from 'zod'

const publicAppConfigSchema = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
})

export interface PublicAppConfig {
  url: string
}

export class PublicAppConfigurationError extends Error {
  readonly code = 'PUBLIC_APP_CONFIGURATION_ERROR'

  constructor() {
    super('Invalid public app configuration: PUBLIC_APP_URL')
    this.name = 'PublicAppConfigurationError'
  }
}

export function parsePublicAppConfig(
  environment: Record<string, string | undefined> = process.env,
): PublicAppConfig {
  const result = publicAppConfigSchema.safeParse({
    url: environment.PUBLIC_APP_URL ?? environment.APP_HOSTNAME,
  })

  if (!result.success) {
    throw new PublicAppConfigurationError()
  }

  return result.data
}
