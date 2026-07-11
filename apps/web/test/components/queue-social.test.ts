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

  it('renders three autoplay ghosts after human tracks and rejects one target accessibly', async () => {
    const suggestions = ['Fantasma', 'Neblina', 'Aurora'].map((title, index) => ({
      track: {
        ...track,
        id: `spotify:ghost-${index + 1}`,
        providerTrackId: `ghost-${index + 1}`,
        title,
      },
      provider: 'spotify' as const,
      generatedAt: '2026-06-18T12:00:00.000Z',
      seedFingerprint: 'seed',
    }))
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
      },
    })

    expect(wrapper.findAll('.autoplay-suggestion')).toHaveLength(3)
    const rows = wrapper.findAll('.queue-items > *')
    expect(rows.at(-1)?.classes()).toContain('autoplay-suggestion')
    await wrapper.get('[aria-label="Rejeitar sugestão Neblina"]').trigger('click')
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

    let queue: ReturnType<typeof useQueue> | undefined
    const Harness = defineComponent({
      setup() {
        queue = useQueue('/api')
        return {}
      },
      template: '<div />',
    })

    const wrapper = mount(Harness)
    await flushPromises()
    expect(queue?.items.value[1]?.track.title).toBe('Cidade Lunar')

    vi.advanceTimersByTime(2500)
    await nextTick()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    queue?.setInteractionLocked(true)
    resolvePollingRequest?.([queueItem, staleItem])
    await flushPromises()
    expect(queue?.items.value[1]?.track.title).toBe('Cidade Lunar')

    queue?.setInteractionLocked(false)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(queue?.items.value[1]?.track.title).toBe('Resposta atual')

    wrapper.unmount()
  })
})
