// @vitest-environment happy-dom

import type { RealtimeEvent } from '@waves/shared'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useRealtimeEvents } from '../../app/composables/useRealtimeEvents'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readonly close = vi.fn()
  private readonly listeners = new Map<string, Array<(event: Event) => void>>()

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const handler = (event: Event) => {
      if (typeof listener === 'function') listener(event)
      else listener.handleEvent(event)
    }
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler])
  }

  emit(type: string, event: Event = new Event(type)) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

afterEach(() => {
  FakeEventSource.instances = []
  vi.unstubAllGlobals()
})

describe('useRealtimeEvents', () => {
  it('dispatches parsed SSE messages and reports malformed payloads', async () => {
    const handled: RealtimeEvent[] = []
    vi.stubGlobal('EventSource', FakeEventSource)

    const Harness = defineComponent({
      setup() {
        const realtime = useRealtimeEvents('/api', {
          snapshot: (event) => handled.push(event),
          queueUpdated: (event) => handled.push(event),
          queueItemFailed: (event) => handled.push(event),
          playerUpdated: (event) => handled.push(event),
          statusChanged: (event) => handled.push(event),
        })
        return realtime
      },
      template: '<div />',
    })

    const wrapper = mount(Harness)
    const source = FakeEventSource.instances[0]
    expect(source?.url).toBe('/api/events')

    source?.emit('open')
    await nextTick()
    expect(wrapper.vm.connected).toBe(true)

    source?.emit(
      'queue.updated',
      new MessageEvent('queue.updated', {
        data: JSON.stringify({ type: 'queue.updated', queue: [], reason: 'added' }),
      }),
    )
    await nextTick()
    expect(handled).toEqual([{ type: 'queue.updated', queue: [], reason: 'added' }])

    source?.emit('player.updated', new MessageEvent('player.updated', { data: '{}' }))
    await nextTick()
    expect(wrapper.vm.lastError).toBe('Evento de sincronizacao invalido.')

    source?.emit('error')
    await nextTick()
    expect(wrapper.vm.connected).toBe(false)

    wrapper.unmount()
    expect(source?.close).toHaveBeenCalled()
  })
})
