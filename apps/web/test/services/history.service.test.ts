import type { QueueItem } from '@waves/shared'
import { describe, expect, it } from 'vitest'

import { decodeHistoryCursor, HistoryService } from '../../server/services/history.service'

const track = {
  id: 'spotify:track-1',
  provider: 'spotify',
  providerTrackId: 'track-1',
  title: 'Track One',
  artists: ['Artist One'],
  durationMs: 120_000,
} as const

function item(index: number): QueueItem {
  return {
    id: `item-${index}`,
    track,
    origin: 'human',
    status: 'played',
    position: index,
    createdAt: '2026-06-18T12:00:00.000Z',
    updatedAt: `2026-06-18T12:${String(index).padStart(2, '0')}:00.000Z`,
  }
}

describe('HistoryService', () => {
  it('returns a bounded page and encodes the next cursor from the final returned item', () => {
    const repository = {
      listHistory: () => Array.from({ length: 21 }, (_, index) => item(index + 1)),
    }
    const service = new HistoryService(repository as never)
    const page = service.list()

    expect(page.items).toHaveLength(20)
    expect(page.items[0]?.id).toBe('item-1')
    expect(page.nextCursor).toEqual(expect.any(String))
    expect(decodeHistoryCursor(page.nextCursor ?? undefined)).toEqual({
      updatedAt: '2026-06-18T12:20:00.000Z',
      id: 'item-20',
    })
  })

  it('returns no cursor for a short page', () => {
    const shortItems = [item(1)]
    const repository = {
      listHistory: () => shortItems,
    }
    const service = new HistoryService(repository as never)

    expect(service.list()).toEqual({ items: shortItems, nextCursor: null })
  })
})
