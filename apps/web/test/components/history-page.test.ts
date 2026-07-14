// @vitest-environment happy-dom

import type { HistoryPage, QueueItem, TrackMetadata } from '@waves/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import HistoryPanel from '../../app/components/HistoryPanel.vue'
import DashboardPage from '../../app/pages/index.vue'
import HistoryPageComponent from '../../app/pages/hist.vue'

const track: TrackMetadata = {
  id: 'spotify:track-1',
  provider: 'spotify',
  providerTrackId: 'track-1',
  title: 'Luz da Madrugada',
  artists: ['Brisa Urbana'],
  durationMs: 208_000,
}

function historyItem(id: string, status: QueueItem['status'] = 'played'): QueueItem {
  return {
    id,
    track: { ...track, id: `spotify:${id}`, title: `Faixa ${id}` },
    requestedByDisplayName: 'Juliana',
    status,
    position: 0,
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: '2026-06-18T12:04:00.000Z',
  }
}

const autoplayFailed: QueueItem = {
  id: 'failed',
  track: { ...track, id: 'spotify:failed', title: 'Faixa failed' },
  status: 'failed',
  position: 0,
  createdAt: '2026-06-18T12:00:00.000Z',
  updatedAt: '2026-06-18T12:04:00.000Z',
}

function mountOptions() {
  return {
    global: {
      stubs: {
        NuxtLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>',
        },
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('history page', () => {
  it('keeps the dashboard page importable with history navigation', () => {
    const fetchMock = vi.fn().mockResolvedValue([])
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mount(DashboardPage, mountOptions())

    expect(wrapper.text()).toContain('Fila da sala')
    expect(wrapper.text()).toContain('Histórico')
  })

  it('renders requester fallback, muted failure state and guarded pagination', async () => {
    let resolveSecondPage: ((value: HistoryPage) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        items: [historyItem('played'), autoplayFailed],
        nextCursor: 'cursor-1',
      })
      .mockImplementationOnce(
        () =>
          new Promise<HistoryPage>((resolve) => {
            resolveSecondPage = resolve
          }),
      )
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mount(HistoryPageComponent, mountOptions())
    await flushPromises()

    expect(wrapper.text()).toContain('Waves-Bot')
    expect(wrapper.get('[data-history-status="failed"]').classes()).toContain('is-muted')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-history-sentinel]').trigger('intersect')
    await wrapper.get('[data-history-sentinel]').trigger('intersect')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    resolveSecondPage?.({ items: [historyItem('older')], nextCursor: null })
    await flushPromises()
    expect(wrapper.text()).toContain('Faixa older')
    expect(wrapper.text()).toContain('Fim do histórico')
  })

  it('observes the sentinel after the initial loading state resolves', async () => {
    let observerCallback: IntersectionObserverCallback | undefined
    const observeMock = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback
        }

        observe = observeMock
        disconnect = vi.fn()
      },
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ items: [historyItem('played')], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [historyItem('older')], nextCursor: null })
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mount(HistoryPageComponent, mountOptions())
    await flushPromises()

    expect(observeMock).toHaveBeenCalledWith(wrapper.get('[data-history-sentinel]').element)
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Faixa older')
  })

  it('renders loading, empty and retryable error states', async () => {
    const pendingFetch = vi.fn(() => new Promise<HistoryPage>(() => undefined))
    vi.stubGlobal('$fetch', pendingFetch)
    const loading = mount(HistoryPageComponent, mountOptions())
    expect(loading.text()).toContain('Carregando histórico')
    loading.unmount()

    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ items: [], nextCursor: null }))
    const empty = mount(HistoryPageComponent, mountOptions())
    await flushPromises()
    expect(empty.text()).toContain('O histórico ainda está vazio')

    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const failed = mount(HistoryPageComponent, mountOptions())
    await flushPromises()
    expect(failed.text()).toContain('Não foi possível carregar o histórico')
    expect(failed.get('button').text()).toContain('Tentar novamente')
  })
})

describe('HistoryPanel', () => {
  it('renders an inline pagination error without clearing loaded rows', () => {
    const wrapper = mount(HistoryPanel, {
      props: {
        items: [historyItem('played')],
        loading: false,
        loadingMore: false,
        error: 'Não foi possível carregar mais histórico.',
        hasMore: true,
      },
    })

    expect(wrapper.text()).toContain('Faixa played')
    expect(wrapper.text()).toContain('Não foi possível carregar mais histórico')
  })
})
