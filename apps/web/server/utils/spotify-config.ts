import { z } from 'zod'

import { SpotifyConfigurationError } from '../clients/spotify.errors'

const spotifyConfigSchema = z.strictObject({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
})

export interface SpotifyConfig {
  clientId: string
  clientSecret: string
}

export function parseSpotifyConfig(
  environment: Record<string, string | undefined> = process.env,
): SpotifyConfig {
  const result = spotifyConfigSchema.safeParse({
    clientId: environment.SPOTIFY_CLIENT_ID,
    clientSecret: environment.SPOTIFY_CLIENT_SECRET,
  })

  if (!result.success) {
    const missingVariables = result.error.issues
      .map((issue) => issue.path[0])
      .map((field) => (field === 'clientId' ? 'SPOTIFY_CLIENT_ID' : 'SPOTIFY_CLIENT_SECRET'))

    throw new SpotifyConfigurationError([...new Set(missingVariables)])
  }

  return result.data
}
