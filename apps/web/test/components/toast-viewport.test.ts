// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ToastViewport from '../../app/components/ToastViewport.vue'
import { useToasts } from '../../app/composables/useToasts'

afterEach(() => {
  vi.useRealTimers()
  const toasts = useToasts()
  for (const toast of toasts.visible.value) toasts.remove(toast.id)
})

describe('ToastViewport', () => {
  it('renders success and error semantics and expires success after four seconds', async () => {
    vi.useFakeTimers()
    const toasts = useToasts()
    toasts.success('Faixa adicionada à fila.')
    toasts.error('Não foi possível adicionar essa faixa.')
    const wrapper = mount(ToastViewport)

    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(4_000)
    expect(wrapper.text()).not.toContain('Faixa adicionada à fila.')
  })

  it('runs the undo action', async () => {
    const run = vi.fn()
    const toasts = useToasts()
    toasts.success('Faixa removida.', {
      durationMs: 10_000,
      action: { label: 'Desfazer', run },
    })
    const wrapper = mount(ToastViewport)

    await wrapper.get('.toast-action').trigger('click')
    expect(run).toHaveBeenCalledOnce()
  })
})
