// @vitest-environment happy-dom

import type { PlayerState, QueueItem, TrackMetadata } from '@waves/shared'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PlayerBar from '../../app/components/PlayerBar.vue'
import QueuePanel from '../../app/components/QueuePanel.vue'
import SpotifySearch from '../../app/components/SpotifySearch.vue'
import TrackCard from '../../app/components/TrackCard.vue'
import { useQueue } from '../../app/composables/useQueue'
import { useToasts } from '../../app/composables/useToasts'

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

const queuedItem: QueueItem = {
  ...queueItem,
  id: 'queue-2',
  status: 'queued',
  position: 1,
  track: { ...track, id: 'track-2', title: 'Cidade Lunar' },
}

const player: PlayerState = {
  status: 'playing',
  currentQueueItemId: queueItem.id,
  updatedAt: '2026-06-18T12:00:00.000Z',
}

let queueHarnessState: ReturnType<typeof useQueue> | undefined
const QueueHarness = defineComponent({
  setup() {
    queueHarnessState = useQueue('/api')
    return queueHarnessState
  },
  template: '<div />',
})

afterEach(() => {
  queueHarnessState = undefined
  const toasts = useToasts()
  for (const toast of toasts.visible.value) toasts.remove(toast.id)
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
    expect(playing.get('.action-button').text()).toContain('PULAR FAIXA')
  })

  it('renders an empty queue and emits accessible queue actions', async () => {
    const empty = mount(QueuePanel, {
      props: { items: [], loading: false, refreshing: false },
    })
    expect(empty.text()).toContain('A fila está vazia')

    const filled = mount(QueuePanel, {
      props: { items: [queuedItem], loading: false, refreshing: false },
    })
    await filled.get('[aria-label="Remover Cidade Lunar da fila"]').trigger('click')
    expect(filled.emitted('remove')).toEqual([[queuedItem.id]])
  })

  it('renders an accessible autoplay switch and reports recommendation failures', async () => {
    const wrapper = mount(QueuePanel, {
      props: {
        items: [],
        loading: false,
        refreshing: false,
        autoplay: {
          enabled: true,
          failureCode: 'no_candidates',
          suggestions: [],
          updatedAt: '2026-06-18T12:00:00.000Z',
        },
      },
    })

    const toggle = wrapper.get('[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(toggle.attributes('aria-label')).toBe('Desativar autoplay')
    expect(wrapper.text()).toContain('não encontrou uma recomendação')
    await toggle.trigger('click')
    expect(wrapper.emitted('autoplayChange')).toEqual([[false]])
  })

  it('renders six autoplay ghosts after human tracks and commits or rejects one target accessibly', async () => {
    const suggestions = ['Fantasma', 'Neblina', 'Aurora', 'Horizonte', 'Prisma', 'Eclipse'].map(
      (title, index) => ({
        track: {
          ...track,
          id: `spotify:ghost-${index + 1}`,
          providerTrackId: `ghost-${index + 1}`,
          title,
        },
        provider: 'spotify' as const,
        generatedAt: '2026-06-18T12:00:00.000Z',
        seedFingerprint: 'seed',
        strategy: index === 5 ? ('explore' as const) : ('similar' as const),
      }),
    )
    const wrapper = mount(QueuePanel, {
      props: {
        items: [queuedItem],
        loading: false,
        refreshing: false,
        autoplay: {
          enabled: true,
          failureCode: null,
          suggestions,
          updatedAt: '2026-06-18T12:00:00.000Z',
        },
        autoplayRejectingId: 'ghost-1',
        autoplayCommittingTrackId: 'spotify:ghost-3',
      },
    })

    expect(wrapper.findAll('.autoplay-suggestion')).toHaveLength(6)
    const commitButtons = wrapper.findAll('.commit-button')
    const rejectButtons = wrapper.findAll('.reject-button')
    expect(rejectButtons[0]?.attributes('disabled')).toBe('')
    expect(rejectButtons[0]?.find('.spinner').exists()).toBe(true)
    expect(rejectButtons[1]?.attributes('disabled')).toBeUndefined()
    expect(commitButtons[2]?.attributes('disabled')).toBe('')
    expect(commitButtons[2]?.find('.spinner').exists()).toBe(true)
    const rows = wrapper.findAll('.queue-items > *')
    expect(rows.at(-1)?.classes()).toContain('autoplay-suggestion')
    await commitButtons[1]?.trigger('click')
    await rejectButtons[1]?.trigger('click')
    expect(wrapper.emitted('autoplayCommit')).toEqual([[suggestions[1]]])
    expect(wrapper.emitted('autoplayReject')).toEqual([['ghost-2']])
  })

  it('keeps the playing row fixed and exposes a handle only for queued rows', () => {
    const wrapper = mount(QueuePanel, {
      props: {
        items: [queueItem, queuedItem],
        loading: false,
        refreshing: false,
      },
    })

    expect(
      wrapper.get('[aria-label="Luz da Madrugada está tocando e não pode ser reordenada"]'),
    ).toBeDefined()
    expect(wrapper.get('[aria-label="Arraste para reordenar Cidade Lunar"]')).toBeDefined()
    expect(
      wrapper.get('[aria-label="Mover Cidade Lunar para cima"]').attributes('disabled'),
    ).toBeDefined()
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

  it('renders album, a safe Spotify link and both queue actions', async () => {
    const enrichedTrack = {
      ...track,
      albumName: 'Horizontes',
      externalUrl: 'https://open.spotify.com/track/spotify-1',
    }
    const wrapper = mount(TrackCard, {
      props: { track: enrichedTrack, adding: false, added: false },
    })

    expect(wrapper.text()).toContain('Horizontes')
    const link = wrapper.get('a')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')

    await wrapper.get('[aria-label="Adicionar Luz da Madrugada à fila"]').trigger('click')
    await wrapper.get('[aria-label="Tocar Luz da Madrugada em seguida"]').trigger('click')
    expect(wrapper.emitted('add')).toEqual([[enrichedTrack]])
    expect(wrapper.emitted('playNext')).toEqual([[enrichedTrack]])
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

    const wrapper = mount(QueueHarness)
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

  it('pauses queue polling while realtime is connected and resumes after disconnect', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue([])
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mount(QueueHarness)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    queueHarnessState?.setRealtimeConnected(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    queueHarnessState?.setRealtimeConnected(false)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(3)

    wrapper.unmount()
  })

  it('defers a polling response while the queue is being dragged', async () => {
    vi.useFakeTimers()
    const staleItem = {
      ...queuedItem,
      track: { ...queuedItem.track, title: 'Resposta antiga' },
    }
    const freshItem = {
      ...queuedItem,
      track: { ...queuedItem.track, title: 'Resposta atual' },
    }
    let resolvePollingRequest: ((value: QueueItem[]) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce([queueItem, queuedItem])
      .mockImplementationOnce(
        () =>
          new Promise<QueueItem[]>((resolve) => {
            resolvePollingRequest = resolve
          }),
      )
      .mockResolvedValueOnce([queueItem, freshItem])
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mount(QueueHarness)
    await flushPromises()
    expect(queueHarnessState?.items.value[1]?.track.title).toBe('Cidade Lunar')

    vi.advanceTimersByTime(2500)
    await nextTick()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    queueHarnessState?.setInteractionLocked(true)
    resolvePollingRequest?.([queueItem, staleItem])
    await flushPromises()
    expect(queueHarnessState?.items.value[1]?.track.title).toBe('Cidade Lunar')

    queueHarnessState?.setInteractionLocked(false)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(queueHarnessState?.items.value[1]?.track.title).toBe('Resposta atual')

    wrapper.unmount()
  })

  it('notifies when a disappeared queue item failed playback', async () => {
    vi.useFakeTimers()
    const failedItem: QueueItem = {
      ...queueItem,
      status: 'failed',
      updatedAt: '2026-06-18T12:01:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce([queueItem, queuedItem])
      .mockResolvedValueOnce([queuedItem])
      .mockResolvedValueOnce({ items: [failedItem], nextCursor: null })
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mount(QueueHarness)
    await flushPromises()

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()

    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/history')
    expect(useToasts().visible.value.at(0)?.message).toContain(
      'Não foi possível tocar "Luz da Madrugada"',
    )

    wrapper.unmount()
  })

  it('notifies explicit realtime queue failures without reading history', async () => {
    vi.useFakeTimers()
    const failedItem: QueueItem = {
      ...queueItem,
      status: 'failed',
      updatedAt: '2026-06-18T12:01:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue([queueItem, queuedItem])
    vi.stubGlobal('$fetch', fetchMock)

    const wrapper = mount(QueueHarness)
    await flushPromises()

    queueHarnessState?.applyRealtimeFailedItem(failedItem, [queuedItem])
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalledWith('/api/history')
    expect(useToasts().visible.value.at(0)?.message).toContain(
      'NÃ£o foi possÃ­vel tocar "Luz da Madrugada"',
    )
    expect(queueHarnessState?.items.value).toEqual([{ ...queuedItem, origin: 'human' }])

    wrapper.unmount()
  })
})
