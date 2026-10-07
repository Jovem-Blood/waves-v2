import { Readable } from 'node:stream'

import { SafePlaybackError } from '../observability.js'

export const PCM_SAMPLE_RATE = 48_000
export const PCM_CHANNELS = 2
export const PCM_BYTES_PER_SAMPLE = 2
export const PCM_FRAME_DURATION_MS = 20
export const PCM_FRAME_BYTES =
  (PCM_SAMPLE_RATE * PCM_CHANNELS * PCM_BYTES_PER_SAMPLE * PCM_FRAME_DURATION_MS) / 1_000

export interface PcmPlaybackSource {
  id: string
  expectedDurationMs: number
  stream: Readable
  dispose(): void
}

export interface CrossfadeMixerOptions {
  crossfadeDurationMs: number
  preloadMs: number
  onPreloadRequired(trackId: string): void
  onCrossfadeRequired(trackId: string, playbackDurationMs: number): void
  onSourceEnded(trackId: string, playbackDurationMs: number): void
  onCrossfadeCompleted(outgoingTrackId: string): void
}

interface ActiveSource {
  source: PcmPlaybackSource
  reader: PcmFrameReader
  framesRead: number
}

class PcmFrameReader {
  private readonly iterator: AsyncIterator<Buffer | Uint8Array | string>
  private buffered = Buffer.alloc(0)
  private ended = false

  constructor(stream: Readable) {
    this.iterator = stream[Symbol.asyncIterator]()
  }

  async readFrame(): Promise<Buffer | undefined> {
    while (this.buffered.byteLength < PCM_FRAME_BYTES && !this.ended) {
      const next = await this.iterator.next()
      if (next.done) {
        this.ended = true
        break
      }
      const chunk =
        typeof next.value === 'string' ? Buffer.from(next.value) : Buffer.from(next.value)
      this.buffered = Buffer.concat([this.buffered, chunk])
    }

    if (this.buffered.byteLength === 0) return undefined

    const frame = Buffer.alloc(PCM_FRAME_BYTES)
    const available = Math.min(PCM_FRAME_BYTES, this.buffered.byteLength)
    this.buffered.copy(frame, 0, 0, available)
    this.buffered = this.buffered.subarray(available)
    return frame
  }
}

function framesToMilliseconds(frames: number): number {
  return frames * PCM_FRAME_DURATION_MS
}

function mixFrames(outgoing: Buffer, incoming: Buffer, progress: number): Buffer {
  const output = Buffer.allocUnsafe(PCM_FRAME_BYTES)
  const outgoingGain = Math.cos(progress * Math.PI * 0.5)
  const incomingGain = Math.sin(progress * Math.PI * 0.5)

  for (let offset = 0; offset < PCM_FRAME_BYTES; offset += PCM_BYTES_PER_SAMPLE) {
    const mixed =
      outgoing.readInt16LE(offset) * outgoingGain + incoming.readInt16LE(offset) * incomingGain
    output.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(mixed))), offset)
  }
  return output
}

export class CrossfadeMixer extends Readable {
  private current: ActiveSource
  private prepared: ActiveSource | undefined
  private incoming: ActiveSource | undefined
  private pumping = false
  private readRequested = false
  private waitingForAdvance = false
  private preloadRequested = false
  private crossfadeRequested = false
  private crossfadeFrame = 0
  private readonly crossfadeFrames: number

  constructor(
    initialSource: PcmPlaybackSource,
    private readonly options: CrossfadeMixerOptions,
  ) {
    super({ highWaterMark: PCM_FRAME_BYTES * 4 })
    this.current = this.activate(initialSource)
    this.crossfadeFrames = Math.max(
      1,
      Math.ceil(options.crossfadeDurationMs / PCM_FRAME_DURATION_MS),
    )
  }

  get currentTrackId(): string {
    return this.current.source.id
  }

  get preparedTrackId(): string | undefined {
    return this.prepared?.source.id
  }

  getPlaybackDuration(trackId: string): number | undefined {
    if (this.current.source.id === trackId) return framesToMilliseconds(this.current.framesRead)
    if (this.incoming?.source.id === trackId) return framesToMilliseconds(this.incoming.framesRead)
    return undefined
  }

  isCrossfadeDue(trackId: string): boolean {
    return this.current.source.id === trackId && this.crossfadeRequested
  }

  prepare(source: PcmPlaybackSource): boolean {
    if (this.destroyed || this.incoming || source.id === this.current.source.id) {
      source.dispose()
      return false
    }
    this.prepared?.source.dispose()
    this.prepared = this.activate(source)
    return true
  }

  discardPrepared(trackId: string): void {
    if (this.prepared?.source.id !== trackId) return
    this.prepared.source.dispose()
    this.prepared = undefined
  }

  beginCrossfade(outgoingTrackId: string, incomingTrackId: string): boolean {
    if (
      this.destroyed ||
      this.incoming ||
      this.current.source.id !== outgoingTrackId ||
      this.prepared?.source.id !== incomingTrackId
    ) {
      return false
    }
    this.incoming = this.prepared
    this.prepared = undefined
    this.crossfadeFrame = 0
    this.waitingForAdvance = false
    this.readRequested = true
    this.startPump()
    return true
  }

  promotePreparedAfterEnd(outgoingTrackId: string, incomingTrackId: string): boolean {
    if (
      this.destroyed ||
      this.incoming ||
      this.current.source.id !== outgoingTrackId ||
      this.prepared?.source.id !== incomingTrackId ||
      !this.waitingForAdvance
    ) {
      return false
    }
    this.current.source.dispose()
    this.current = this.prepared
    this.prepared = undefined
    this.preloadRequested = false
    this.crossfadeRequested = false
    this.waitingForAdvance = false
    this.readRequested = true
    this.startPump()
    return true
  }

  finish(outgoingTrackId: string): void {
    if (this.current.source.id !== outgoingTrackId || this.destroyed) return
    this.waitingForAdvance = false
    this.push(null)
  }

  override _read(): void {
    this.readRequested = true
    this.startPump()
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    this.current.source.dispose()
    this.prepared?.source.dispose()
    this.incoming?.source.dispose()
    callback(error)
  }

  private activate(source: PcmPlaybackSource): ActiveSource {
    return { source, reader: new PcmFrameReader(source.stream), framesRead: 0 }
  }

  private startPump(): void {
    if (this.pumping || this.destroyed || this.waitingForAdvance) return
    this.pumping = true
    this.readRequested = false
    void this.pump()
      .catch((error: unknown) => {
        this.destroy(
          error instanceof SafePlaybackError
            ? error
            : new SafePlaybackError('AUDIO_RESOURCE_FAILED', undefined, error),
        )
      })
      .finally(() => {
        this.pumping = false
        if (this.readRequested) this.startPump()
      })
  }

  private async pump(): Promise<void> {
    while (!this.destroyed && !this.waitingForAdvance) {
      const outgoingFrame = await this.current.reader.readFrame()
      if (!outgoingFrame && !this.incoming) {
        this.waitingForAdvance = true
        this.options.onSourceEnded(
          this.current.source.id,
          framesToMilliseconds(this.current.framesRead),
        )
        return
      }

      let output = outgoingFrame ?? Buffer.alloc(PCM_FRAME_BYTES)
      if (outgoingFrame) this.current.framesRead += 1

      if (this.incoming) {
        const incomingFrame = await this.incoming.reader.readFrame()
        if (!incomingFrame) throw new SafePlaybackError('PREMATURE_IDLE')
        this.incoming.framesRead += 1
        const progress =
          this.crossfadeFrames === 1
            ? 1
            : Math.min(1, this.crossfadeFrame / (this.crossfadeFrames - 1))
        output = mixFrames(output, incomingFrame, progress)
        this.crossfadeFrame += 1

        if (this.crossfadeFrame >= this.crossfadeFrames) {
          const outgoingTrackId = this.current.source.id
          this.current.source.dispose()
          this.current = this.incoming
          this.incoming = undefined
          this.preloadRequested = false
          this.crossfadeRequested = false
          this.crossfadeFrame = 0
          this.options.onCrossfadeCompleted(outgoingTrackId)
        }
      }

      this.requestUpcomingWork()
      if (!this.push(output)) return
    }
  }

  private requestUpcomingWork(): void {
    if (this.incoming) return
    const playbackDurationMs = framesToMilliseconds(this.current.framesRead)
    const preloadAtMs = Math.max(0, this.current.source.expectedDurationMs - this.options.preloadMs)
    const crossfadeAtMs = Math.max(
      0,
      this.current.source.expectedDurationMs - this.options.crossfadeDurationMs,
    )

    if (!this.preloadRequested && playbackDurationMs >= preloadAtMs) {
      this.preloadRequested = true
      this.options.onPreloadRequired(this.current.source.id)
    }
    if (!this.crossfadeRequested && playbackDurationMs >= crossfadeAtMs) {
      this.crossfadeRequested = true
      this.options.onCrossfadeRequired(this.current.source.id, playbackDurationMs)
    }
  }
}
