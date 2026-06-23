import { computed, ref } from 'vue'

export type ToastTone = 'success' | 'error'

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface Toast {
  id: string
  message: string
  tone: ToastTone
  durationMs: number
  action?: ToastAction
}

interface ToastTimer {
  remainingMs: number
  startedAt: number
  handle?: ReturnType<typeof setTimeout>
}

const MAX_VISIBLE = 3
const queue = ref<Toast[]>([])
const timers = new Map<string, ToastTimer>()

function remove(id: string) {
  const timer = timers.get(id)
  if (timer?.handle) clearTimeout(timer.handle)
  timers.delete(id)
  queue.value = queue.value.filter((toast) => toast.id !== id)
  startVisibleTimers()
}

function startTimer(toast: Toast) {
  if (timers.has(toast.id)) return
  const timer: ToastTimer = { remainingMs: toast.durationMs, startedAt: Date.now() }
  timer.handle = setTimeout(() => remove(toast.id), timer.remainingMs)
  timers.set(toast.id, timer)
}

function startVisibleTimers() {
  for (const toast of queue.value.slice(0, MAX_VISIBLE)) startTimer(toast)
}

function push(
  message: string,
  tone: ToastTone,
  options: { durationMs?: number; action?: ToastAction } = {},
) {
  const toast: Toast = {
    id: crypto.randomUUID(),
    message,
    tone,
    durationMs: options.durationMs ?? (tone === 'success' ? 4_000 : 6_000),
    ...(options.action === undefined ? {} : { action: options.action }),
  }
  queue.value = [...queue.value, toast]
  startVisibleTimers()
  return toast.id
}

function pause(id: string) {
  const timer = timers.get(id)
  if (!timer?.handle) return
  clearTimeout(timer.handle)
  timer.handle = undefined
  timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt))
}

function resume(id: string) {
  const timer = timers.get(id)
  if (!timer || timer.handle) return
  timer.startedAt = Date.now()
  timer.handle = setTimeout(() => remove(id), timer.remainingMs)
}

export function useToasts() {
  return {
    visible: computed(() => queue.value.slice(0, MAX_VISIBLE)),
    success: (message: string, options?: { durationMs?: number; action?: ToastAction }) =>
      push(message, 'success', options),
    error: (message: string) => push(message, 'error'),
    remove,
    pause,
    resume,
  }
}
