// @vitest-environment happy-dom

import type { QueueItem, TrackMetadata } from '@waves/shared'
import { mount } from '@vue/test-utils'
import type { Options, SortableEvent } from 'sortablejs'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sortableMock = vi.hoisted(() => ({
  create: vi.fn(),
  destroy: vi.fn(),
  options: undefined as Options | undefined,
}))

vi.mock('sortablejs', () => ({
  default: {
    create(element: HTMLElement, options: Options) {
      sortableMock.options = options
      sortableMock.create(element, options)
      return { el: element, destroy: sortableMock.destroy }
    },
  },
}))

import QueuePanel from '../../app/components/QueuePanel.vue'

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
  status: 'queued',
  position: 0,
  createdAt: '2026-06-18T12:00:00.000Z',
  updatedAt: '2026-06-18T12:00:00.000Z',
}

beforeEach(() => {
  sortableMock.create.mockClear()
  sortableMock.destroy.mockClear()
  sortableMock.options = undefined
})

describe('queue drag lifecycle', () => {
  it('locks synchronization for the duration of a drag', async () => {
    const wrapper = mount(QueuePanel, {
      props: { items: [queueItem], loading: false, refreshing: false },
    })
    await nextTick()

    sortableMock.options?.onStart?.({} as SortableEvent)
    sortableMock.options?.onEnd?.({ oldIndex: 0, newIndex: 0 } as SortableEvent)

    expect(wrapper.emitted('dragStateChange')).toEqual([[true], [false]])
    expect(wrapper.emitted('moveToPosition')).toEqual([[0, 0]])
  })

  it('keeps the same Sortable instance when queue items change', async () => {
    const wrapper = mount(QueuePanel, {
      props: { items: [queueItem], loading: false, refreshing: false },
    })
    await nextTick()
    expect(sortableMock.create).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      items: [
        queueItem,
        {
          ...queueItem,
          id: 'queue-2',
          position: 1,
          track: { ...track, id: 'track-2' },
        },
      ],
    })

    expect(sortableMock.create).toHaveBeenCalledTimes(1)
    expect(sortableMock.destroy).not.toHaveBeenCalled()
  })
})
