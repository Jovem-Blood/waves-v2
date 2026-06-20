import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '#imports': fileURLToPath(new URL('./test/nuxt-imports.mock.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
})
