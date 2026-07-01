<script setup lang="ts">
import type { PublicUser } from '@waves/shared'
import { computed } from 'vue'

const props = defineProps<{
  user?: PublicUser | null
  displayName?: string
  size?: 'sm' | 'md'
}>()

const seed = computed(() => props.user?.id ?? props.displayName ?? 'Waves')
const label = computed(() => props.user?.displayName ?? props.displayName ?? 'Visitante')

const initials = computed(() => {
  const parts = label.value.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return (parts.length === 0 ? ['W'] : parts).map((part) => part[0]?.toUpperCase()).join('')
})

const variant = computed(() => {
  let hash = 0
  for (const character of seed.value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return `avatar-variant-${(hash % 6) + 1}`
})
</script>

<template>
  <span
    class="user-avatar"
    :class="[variant, size === 'sm' ? 'user-avatar-sm' : 'user-avatar-md']"
    :aria-label="`Avatar de ${label}`"
  >
    <img v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="`Avatar de ${label}`" />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-grid;
  flex: none;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent-secondary) 24%, transparent);
  border-radius: 50%;
  color: var(--text);
  font-family: 'Geist Mono Variable', monospace;
  font-weight: 800;
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent-secondary) 12%, transparent);
}

.user-avatar-sm {
  width: 24px;
  height: 24px;
  font-size: 8px;
}

.user-avatar-md {
  width: 38px;
  height: 38px;
  font-size: 12px;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-variant-1 {
  background: linear-gradient(145deg, var(--accent-primary), var(--surface-strong));
}

.avatar-variant-2 {
  background: linear-gradient(145deg, var(--accent-secondary), var(--surface-strong));
}

.avatar-variant-3 {
  background: linear-gradient(145deg, var(--accent-tertiary), var(--surface-strong));
}

.avatar-variant-4 {
  background: linear-gradient(145deg, var(--accent-primary), var(--accent-secondary));
  color: var(--on-accent);
}

.avatar-variant-5 {
  background: linear-gradient(145deg, var(--accent-secondary), var(--accent-tertiary));
}

.avatar-variant-6 {
  background: linear-gradient(145deg, var(--surface-strong), var(--accent-tertiary));
}
</style>
