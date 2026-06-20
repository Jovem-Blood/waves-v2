import { describe, expect, it, vi } from 'vitest'

import { YouTubePoTokenProvider } from '../../server/clients/youtube-po-token'

describe('YouTubePoTokenProvider', () => {
  it('reuses one in-memory attestation and mints a token per video', async () => {
    const mintContentToken = vi.fn((videoId: string) => Promise.resolve(`content-${videoId}`))
    const createSession = vi.fn().mockResolvedValue({
      visitorData: 'visitor',
      sessionToken: 'session',
      expiresAt: 1_000_000,
      mintContentToken,
      dispose: vi.fn(),
    })
    const provider = new YouTubePoTokenProvider(() => 1_000, createSession)

    await expect(provider.getTokens('video-1')).resolves.toMatchObject({
      visitorData: 'visitor',
      sessionToken: 'session',
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
        visitorData: 'visitor-1',
        sessionToken: 'session-1',
        expiresAt: 400_000,
        mintContentToken: vi.fn().mockResolvedValue('content-1'),
        dispose,
      })
      .mockResolvedValueOnce({
        visitorData: 'visitor-2',
        sessionToken: 'session-2',
        expiresAt: 1_000_000,
        mintContentToken: vi.fn().mockResolvedValue('content-2'),
        dispose: vi.fn(),
      })
    const provider = new YouTubePoTokenProvider(() => now, createSession)

    await provider.getTokens('video-1')
    now = 101_000
    await expect(provider.getTokens('video-2')).resolves.toMatchObject({
      sessionToken: 'session-2',
      generation: 2,
    })
    expect(dispose).toHaveBeenCalledOnce()
  })
})
