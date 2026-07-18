import type { RealtimeEvent } from '@waves/shared'
import { describe, expect, it, vi } from 'vitest'

import { createRealtimeEventBus } from '../../server/utils/realtime-events'

const event: RealtimeEvent = {
  type: 'queue.updated',
  queue: [],
  reason: 'added',
}

describe('realtime event bus', () => {
  it('validates events, assigns ids, notifies subscribers and unsubscribes', () => {
    const bus = createRealtimeEventBus()
    const subscriber = vi.fn()
    const unsubscribe = bus.subscribe(subscriber)

    expect(bus.publish(event)).toEqual({ id: '1', event })
    expect(bus.publish({ ...event, reason: 'moved' })).toEqual({
      id: '2',
      event: { ...event, reason: 'moved' },
    })
    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(subscriber).toHaveBeenNthCalledWith(1, { id: '1', event })

    unsubscribe()
    bus.publish({ ...event, reason: 'removed' })

    expect(subscriber).toHaveBeenCalledTimes(2)
    expect(() =>
      bus.publish({
        type: 'queue.updated',
        queue: [],
        reason: 'invalid',
      } as unknown as RealtimeEvent),
    ).toThrow()
  })
})
