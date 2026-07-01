import { authUserResponseSchema, meResponseSchema, type PublicUser } from '@waves/shared'
import { computed, onMounted, ref } from 'vue'
import { useToasts } from './useToasts'

export function useAuth(apiBase: string) {
  const toasts = useToasts()
  const user = ref<PublicUser | null>(null)
  const loading = ref(true)
  const submitting = ref(false)
  const error = ref<string>()

  const authenticated = computed(() => user.value !== null)

  async function load() {
    loading.value = true
    try {
      user.value = meResponseSchema.parse(await $fetch(`${apiBase}/me`)).user
      error.value = undefined
    } catch {
      user.value = null
      error.value = 'Não foi possível verificar sua sessão.'
    } finally {
      loading.value = false
    }
  }

  async function createGuest(displayName: string) {
    submitting.value = true
    try {
      const response = authUserResponseSchema.parse(
        await $fetch(`${apiBase}/auth/guest`, {
          method: 'POST',
          body: { displayName },
        }),
      )
      user.value = response.user
      error.value = undefined
    } catch {
      error.value = 'Informe um nome para entrar na fila.'
    } finally {
      submitting.value = false
    }
  }

  async function logout() {
    submitting.value = true
    try {
      await $fetch(`${apiBase}/auth/logout`, { method: 'POST' })
      user.value = null
      toasts.success('Sessão encerrada.')
    } catch {
      toasts.error('Não foi possível encerrar a sessão.')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => {
    void load()
  })

  return {
    user,
    loading,
    submitting,
    error,
    authenticated,
    load,
    createGuest,
    logout,
  }
}
