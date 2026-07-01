import {
  queueItemSchema,
  queueSchema,
  removeQueueItemResultSchema,
  restoreQueueItemResultSchema,
  type Queue,
  type QueueItem,
  type TrackMetadata,
} from '@waves/shared'
import { onMounted, onUnmounted, ref } from 'vue'
import { useToasts } from './useToasts'

const POLLING_INTERVAL_MS = 2500

export function useQueue(apiBase: string) {
  const toasts = useToasts()
  const items = ref<Queue>([])
  const loading = ref(true)
  const refreshing = ref(false)
  const error = ref<string>()
  const mutatingId = ref<string>()
  const addingTrackId = ref<string>()
  const addingPlacement = ref<'end' | 'next'>()
  let pollingTimer: ReturnType<typeof setInterval> | undefined
  let requestInFlight = false
  let mutationInFlight = false
  let interactionLocked = false
  let refreshAfterInteraction = false

  function applyQueue(queue: Queue) {
    if (interactionLocked) {
      refreshAfterInteraction = true
      return false
    }

    items.value = queueSchema.parse(queue)
    error.value = undefined
    return true
  }

  async function load(isPolling = false) {
    if (interactionLocked) {
      refreshAfterInteraction = true
      return
    }
    if (requestInFlight || mutationInFlight) return
    requestInFlight = true
    if (isPolling) refreshing.value = true
    else loading.value = true

    try {
      applyQueue(queueSchema.parse(await $fetch(`${apiBase}/queue`)))
    } catch {
      error.value = 'Não foi possível atualizar a fila.'
    } finally {
      requestInFlight = false
      loading.value = false
      refreshing.value = false
    }
  }

  function replace(queue: Queue) {
    return applyQueue(queue)
  }

  function refreshPendingQueue() {
    if (!refreshAfterInteraction || interactionLocked || mutationInFlight) return

    refreshAfterInteraction = false
    void load(true)
  }

  function setInteractionLocked(locked: boolean) {
    interactionLocked = locked
    refreshPendingQueue()
  }

  function mutationError(caught: unknown, fallback: string): string {
    const payload =
      typeof caught === 'object' && caught !== null && 'data' in caught
        ? (caught as { data?: { data?: { code?: string } } }).data
        : undefined
    const code = payload?.data?.code
    if (code === 'UNAUTHORIZED') return 'Informe seu nome antes de pedir músicas.'
    if (code === 'DUPLICATE_TRACK') return 'Esta faixa já está na fila.'
    if (code === 'QUEUE_ITEM_NOT_REMOVABLE') return 'A faixa em reprodução não pode ser removida.'
    if (code === 'QUEUE_RESTORE_EXPIRED') return 'O prazo para desfazer a remoção expirou.'
    if (code === 'QUEUE_ITEM_NOT_RESTORABLE') return 'Esta faixa não pode mais ser restaurada.'
    return fallback
  }

  async function add(track: TrackMetadata, placement: 'end' | 'next' = 'end') {
    addingTrackId.value = track.id
    addingPlacement.value = placement
    try {
      queueItemSchema.parse(
        await $fetch(`${apiBase}/queue`, { method: 'POST', body: { track, placement } }),
      )
      applyQueue(queueSchema.parse(await $fetch(`${apiBase}/queue`)))
      toasts.success(
        placement === 'next'
          ? 'Faixa adicionada para tocar em seguida.'
          : 'Faixa adicionada à fila.',
      )
    } catch (caught) {
      toasts.error(mutationError(caught, 'Não foi possível adicionar essa faixa.'))
    } finally {
      addingTrackId.value = undefined
      addingPlacement.value = undefined
    }
  }

  async function remove(id: string) {
    mutatingId.value = id
    try {
      const result = removeQueueItemResultSchema.parse(
        await $fetch(`${apiBase}/queue/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      )
      replace(result.queue)
      toasts.success('Faixa removida.', {
        durationMs: Math.max(0, new Date(result.removal.expiresAt).getTime() - Date.now()),
        action: { label: 'Desfazer', run: () => restore(result.removal.queueItemId) },
      })
    } catch (caught) {
      toasts.error(mutationError(caught, 'Não foi possível remover essa faixa.'))
    } finally {
      mutatingId.value = undefined
    }
  }

  async function restore(id: string) {
    mutatingId.value = id
    try {
      const result = restoreQueueItemResultSchema.parse(
        await $fetch(`${apiBase}/queue/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
      )
      replace(result.queue)
      toasts.success('Faixa restaurada.')
    } catch (caught) {
      toasts.error(mutationError(caught, 'Não foi possível restaurar essa faixa.'))
    } finally {
      mutatingId.value = undefined
    }
  }

  async function move(item: QueueItem, direction: -1 | 1) {
    const currentIndex = items.value.findIndex(({ id }) => id === item.id)
    const newPosition = currentIndex + direction
    if (
      item.status !== 'queued' ||
      currentIndex < 0 ||
      newPosition < 0 ||
      newPosition >= items.value.length ||
      items.value[newPosition]?.status === 'playing'
    )
      return

    mutatingId.value = item.id
    mutationInFlight = true
    try {
      const applied = replace(
        queueSchema.parse(
          await $fetch(`${apiBase}/queue/${encodeURIComponent(item.id)}/move`, {
            method: 'POST',
            body: { newPosition },
          }),
        ),
      )
      if (applied) refreshAfterInteraction = false
      toasts.success('Ordem da fila atualizada.')
    } catch {
      toasts.error('Não foi possível mover essa faixa.')
    } finally {
      mutationInFlight = false
      mutatingId.value = undefined
      refreshPendingQueue()
    }
  }

  async function moveToPosition(fromIndex: number, targetIndex: number) {
    if (
      fromIndex < 0 ||
      fromIndex >= items.value.length ||
      targetIndex < 0 ||
      targetIndex >= items.value.length
    )
      return

    const snapshot = [...items.value]
    const item = items.value[fromIndex]
    if (!item || item.status !== 'queued') return
    const playingOffset = items.value[0]?.status === 'playing' ? 1 : 0
    const adjustedToIndex = Math.max(playingOffset, targetIndex)
    if (adjustedToIndex === fromIndex) return

    const moved = items.value.splice(fromIndex, 1)[0]
    if (!moved) return
    items.value.splice(adjustedToIndex, 0, moved)

    mutatingId.value = item.id
    mutationInFlight = true
    try {
      const applied = replace(
        queueSchema.parse(
          await $fetch(`${apiBase}/queue/${encodeURIComponent(item.id)}/move`, {
            method: 'POST',
            body: { newPosition: adjustedToIndex },
          }),
        ),
      )
      if (applied) refreshAfterInteraction = false
      toasts.success('Ordem da fila atualizada.')
    } catch {
      items.value = snapshot
      toasts.error('Não foi possível reordenar a fila.')
    } finally {
      mutationInFlight = false
      mutatingId.value = undefined
      refreshPendingQueue()
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
    addingPlacement,
    refresh: () => load(true),
    replace,
    add,
    remove,
    restore,
    move,
    moveToPosition,
    setInteractionLocked,
  }
}
