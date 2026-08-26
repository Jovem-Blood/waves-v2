import { BotGuardClient, getChallenge } from 'bgutils-js/botguard'
import type { WebPoSignalOutput } from 'bgutils-js/shared-types'
import { buildURL, getHeaders, USER_AGENT } from 'bgutils-js/utils'
import { WebPoMinter } from 'bgutils-js/webpo'
import { JSDOM } from 'jsdom'
import { z } from 'zod'

const BOTGUARD_REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo'
const DEFAULT_ATTESTATION_TTL_MS = 60 * 60_000
const REFRESH_MARGIN_MS = 5 * 60_000

const integrityTokenResponseSchema = z.tuple([
  z.string().min(1),
  z.number().positive().optional(),
  z.number().optional(),
  z.string().optional(),
])

export interface YouTubePoTokens {
  contentToken: string
  generation: number
}

interface AttestationSession {
  expiresAt: number
  mintContentToken(videoId: string): Promise<string>
  dispose(): Promise<void>
}

export type CreateAttestationSession = () => Promise<AttestationSession>

export class YouTubePoTokenProvider {
  private session: AttestationSession | undefined
  private pendingSession: Promise<AttestationSession> | undefined
  private generation = 0

  constructor(
    private readonly now: () => number = Date.now,
    private readonly createSession: CreateAttestationSession = createAttestationSession,
  ) {}

  async getTokens(videoId: string): Promise<YouTubePoTokens> {
    const session = await this.getSession()
    return {
      contentToken: await session.mintContentToken(videoId),
      generation: this.generation,
    }
  }

  private async getSession(): Promise<AttestationSession> {
    if (this.session && this.now() < this.session.expiresAt - REFRESH_MARGIN_MS) {
      return this.session
    }

    this.pendingSession ??= this.refreshSession()
    return this.pendingSession
  }

  private async refreshSession(): Promise<AttestationSession> {
    const previous = this.session
    this.session = undefined
    await Promise.resolve(previous?.dispose()).catch(() => undefined)
    try {
      const next = await this.createSession()
      this.session = next
      this.generation += 1
      return next
    } finally {
      this.pendingSession = undefined
    }
  }
}

async function createAttestationSession(): Promise<AttestationSession> {
  const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
  })
  const previousWindow = Reflect.get(globalThis, 'window')
  const previousDocument = Reflect.get(globalThis, 'document')
  const previousLocation = Reflect.get(globalThis, 'location')
  const previousOrigin = Reflect.get(globalThis, 'origin')
  const hadNavigator = Reflect.has(globalThis, 'navigator')
  let globalName: string | undefined
  let botguard: BotGuardClient | undefined
  let completed = false

  const cleanup = async () => {
    await botguard?.shutdown().catch(() => undefined)
    if (globalName) {
      Reflect.deleteProperty(globalThis, globalName)
    }
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window')
    } else {
      Reflect.set(globalThis, 'window', previousWindow)
    }
    if (previousDocument === undefined) {
      Reflect.deleteProperty(globalThis, 'document')
    } else {
      Reflect.set(globalThis, 'document', previousDocument)
    }
    if (previousLocation === undefined) Reflect.deleteProperty(globalThis, 'location')
    else Reflect.set(globalThis, 'location', previousLocation)
    if (previousOrigin === undefined) Reflect.deleteProperty(globalThis, 'origin')
    else Reflect.set(globalThis, 'origin', previousOrigin)
    if (!hadNavigator) Reflect.deleteProperty(globalThis, 'navigator')
    dom.window.close()
  }

  try {
    Reflect.set(globalThis, 'window', dom.window)
    Reflect.set(globalThis, 'document', dom.window.document)
    Reflect.set(globalThis, 'location', dom.window.location)
    Reflect.set(globalThis, 'origin', dom.window.origin)
    if (!Reflect.has(globalThis, 'navigator')) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: dom.window.navigator,
      })
    }

    const challenge = await getChallenge({
      fetchFunction: fetch,
      requestKey: BOTGUARD_REQUEST_KEY,
    })
    const interpreter =
      challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue
    if (!interpreter) {
      throw new Error('YouTube attestation challenge unavailable')
    }

    globalName = challenge.globalName
    // BgUtils returns YouTube's attestation interpreter as source text. Executing this
    // isolated challenge is the documented integration point; no local input is included.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    new Function(interpreter)()

    botguard = await BotGuardClient.create({
      globalName: challenge.globalName,
      globalObject: globalThis,
      program: challenge.program,
    })
    const webPoSignalOutput: WebPoSignalOutput = []
    const botguardResponse = await botguard.snapshot({ webPoSignalOutput })
    const response = await fetch(buildURL('GenerateIT', true), {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify([BOTGUARD_REQUEST_KEY, botguardResponse]),
    })
    if (!response.ok) {
      throw new Error('YouTube attestation integrity request failed')
    }

    const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] =
      integrityTokenResponseSchema.parse(await response.json())
    const minter = await WebPoMinter.create(
      { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
      webPoSignalOutput,
    )
    const expiresAt = Date.now() + (estimatedTtlSecs ?? DEFAULT_ATTESTATION_TTL_MS / 1000) * 1000

    completed = true
    return {
      expiresAt,
      mintContentToken: (videoId) => minter.mintAsWebsafeString(videoId),
      dispose: cleanup,
    }
  } finally {
    if (!completed) {
      await cleanup()
    }
  }
}
