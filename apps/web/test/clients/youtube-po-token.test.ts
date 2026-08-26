import { describe, expect, it, vi } from 'vitest'

import { YouTubePoTokenProvider } from '../../server/clients/youtube-po-token'

describe('YouTubePoTokenProvider', () => {
  it('reuses one in-memory attestation and mints a token per video', async () => {
    const mintContentToken = vi.fn((videoId: string) => Promise.resolve(`content-${videoId}`))
    const createSession = vi.fn().mockResolvedValue({
      expiresAt: 1_000_000,
      mintContentToken,
      dispose: vi.fn(),
    })
    const provider = new YouTubePoTokenProvider(() => 1_000, createSession)

    await expect(provider.getTokens('video-1')).resolves.toMatchObject({
      contentToken: 'content-video-1',
      generation: 1,
    })
    await expect(provider.getTokens('video-2')).resolves.toMatchObject({
      contentToken: 'content-video-2',
      generation: 1,
    })
    expect(createSession).toHaveBeenCalledOnce()
  })

  it('refreshes expired attestation and disposes the previous session', async () => {
    let now = 0
    const dispose = vi.fn()
    const createSession = vi
      .fn()
      .mockResolvedValueOnce({
        expiresAt: 400_000,
        mintContentToken: vi.fn().mockResolvedValue('content-1'),
        dispose,
      })
      .mockResolvedValueOnce({
        expiresAt: 1_000_000,
        mintContentToken: vi.fn().mockResolvedValue('content-2'),
        dispose: vi.fn(),
      })
    const provider = new YouTubePoTokenProvider(() => now, createSession)

    await provider.getTokens('video-1')
    now = 101_000
    await expect(provider.getTokens('video-2')).resolves.toMatchObject({
      contentToken: 'content-2',
      generation: 2,
    })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('shares one refresh between concurrent callers', async () => {
    const createSession = vi.fn().mockResolvedValue({
      expiresAt: 1_000_000,
      mintContentToken: vi.fn((videoId: string) => Promise.resolve(`content-${videoId}`)),
      dispose: vi.fn(),
    })
    const provider = new YouTubePoTokenProvider(() => 1_000, createSession)

    await expect(
      Promise.all([provider.getTokens('video-1'), provider.getTokens('video-2')]),
    ).resolves.toEqual([
      { contentToken: 'content-video-1', generation: 1 },
      { contentToken: 'content-video-2', generation: 1 },
    ])
    expect(createSession).toHaveBeenCalledOnce()
  })
})
