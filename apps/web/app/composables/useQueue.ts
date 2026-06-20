import {
  queueItemSchema,
  queueSchema,
  type Queue,
  type QueueItem,
  type TrackMetadata,
} from '@waves/shared'
import { onMounted, onUnmounted, ref } from 'vue'

const POLLING_INTERVAL_MS = 2500

export function useQueue(apiBase: string) {
  const items = ref<Queue>([])
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref<string>()
  const mutatingId = ref<string>()
  const addingTrackId = ref<string>()
  let pollingTimer: ReturnType<typeof setInterval> | undefined
  let requestInFlight = false

  async function load(isPolling = false) {
    if (requestInFlight) return
    requestInFlight = true
    if (isPolling) refreshing.value = true
    else loading.value = true

    try {
      items.value = queueSchema.parse(await $fetch(`${apiBase}/queue`))
      error.value = undefined
    } catch {
      error.value = 'Não foi possível atualizar a fila.'
    } finally {
      requestInFlight = false
      loading.value = false
      refreshing.value = false
    }
  }

  function replace(queue: Queue) {
    items.value = queueSchema.parse(queue)
    error.value = undefined
  }

  async function add(track: TrackMetadata) {
    addingTrackId.value = track.id
    try {
      const item = queueItemSchema.parse(
        await $fetch(`${apiBase}/queue`, { method: 'POST', body: { track } }),
      )
      items.value = [...items.value, item].sort((a, b) => a.position - b.position)
      error.value = undefined
    } catch {
      error.value = 'Não foi possível adicionar essa faixa.'
    } finally {
      addingTrackId.value = undefined
    }
  }

  async function remove(id: string) {
    mutatingId.value = id
    try {
      replace(
        queueSchema.parse(
          await $fetch(`${apiBase}/queue/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        ),
      )
    } catch {
      error.value = 'Não foi possível remover essa faixa.'
    } finally {
      mutatingId.value = undefined
    }
  }

  async function move(item: QueueItem, direction: -1 | 1) {
    const currentIndex = items.value.findIndex(({ id }) => id === item.id)
    const newPosition = currentIndex + direction
    if (currentIndex < 0 || newPosition < 0 || newPosition >= items.value.length) return

    mutatingId.value = item.id
    try {
      replace(
        queueSchema.parse(
          await $fetch(`${apiBase}/queue/${encodeURIComponent(item.id)}/move`, {
            method: 'POST',
            body: { newPosition },
          }),
        ),
      )
    } catch {
      error.value = 'Não foi possível mover essa faixa.'
    } finally {
      mutatingId.value = undefined
    }
  }

  onMounted(() => {
    void load()
    pollingTimer = setInterval(() => void load(true), POLLING_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (pollingTimer) clearInterval(pollingTimer)
  })

  return {
    items,
    loading,
    refreshing,
    error,
    mutatingId,
    addingTrackId,
    refresh: () => load(true),
    replace,
    add,
    remove,
    move,
  }
}
