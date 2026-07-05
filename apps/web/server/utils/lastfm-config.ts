import { z } from 'zod'

import { LastFmConfigurationError } from '../clients/lastfm.errors'

const lastFmConfigSchema = z.object({ apiKey: z.string().trim().min(1) }).strict()

export interface LastFmConfig {
  apiKey: string
}

export function parseLastFmConfig(
  environment: Record<string, string | undefined> = process.env,
): LastFmConfig {
  const result = lastFmConfigSchema.safeParse({ apiKey: environment.LASTFM_API_KEY })
  if (!result.success) throw new LastFmConfigurationError()
  return result.data
}
