import { closeRuntimeDatabase } from '../db/client'

interface RuntimeLifecycleHooks {
  hook(name: 'close', handler: () => void | Promise<void>): void
}

export default function runtimeLifecyclePlugin(nitroApp: { hooks: RuntimeLifecycleHooks }): void {
  nitroApp.hooks.hook('close', () => {
    closeRuntimeDatabase()
  })
}
