// @vitest-environment happy-dom

import type { PlayerState, QueueItem, TrackMetadata } from '@waves/shared'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PlayerBar from '../../app/components/PlayerBar.vue'
import QueuePanel from '../../app/components/QueuePanel.vue'
import SpotifySearch from '../../app/components/SpotifySearch.vue'
import { useQueue } from '../../app/composables/useQueue'

const track: TrackMetadata = {
  id: 'track-1',
  provider: 'spotify',
  providerTrackId: 'spotify-1',
  title: 'Luz da Madrugada',
  artists: ['Brisa Urbana'],
  durationMs: 208000,
}

const queueItem: QueueItem = {
  id: 'queue-1',
  track,
  requestedByDisplayName: 'Juliana',
  status: 'playing',
  position: 0,
  createdAt: '2026-06-18T12:00:00.000Z',
  updatedAt: '2026-06-18T12:00:00.000Z',
}

const player: PlayerState = {
  status: 'playing',
  currentQueueItemId: queueItem.id,
  updatedAt: '2026-06-18T12:00:00.000Z',
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Queue Social components', () => {
  it('renders idle and current player states', () => {
    const idle = mount(PlayerBar, {
      props: { loading: false, skipping: false },
    })
    expect(idle.text()).toContain('Nenhuma música tocando')

    const playing = mount(PlayerBar, {
      props: {
        player,
        currentItem: queueItem,
        loading: false,
        skipping: false,
      },
    })
    expect(playing.text()).toContain('Luz da Madrugada')
    expect(playing.get('button').text()).toContain('PULAR FAIXA')
  })

  it('renders an empty queue and emits accessible queue actions', async () => {
    const empty = mount(QueuePanel, {
      props: { items: [], loading: false, refreshing: false },
    })
    expect(empty.text()).toContain('A fila está vazia')

    const filled = mount(QueuePanel, {
      props: { items: [queueItem], loading: false, refreshing: false },
    })
    await filled.get('[aria-label="Remover Luz da Madrugada da fila"]').trigger('click')
    expect(filled.emitted('remove')).toEqual([[queueItem.id]])
  })

  it('debounces Spotify search and renders validated results', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue([track])
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { apiBase: '/api' } }))

    const wrapper = mount(SpotifySearch, {
      props: {},
    })

    await wrapper.get('input').setValue('Luz')
    await vi.advanceTimersByTimeAsync(350)
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Luz da Madrugada')
  })
})

describe('queue polling', () => {
  it('does not overlap requests and clears polling on unmount', async () => {
    vi.useFakeTimers()
    let resolveRequest: ((value: QueueItem[]) => void) | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<QueueItem[]>((resolve) => {
          resolveRequest = resolve
        }),
    )
    vi.stubGlobal('$fetch', fetchMock)

    const Harness = defineComponent({
      setup() {
        return useQueue('/api')
      },
      template: '<div />',
    })

    const wrapper = mount(Harness)
    await nextTick()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveRequest?.([])
    await nextTick()
    await vi.advanceTimersByTimeAsync(2500)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    resolveRequest?.([])
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
