import { describe, expect, it, vi } from 'vitest'
import type { BotLogger } from '../src/logger.js'
import {
  WavesApiError,
  WavesApiTimeoutError,
  WavesApiUnavailableError,
  WavesApiInvalidResponseError,
} from '../src/api/waves-api.errors.js'
import { deliverPlayback } from '../src/playback/telemetry-delivery.js'

const identity = { playbackAttemptId: 'logical', attempt: 2, queueItemId: 'queue' }
describe('playback telemetry delivery', () => {
  it.each([
    new WavesApiTimeoutError(),
    new WavesApiUnavailableError(),
    new WavesApiInvalidResponseError(),
  ])('recovers a temporary failure without changing identity', async (error) => {
    const send = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('ok')
    const log = vi.fn()
    const sleep = vi.fn().mockResolvedValue(undefined)
    expect(
      await deliverPlayback(
        'complete',
        identity,
        send,
        { error: log } as unknown as BotLogger,
        sleep,
      ),
    ).toBe('ok')
    expect(send).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(250)
    expect(log).toHaveBeenCalledWith(expect.objectContaining(identity), expect.any(String))
  })
  it('bounds retries and logs exhaustion without raw credentials', async () => {
    const send = vi.fn().mockRejectedValue(new Error('secret-url'))
    const log = vi.fn()
    const sleep = vi.fn().mockResolvedValue(undefined)
    await expect(
      deliverPlayback('skip', identity, send, { error: log } as unknown as BotLogger, sleep),
    ).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[250], [500]])
    expect(log.mock.calls.at(-1)?.[0]).toMatchObject({ outcome: 'delivery_exhausted' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-url')
  })
  it('does not retry a permanent rejection', async () => {
    const send = vi.fn().mockRejectedValue(new WavesApiError('PLAYBACK_CONFLICT', 409))
    await expect(
      deliverPlayback(
        'cancel',
        identity,
        send,
        { error: vi.fn() } as unknown as BotLogger,
        vi.fn(),
      ),
    ).rejects.toThrow()
    expect(send).toHaveBeenCalledTimes(1)
  })
})
