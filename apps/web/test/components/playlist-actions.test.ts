// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueItem, TrackMetadata } from '@waves/shared'
import QueuePlaylistActions from '../../app/components/QueuePlaylistActions.vue'
import { useToasts } from '../../app/composables/useToasts'

const track: TrackMetadata = {
  id: 'spotify:1',
  provider: 'spotify',
  providerTrackId: '1',
  title: 'Faixa',
  artists: ['Artista'],
  durationMs: 120000,
}
const item: QueueItem = {
  id: 'q1',
  origin: 'human',
  track,
  status: 'queued',
  position: 0,
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
}
const url = 'https://open.spotify.com/playlist/1234567890123456789012'
const preview = {
  id: '1234567890123456789012',
  name: 'Playlist',
  owner: 'Owner',
  total: 5,
  tracks: Array.from({ length: 5 }, (_, i) => ({ ...track, title: `Faixa ${i}` })),
  skipped: [],
}
let wrapper: ReturnType<typeof mount<typeof QueuePlaylistActions>>
let trigger: HTMLButtonElement

async function openDialog(mode: 'import' | 'clear' = 'import') {
  trigger.focus()
  const actions = wrapper.vm as unknown as { show: (mode: 'import' | 'clear') => void }
  actions.show(mode)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  trigger = document.createElement('button')
  document.body.append(trigger)
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false
  })
  wrapper = mount(QueuePlaylistActions, {
    props: { apiBase: '/api', items: [item] },
    attachTo: document.body,
    global: { stubs: { teleport: true } },
  })
})

afterEach(() => {
  wrapper.unmount()
  trigger.remove()
  for (const toast of useToasts().visible.value) useToasts().remove(toast.id)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Playlist actions', () => {
  it('locks the URL while loading and replaces the import dialog with restricted instructions', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce({
        data: {
          statusCode: 403,
          statusMessage: 'Spotify playlist inaccessible',
          data: { code: 'SPOTIFY_PLAYLIST_INACCESSIBLE' },
        },
      })
      .mockResolvedValueOnce(preview)
    vi.stubGlobal('$fetch', fetcher)
    await openDialog()
    await wrapper.get('input').setValue(url)
    expect(wrapper.get('input').attributes('readonly')).toBeDefined()
    expect(wrapper.get('[role="status"]').text()).toContain('Carregando playlist')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
    const restricted = wrapper.get('.restricted-dialog')
    expect((restricted.element as HTMLDialogElement).open).toBe(true)
    expect(restricted.get('h2').text()).toBe('Playlist restrita')
    expect(restricted.get('code').text()).toContain('1. Abra a playlist no Spotify.')
    expect(restricted.get('code').element.textContent).toContain('\n2.')
    expect(restricted.find('svg').exists()).toBe(true)
    expect(wrapper.emitted('updated')).toBeUndefined()
    await restricted.get('button').trigger('click')
    expect((restricted.element as HTMLDialogElement).open).toBe(false)
    expect(document.activeElement).toBe(trigger)
    await openDialog()
    await wrapper.get('input').setValue(url)
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    expect(wrapper.findAll('.preview-tracks li')).toHaveLength(5)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('does not open restricted instructions after the user cancels loading', async () => {
    let reject!: (reason: unknown) => void
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockReturnValue(
        new Promise((_, fail) => {
          reject = fail
        }),
      ),
    )
    await openDialog()
    await wrapper.get('input').setValue(url)
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.get('dialog').get('[aria-label="Fechar"]').trigger('click')
    reject({
      data: {
        statusCode: 403,
        statusMessage: 'Restricted',
        data: { code: 'SPOTIFY_PLAYLIST_INACCESSIBLE' },
      },
    })
    await flushPromises()
    expect(
      wrapper.findAll('dialog').every((dialog) => !(dialog.element as HTMLDialogElement).open),
    ).toBe(true)
  })
  it('loads a five-track preview, waits for confirmation and reports skipped tracks', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({
        queue: [item],
        imported: 4,
        skipped: [{ position: 2, title: 'Repetida', reason: 'duplicate' }],
      })
    vi.stubGlobal('$fetch', fetcher)
    await openDialog()
    await wrapper.get('input').setValue(url)
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    expect(wrapper.findAll('.preview-tracks li')).toHaveLength(5)
    expect(wrapper.get('dialog').classes()).toContain('expanded')
    expect(fetcher).toHaveBeenCalledTimes(1)
    await wrapper.get('#playlist-shuffle').setValue(true)
    await wrapper.get('footer .primary').trigger('click')
    await flushPromises()
    expect(fetcher.mock.calls[1]).toEqual([
      '/api/queue/import',
      { method: 'POST', body: { url, shuffle: true } },
    ])
    expect(wrapper.text()).toContain('4 músicas importadas; 1 ignoradas.')
    expect(wrapper.text()).toContain('Repetida — Já está na fila')
    expect(wrapper.emitted('updated')).toEqual([[[item]]])
    expect(wrapper.get('dialog').find('footer .primary').exists()).toBe(false)
  })

  it('discards stale previews when the URL changes', async () => {
    let resolve!: (value: typeof preview) => void
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockReturnValue(
        new Promise((done) => {
          resolve = done
        }),
      ),
    )
    await openDialog()
    await wrapper.get('input').setValue(url)
    await vi.advanceTimersByTimeAsync(350)
    await wrapper.get('input').setValue('invalid')
    resolve(preview)
    await flushPromises()
    expect(wrapper.find('.playlist-preview').exists()).toBe(false)
    expect(wrapper.get('footer .primary').attributes('disabled')).toBeDefined()
  })

  it('requires confirmation to clear and disables clearing when only a track is playing', async () => {
    const fetcher = vi.fn().mockResolvedValue({ queue: [], cleared: 1 })
    vi.stubGlobal('$fetch', fetcher)
    await openDialog('clear')
    expect(fetcher).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('A música em reprodução continuará tocando')
    await wrapper.get('footer .destructive').trigger('click')
    await flushPromises()
    expect(fetcher).toHaveBeenCalledWith('/api/queue/clear', { method: 'POST' })
    await wrapper.setProps({ items: [{ ...item, status: 'playing' }] })
    await openDialog('clear')
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
  })
})
