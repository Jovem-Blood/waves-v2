import { historyPageSchema, type HistoryPage, type QueueItem } from '@waves/shared'
import { onMounted, ref } from 'vue'

export function useHistory(apiBase: string) {
  const items = ref<QueueItem[]>([])
  const loading = ref(true)
  const loadingMore = ref(false)
  const error = ref<string>()
  const cursor = ref<string | null>(null)
  const loaded = ref(false)
  let requestInFlight = false

  const hasMore = ref(true)

  async function fetchPage(nextCursor?: string): Promise<HistoryPage> {
    return historyPageSchema.parse(
      await $fetch(`${apiBase}/history`, {
        ...(nextCursor ? { query: { cursor: nextCursor } } : {}),
      }),
    )
  }

  async function loadInitial() {
    if (requestInFlight) return
    requestInFlight = true
    loading.value = true
    error.value = undefined

    try {
      const page = await fetchPage()
      items.value = page.items
      cursor.value = page.nextCursor
      hasMore.value = page.nextCursor !== null
      loaded.value = true
    } catch {
      error.value = 'Não foi possível carregar o histórico.'
    } finally {
      requestInFlight = false
      loading.value = false
    }
  }

  async function loadMore() {
    if (requestInFlight || loading.value || loadingMore.value || !hasMore.value || !cursor.value) {
      return
    }

    requestInFlight = true
    loadingMore.value = true
    error.value = undefined

    try {
      const page = await fetchPage(cursor.value)
      items.value = [...items.value, ...page.items]
      cursor.value = page.nextCursor
      hasMore.value = page.nextCursor !== null
    } catch {
      error.value = 'Não foi possível carregar mais histórico.'
    } finally {
      requestInFlight = false
      loadingMore.value = false
    }
  }

  function retry() {
    if (!loaded.value) {
      void loadInitial()
      return
    }
    void loadMore()
  }

  onMounted(() => {
    void loadInitial()
  })

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore,
    loadInitial,
    loadMore,
    retry,
  }
}
