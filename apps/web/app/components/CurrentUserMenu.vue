<script setup lang="ts">
import type { PublicUser } from '@waves/shared'
import { LogOut } from '@lucide/vue'

import UserAvatar from './UserAvatar.vue'

defineProps<{
  user?: PublicUser | null
  loading: boolean
  disabled?: boolean
}>()

defineEmits<{ logout: [] }>()
</script>

<template>
  <div class="current-user" aria-live="polite">
    <div v-if="loading" class="current-user-loading">
      <span />
      <div><strong>Conectando</strong><small>Visitante</small></div>
    </div>
    <template v-else-if="user">
      <UserAvatar :user="user" />
      <div class="current-user-copy">
        <strong>{{ user.displayName }}</strong>
        <small>Visitante</small>
      </div>
      <button
        class="icon-button current-user-logout"
        type="button"
        :disabled="disabled"
        aria-label="Encerrar sessão"
        @click="$emit('logout')"
      >
        <LogOut :size="17" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.current-user,
.current-user-loading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.current-user {
  justify-content: flex-end;
}

.current-user-copy,
.current-user-loading div {
  display: block;
  max-width: 82px;
  min-width: 0;
}

.current-user-copy strong,
.current-user-loading strong {
  display: block;
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-user-copy small,
.current-user-loading small {
  display: block;
  margin-top: 2px;
  color: var(--accent-tertiary);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 8px;
  text-transform: uppercase;
}

.current-user-loading span {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 50%;
  background: linear-gradient(90deg, var(--surface-strong), var(--surface-muted));
}

.current-user-logout {
  width: 38px;
  min-width: 38px;
  height: 38px;
}

@media (min-width: 48rem) {
  .current-user-copy,
  .current-user-loading div {
    max-width: 140px;
  }
}
</style>
