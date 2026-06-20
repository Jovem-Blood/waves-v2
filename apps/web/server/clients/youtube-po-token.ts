import { BG, buildURL, GOOG_API_KEY, type WebPoSignalOutput } from 'bgutils-js'
import { JSDOM } from 'jsdom'
import { Innertube } from 'youtubei.js'
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
  visitorData: string
  sessionToken: string
  contentToken: string
  generation: number
}

interface AttestationSession {
  visitorData: string
  sessionToken: string
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
      visitorData: session.visitorData,
      sessionToken: session.sessionToken,
      contentToken: await session.mintContentToken(videoId),
      generation: this.generation,
    }
  }

  private async getSession(): Promise<AttestationSession> {
    if (this.session && this.now() < this.session.expiresAt - REFRESH_MARGIN_MS) {
      return this.session
    }

    if (this.session) {
      await Promise.resolve(this.session.dispose()).catch(() => undefined)
      this.session = undefined
    }

    this.pendingSession ??= this.createSession()
    try {
      const next = await this.pendingSession
      this.session = next
      this.generation += 1
      return next
    } finally {
      this.pendingSession = undefined
    }
  }
}

async function createAttestationSession(): Promise<AttestationSession> {
  const bootstrap = await Innertube.create({
    retrieve_player: false,
    generate_session_locally: true,
  })
  const visitorData = bootstrap.session.context.client.visitorData
  if (!visitorData) {
    throw new Error('YouTube attestation visitor data unavailable')
  }

  const dom = new JSDOM()
  const previousWindow = Reflect.get(globalThis, 'window')
  const previousDocument = Reflect.get(globalThis, 'document')
  let globalName: string | undefined
  let botguard: InstanceType<typeof BG.BotGuardClient> | undefined
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
    dom.window.close()
  }

  try {
    Reflect.set(globalThis, 'window', dom.window)
    Reflect.set(globalThis, 'document', dom.window.document)

    const bgConfig = {
      fetch,
      globalObj: globalThis,
      identifier: visitorData,
      requestKey: BOTGUARD_REQUEST_KEY,
      useYouTubeAPI: true,
    }
    const challenge = await BG.Challenge.create(bgConfig)
    const interpreter =
      challenge?.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue
    if (!challenge || !interpreter) {
      throw new Error('YouTube attestation challenge unavailable')
    }

    globalName = challenge.globalName
    // BgUtils returns YouTube's attestation interpreter as source text. Executing this
    // isolated challenge is the documented integration point; no local input is included.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    new Function(interpreter)()

    botguard = await BG.BotGuardClient.create({
      globalName: challenge.globalName,
      globalObj: globalThis,
      program: challenge.program,
    })
    const webPoSignalOutput: WebPoSignalOutput = []
    const botguardResponse = await botguard.snapshot({ webPoSignalOutput })
    const response = await fetch(buildURL('GenerateIT', true), {
      method: 'POST',
      headers: {
        'content-type': 'application/json+protobuf',
        'x-goog-api-key': GOOG_API_KEY,
        'x-user-agent': 'grpc-web-javascript/0.1',
      },
      body: JSON.stringify([BOTGUARD_REQUEST_KEY, botguardResponse]),
    })
    if (!response.ok) {
      throw new Error('YouTube attestation integrity request failed')
    }

    const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] =
      integrityTokenResponseSchema.parse(await response.json())
    const minter = await BG.WebPoMinter.create(
      { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
      webPoSignalOutput,
    )
    const sessionToken = await minter.mintAsWebsafeString(visitorData)
    const expiresAt = Date.now() + (estimatedTtlSecs ?? DEFAULT_ATTESTATION_TTL_MS / 1000) * 1000

    completed = true
    return {
      visitorData,
      sessionToken,
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
