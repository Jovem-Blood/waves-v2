import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import {
  CrossfadeMixer,
  PCM_FRAME_BYTES,
  type PcmPlaybackSource,
} from '../src/playback/crossfade-mixer.js'

function source(id: string, sample: number, frames: number) {
  const buffer = Buffer.alloc(PCM_FRAME_BYTES * frames)
  const dispose = vi.fn()
  for (let offset = 0; offset < buffer.byteLength; offset += 2) {
    buffer.writeInt16LE(sample, offset)
  }
  return {
    playbackSource: {
      id,
      expectedDurationMs: frames * 20,
      stream: Readable.from([buffer]),
      dispose,
    } satisfies PcmPlaybackSource,
    dispose,
  }
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array))
  return Buffer.concat(chunks)
}

describe('CrossfadeMixer', () => {
  it('keeps one continuous PCM stream and applies an equal-power crossfade', async () => {
    const first = source('first', 1_000, 5)
    const second = source('second', 2_000, 5)
    const events: string[] = []
    const mixer = new CrossfadeMixer(first.playbackSource, {
      crossfadeDurationMs: 60,
      preloadMs: 80,
      onPreloadRequired(trackId) {
        events.push(`preload:${trackId}`)
        if (trackId === 'first') expect(mixer.prepare(second.playbackSource)).toBe(true)
      },
      onCrossfadeRequired(trackId) {
        events.push(`crossfade:${trackId}`)
        if (trackId === 'first') expect(mixer.beginCrossfade('first', 'second')).toBe(true)
      },
      onSourceEnded(trackId) {
        events.push(`ended:${trackId}`)
        mixer.finish(trackId)
      },
      onCrossfadeCompleted(trackId) {
        events.push(`completed:${trackId}`)
      },
    })

    const output = await collect(mixer)
    const samples = Array.from({ length: output.byteLength / PCM_FRAME_BYTES }, (_, frame) =>
      output.readInt16LE(frame * PCM_FRAME_BYTES),
    )

    expect(samples).toEqual([1_000, 1_000, 1_000, 2_121, 2_000, 2_000, 2_000])
    expect(events).toEqual([
      'preload:first',
      'crossfade:first',
      'completed:first',
      'preload:second',
      'crossfade:second',
      'ended:second',
    ])
    expect(first.dispose).toHaveBeenCalled()
    expect(second.dispose).toHaveBeenCalled()
  })

  it('promotes a prepared source without overlap when the outgoing source ends early', async () => {
    const first = source('first', 500, 2)
    const second = source('second', 750, 2)
    const mixer = new CrossfadeMixer(first.playbackSource, {
      crossfadeDurationMs: 20,
      preloadMs: 40,
      onPreloadRequired(trackId) {
        if (trackId === 'first') mixer.prepare(second.playbackSource)
      },
      onCrossfadeRequired() {
        // Simulate an API transition that has not completed before the source ends.
      },
      onSourceEnded(trackId) {
        if (trackId === 'first') {
          expect(mixer.promotePreparedAfterEnd('first', 'second')).toBe(true)
        } else {
          mixer.finish(trackId)
        }
      },
      onCrossfadeCompleted: vi.fn(),
    })

    const output = await collect(mixer)
    const samples = Array.from({ length: output.byteLength / PCM_FRAME_BYTES }, (_, frame) =>
      output.readInt16LE(frame * PCM_FRAME_BYTES),
    )
    expect(samples).toEqual([500, 500, 750, 750])
  })
})
