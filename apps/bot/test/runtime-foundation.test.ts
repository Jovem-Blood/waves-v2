import { afterEach, describe, expect, it, vi } from 'vitest'

import { startBotHealthServer, type BotHealthState } from '../src/health-server.js'
import { createBotShutdown } from '../src/index.js'
import type { BotLogger } from '../src/logger.js'
import { createBackoffLoop, type BackoffLoop } from '../src/runtime-loop.js'

function loggerMock(): BotLogger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    flush: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as BotLogger
}

afterEach(() => {
  vi.useRealTimers()
})

describe('bot runtime foundation', () => {
  it('never overlaps loop executions and waits until the active execution is idle', async () => {
    vi.useFakeTimers()
    let finish: (() => void) | undefined
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const loop = createBackoffLoop({
      intervalMs: 1_000,
      maxBackoffMs: 30_000,
      action,
      onFailure: vi.fn(),
      random: () => 0.5,
    })

    loop.start(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(action).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(action).toHaveBeenCalledOnce()

    finish?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(999)
    expect(action).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(action).toHaveBeenCalledTimes(2)

    loop.stop()
    finish?.()
    await loop.whenIdle()
  })

  it('backs off exponentially after failures and resets scheduling after success', async () => {
    vi.useFakeTimers()
    const action = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockResolvedValue(undefined)
    const onFailure = vi.fn()
    const loop = createBackoffLoop({
      intervalMs: 1_000,
      maxBackoffMs: 30_000,
      action,
      onFailure,
      random: () => 0.5,
    })

    loop.start(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(action).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(action).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(action).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(action).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(action).toHaveBeenCalledTimes(4)
    expect(onFailure).toHaveBeenCalledTimes(2)
    loop.stop()
  })

  it('reports liveness and readiness without exposing runtime details', async () => {
    let now = 1_000
    const state: BotHealthState = {
      discordReady: false,
      shuttingDown: false,
    }
    const server = await startBotHealthServer({
      host: '127.0.0.1',
      port: 0,
      heartbeatMaxAgeMs: 5_000,
      state,
      logger: loggerMock(),
      now: () => now,
    })
    const baseUrl = `http://127.0.0.1:${server.port}`

    await expect(fetch(`${baseUrl}/health/live`).then((response) => response.status)).resolves.toBe(
      200,
    )
    await expect(
      fetch(`${baseUrl}/health/ready`).then((response) => response.status),
    ).resolves.toBe(503)

    state.discordReady = true
    state.lastHeartbeatAt = now
    const ready = await fetch(`${baseUrl}/health/ready`)
    expect(ready.status).toBe(200)
    await expect(ready.json()).resolves.toEqual({ ok: true })

    now += 5_001
    await expect(
      fetch(`${baseUrl}/health/ready`).then((response) => response.status),
    ).resolves.toBe(503)
    state.shuttingDown = true
    await expect(fetch(`${baseUrl}/health/live`).then((response) => response.status)).resolves.toBe(
      503,
    )
    await server.close()
    await expect(server.close()).resolves.toBeUndefined()
  })

  it('shuts down once and preserves cleanup failures in safe logs', async () => {
    const logger = loggerMock()
    const flush = vi.fn()
    Object.assign(logger, { flush })
    const stop = vi.fn()
    const whenIdle = vi.fn().mockResolvedValue(undefined)
    const loop: BackoffLoop = {
      start: vi.fn(),
      stop,
      whenIdle,
    }
    const playbackError = new Error('playback cleanup failed')
    const destroyPlayback = vi.fn(() => {
      throw playbackError
    })
    const destroyVoice = vi.fn()
    const destroyClient = vi.fn()
    const closeHealth = vi.fn().mockResolvedValue(undefined)
    const state: BotHealthState = {
      discordReady: true,
      lastHeartbeatAt: Date.now(),
      shuttingDown: false,
    }
    const shutdown = createBotShutdown({
      loops: [loop],
      healthState: state,
      healthServer: { port: 3_002, close: closeHealth },
      playbackManager: { destroyAll: destroyPlayback },
      voiceManager: { destroyAll: destroyVoice },
      client: { destroy: destroyClient },
      logger,
    })

    const first = shutdown('SIGTERM')
    const second = shutdown('SIGINT')
    expect(first).toBe(second)
    await first

    expect(state.shuttingDown).toBe(true)
    expect(stop).toHaveBeenCalledOnce()
    expect(whenIdle).toHaveBeenCalledOnce()
    expect(destroyPlayback).toHaveBeenCalledOnce()
    expect(destroyVoice).toHaveBeenCalledOnce()
    expect(destroyClient).toHaveBeenCalledOnce()
    expect(destroyPlayback.mock.invocationCallOrder[0]).toBeLessThan(
      whenIdle.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(closeHealth).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'playback.shutdown',
        err: playbackError,
      }),
      'Bot shutdown step failed',
    )
    expect(flush).toHaveBeenCalledOnce()
  })

  it('reserves shutdown time for telemetry and log flushing when a loop never becomes idle', async () => {
    vi.useFakeTimers()
    const logger = loggerMock()
    const flush = vi.fn()
    Object.assign(logger, { flush })
    const loop: BackoffLoop = {
      start: vi.fn(),
      stop: vi.fn(),
      whenIdle: vi.fn(() => new Promise<void>(() => undefined)),
    }
    const destroyPlayback = vi.fn()
    const shutdown = createBotShutdown({
      loops: [loop],
      healthState: {
        discordReady: true,
        lastHeartbeatAt: Date.now(),
        shuttingDown: false,
      },
      healthServer: { port: 3_002, close: vi.fn().mockResolvedValue(undefined) },
      playbackManager: { destroyAll: destroyPlayback },
      voiceManager: { destroyAll: vi.fn() },
      client: { destroy: vi.fn() },
      logger,
    })

    const completion = shutdown('SIGTERM')
    await vi.advanceTimersByTimeAsync(10_000)
    await completion

    expect(destroyPlayback).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'runtime_loops.shutdown',
      }),
      'Bot shutdown step failed',
    )
    expect(flush).toHaveBeenCalledOnce()
  })
})
