import { describe, expect, it } from 'vitest'

import { SpotifyConfigurationError } from '../../server/clients/spotify.errors'
import { parseSpotifyConfig } from '../../server/utils/spotify-config'

describe('parseSpotifyConfig', () => {
  it('accepts valid Spotify credentials', () => {
    expect(
      parseSpotifyConfig({
        SPOTIFY_CLIENT_ID: 'client-id',
        SPOTIFY_CLIENT_SECRET: 'client-secret',
      }),
    ).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
    })
  })

  it('rejects absent or empty credentials without exposing values', () => {
    let error: unknown

    try {
      parseSpotifyConfig({
        SPOTIFY_CLIENT_ID: '',
        SPOTIFY_CLIENT_SECRET: 'sensitive-secret',
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(SpotifyConfigurationError)
    expect(String(error)).toContain('SPOTIFY_CLIENT_ID')
    expect(String(error)).not.toContain('sensitive-secret')
  })
})
