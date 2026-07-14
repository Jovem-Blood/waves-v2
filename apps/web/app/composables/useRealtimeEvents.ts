import { realtimeEventSchema, type RealtimeEvent } from '@waves/shared'
import { onMounted, onUnmounted, ref } from 'vue'

interface RealtimeEventHandlers {
  snapshot?: (event: Extract<RealtimeEvent, { type: 'sync.snapshot' }>) => void
  queueUpdated?: (event: Extract<RealtimeEvent, { type: 'queue.updated' }>) => void
  queueItemFailed?: (event: Extract<RealtimeEvent, { type: 'queue.item_failed' }>) => void
  playerUpdated?: (event: Extract<RealtimeEvent, { type: 'player.updated' }>) => void
  statusChanged?: (event: Extract<RealtimeEvent, { type: 'status.changed' }>) => void
}

export function useRealtimeEvents(apiBase: string, handlers: RealtimeEventHandlers) {
  const connected = ref(false)
  const lastError = ref<string>()
  let source: EventSource | undefined

  function dispatch(event: RealtimeEvent) {
    if (event.type === 'sync.snapshot') handlers.snapshot?.(event)
    else if (event.type === 'queue.updated') handlers.queueUpdated?.(event)
    else if (event.type === 'queue.item_failed') handlers.queueItemFailed?.(event)
    else if (event.type === 'player.updated') handlers.playerUpdated?.(event)
    else handlers.statusChanged?.(event)
  }

  function handleMessage(message: MessageEvent<string>) {
    try {
      dispatch(realtimeEventSchema.parse(JSON.parse(message.data)))
      lastError.value = undefined
    } catch {
      lastError.value = 'Evento de sincronizacao invalido.'
    }
  }

  onMounted(() => {
    if (typeof EventSource === 'undefined') return

    source = new EventSource(`${apiBase}/events`)
    source.addEventListener('open', () => {
      connected.value = true
      lastError.value = undefined
    })
    source.addEventListener('error', () => {
      connected.value = false
      lastError.value = 'Sincronizacao em tempo real indisponivel.'
    })
    source.addEventListener('sync.snapshot', handleMessage)
    source.addEventListener('queue.updated', handleMessage)
    source.addEventListener('queue.item_failed', handleMessage)
    source.addEventListener('player.updated', handleMessage)
    source.addEventListener('status.changed', handleMessage)
  })

  onUnmounted(() => {
    connected.value = false
    source?.close()
    source = undefined
  })

  return { connected, lastError }
}
