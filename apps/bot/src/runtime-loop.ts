export interface BackoffLoopOptions {
  intervalMs: number
  maxBackoffMs: number
  action: () => Promise<void>
  onFailure: (error: unknown) => void
  random?: () => number
}

export interface BackoffLoop {
  start(runImmediately?: boolean): void
  stop(): void
  whenIdle(): Promise<void>
}

export function createBackoffLoop(options: BackoffLoopOptions): BackoffLoop {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let stopped = true
  let consecutiveFailures = 0
  const random = options.random ?? Math.random

  const schedule = (delayMs: number) => {
    if (stopped) {
      return
    }
    timer = setTimeout(() => {
      timer = undefined
      running = run()
    }, delayMs)
    timer.unref()
  }

  const nextDelay = (): number => {
    if (consecutiveFailures === 0) {
      return options.intervalMs
    }
    const exponential = Math.min(
      options.maxBackoffMs,
      options.intervalMs * 2 ** Math.max(0, consecutiveFailures - 1),
    )
    const jitter = 0.8 + Math.min(1, Math.max(0, random())) * 0.4
    return Math.min(options.maxBackoffMs, Math.round(exponential * jitter))
  }

  const run = async (): Promise<void> => {
    try {
      await options.action()
      consecutiveFailures = 0
    } catch (error) {
      consecutiveFailures += 1
      options.onFailure(error)
    } finally {
      running = undefined
      schedule(nextDelay())
    }
  }

  return {
    start(runImmediately = false) {
      if (!stopped) {
        return
      }
      stopped = false
      schedule(runImmediately ? 0 : options.intervalMs)
    },
    stop() {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
    },
    async whenIdle() {
      await running
    },
  }
}
