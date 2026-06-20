import { AudiusInvalidResponseError, AudiusUnavailableError } from './audius.errors'
import { audiusSearchResponseSchema, type AudiusTrack } from './audius.schemas'

const DEFAULT_API_URL = 'https://api.audius.co/v1'

export type AudiusFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface AudiusClientOptions {
  apiUrl?: string
  appName?: string
  timeoutMs?: number
}

export interface AudiusClientPort {
  searchTracks(query: string, limit?: number): Promise<AudiusTrack[]>
}

export class AudiusClient implements AudiusClientPort {
  private readonly apiUrl: string
  private readonly appName: string
  private readonly timeoutMs: number

  constructor(
    private readonly request: AudiusFetch = fetch,
    options: AudiusClientOptions = {},
  ) {
    this.apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, '')
    this.appName = options.appName ?? 'Waves'
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  async searchTracks(query: string, limit = 10): Promise<AudiusTrack[]> {
    const url = new URL(`${this.apiUrl}/tracks/search`)
    url.searchParams.set('query', query)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('app_name', this.appName)
    let response: Response

    try {
      response = await this.request(url, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new AudiusUnavailableError()
    }

    if (!response.ok) {
      throw new AudiusUnavailableError()
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new AudiusInvalidResponseError()
    }

    const result = audiusSearchResponseSchema.safeParse(body)
    if (!result.success) {
      throw new AudiusInvalidResponseError()
    }

    return result.data.data
  }
}
