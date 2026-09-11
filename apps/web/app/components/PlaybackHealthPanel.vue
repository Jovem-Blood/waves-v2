<script setup lang="ts">
import type { PlaybackHealthResponse } from '@waves/shared'
import { Activity, Clipboard, LoaderCircle, RotateCcw } from '@lucide/vue'

defineProps<{
  data?: PlaybackHealthResponse
  loading: boolean
  error?: string
  days: 7 | 30
  sourceProvider: string
  errorCode: string
}>()

const emit = defineEmits<{
  retry: []
  daysChange: [value: string]
  sourceProviderChange: [value: string]
  errorCodeChange: [value: string]
}>()

function percentage(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  )
}

async function copyAttempt(id: string) {
  await navigator.clipboard?.writeText(id)
}
</script>

<template>
  <section class="health-panel" aria-labelledby="playback-health-title">
    <header class="health-heading">
      <div>
        <p class="eyebrow">Diagnóstico do player</p>
        <h1 id="playback-health-title">Playback Health</h1>
        <p>Entenda falhas, retries e sources sem perder o contexto da fila.</p>
      </div>
      <div class="health-actions">
        <label>
          <span>Período</span>
          <select
            :value="days"
            @change="emit('daysChange', ($event.target as HTMLSelectElement).value)"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
        </label>
        <button class="health-refresh" type="button" @click="emit('retry')">
          <RotateCcw :size="16" aria-hidden="true" />
          Atualizar
        </button>
      </div>
    </header>

    <div v-if="loading" class="state-message" aria-live="polite">
      <LoaderCircle class="spinner" :size="22" aria-hidden="true" />
      Carregando saúde do playback...
    </div>

    <div v-else-if="error" class="state-message error-message" role="alert">
      <span>{{ error }}</span>
      <button class="health-refresh" type="button" @click="emit('retry')">
        <RotateCcw :size="16" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>

    <template v-else-if="data">
      <div class="health-filters" aria-label="Filtros de playback">
        <label>
          <span>Source provider</span>
          <select
            :value="sourceProvider"
            @change="emit('sourceProviderChange', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Todos</option>
            <option
              v-for="provider in data.providers"
              :key="provider.sourceProvider"
              :value="provider.sourceProvider"
            >
              {{ provider.sourceProvider }}
            </option>
          </select>
        </label>
        <label>
          <span>Error code</span>
          <select
            :value="errorCode"
            @change="emit('errorCodeChange', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">Todos</option>
            <option v-for="entry in data.topErrors" :key="entry.errorCode" :value="entry.errorCode">
              {{ entry.errorCode }}
            </option>
          </select>
        </label>
      </div>

      <div class="health-summary" aria-live="polite">
        <article>
          <span>REPRODUÇÕES</span><strong>{{ data.summary.plays }}</strong>
        </article>
        <article>
          <span>SUCESSO</span><strong>{{ percentage(data.summary.successRate) }}</strong>
        </article>
        <article>
          <span>FALHAS</span><strong>{{ data.summary.failures }}</strong>
        </article>
        <article>
          <span>RETRIES</span><strong>{{ data.summary.retries }}</strong>
        </article>
        <article>
          <span>CANCELADAS</span><strong>{{ data.summary.cancelled }}</strong>
        </article>
        <article>
          <span>INCOMPLETAS</span><strong>{{ data.summary.incomplete }}</strong>
        </article>
        <article>
          <span>SEM HEARTBEAT</span><strong>{{ data.summary.stale }}</strong>
        </article>
        <article>
          <span>ÓRFÃS RECONCILIADAS</span><strong>{{ data.summary.orphaned }}</strong>
        </article>
      </div>
      <p class="health-count">
        Sucesso = concluídas com sucesso / (sucessos + falhas terminais). Incompletas e interrupções
        intencionais ficam fora dessa taxa. Tentativas sem heartbeat por 2 minutos são
        reconciliadas; reproduções pausadas mantêm heartbeat.
      </p>

      <div v-if="!data.problematicTracks.length" class="state-message" aria-live="polite">
        <Activity :size="20" aria-hidden="true" />
        Nenhuma falha terminal no período.
      </div>

      <section v-else class="health-table-section" aria-labelledby="problematic-tracks-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Sinais de atenção</p>
            <h2 id="problematic-tracks-title">Músicas problemáticas</h2>
          </div>
          <span class="health-count">{{ data.problematicTracks.length }} faixas</span>
        </div>
        <div class="health-table" role="table" aria-label="Músicas problemáticas">
          <div class="health-table-head" role="row">
            <span role="columnheader">Faixa</span>
            <span role="columnheader">Execuções</span>
            <span role="columnheader">Falhas</span>
            <span role="columnheader">Taxa</span>
            <span role="columnheader">Principal erro</span>
            <span role="columnheader">Última ocorrência</span>
          </div>
          <article
            v-for="track in data.problematicTracks"
            :key="track.trackId"
            class="health-row"
            role="row"
          >
            <div class="health-track" role="cell">
              <strong>{{ track.trackTitle }}</strong>
              <span>{{ track.trackArtists }}</span>
            </div>
            <span role="cell">{{ track.executions }}</span>
            <span class="health-danger" role="cell">{{ track.failures }}</span>
            <span class="health-danger" role="cell">{{ percentage(track.failureRate) }}</span>
            <code role="cell">{{ track.primaryErrorCode ?? '—' }}</code>
            <div class="health-last" role="cell">
              <time :datetime="track.lastOccurrence">{{ formatDate(track.lastOccurrence) }}</time>
              <button
                v-if="track.playbackAttemptId"
                class="attempt-copy"
                type="button"
                :aria-label="`Copiar playbackAttemptId ${track.playbackAttemptId}`"
                @click="copyAttempt(track.playbackAttemptId)"
              >
                <Clipboard :size="14" aria-hidden="true" />
              </button>
            </div>
          </article>
        </div>
      </section>

      <section
        v-if="data.recentFailures.length"
        class="recent-failures"
        aria-labelledby="recent-failures-title"
      >
        <div class="section-heading">
          <div>
            <p class="eyebrow">Investigação</p>
            <h2 id="recent-failures-title">Falhas recentes</h2>
          </div>
        </div>
        <ul>
          <li v-for="failure in data.recentFailures" :key="failure.playbackAttemptId">
            <span
              ><strong>{{ failure.trackTitle }}</strong> · {{ failure.trackArtists }}</span
            >
            <code>{{ failure.errorCode ?? 'UNKNOWN' }}</code>
            <span class="failure-context">
              Provedor: {{ failure.sourceProvider ?? 'desconhecido' }} · Etapa:
              {{ failure.failureStage ?? 'desconhecida' }} · Classe:
              {{ failure.failureClass ?? 'desconhecida' }} · HTTP: {{ failure.httpStatus ?? '—' }}
            </span>
            <time :datetime="failure.occurredAt">{{ formatDate(failure.occurredAt) }}</time>
            <button type="button" @click="copyAttempt(failure.playbackAttemptId)">
              <Clipboard :size="14" aria-hidden="true" />
              Copiar ID
            </button>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.health-panel {
  display: grid;
  gap: 18px;
  padding: 18px;
}
.health-heading,
.section-heading,
.health-actions,
.health-last {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.health-heading {
  align-items: flex-start;
}
.health-heading h1,
.section-heading h2 {
  margin: 0;
  font-family: 'Geist Variable', sans-serif;
}
.health-heading h1 {
  font-size: 28px;
  line-height: 1.1;
}
.section-heading h2 {
  font-size: 18px;
}
.health-heading p:not(.eyebrow) {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}
.health-actions,
.health-filters {
  flex-wrap: wrap;
}
.health-actions label,
.health-filters label {
  display: grid;
  gap: 5px;
}
.health-actions label span,
.health-filters label span {
  color: var(--text-subtle);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}
select,
.health-refresh {
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-raised);
  padding: 0 11px;
}
.health-refresh {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
.health-refresh:hover {
  border-color: var(--border-strong);
}
.health-filters {
  display: flex;
  gap: 10px;
}
.health-filters select {
  min-width: 150px;
}
.health-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.health-summary article {
  display: grid;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  background: var(--surface-raised);
}
.health-summary span,
.health-table-head {
  color: var(--text-subtle);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
  font-weight: 750;
}
.health-summary strong {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 22px;
}
.health-table-section,
.recent-failures {
  display: grid;
  gap: 10px;
}
.health-count {
  color: var(--text-muted);
  font-size: 11px;
}
.health-table {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.health-table-head,
.health-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 76px 62px 62px 170px 170px;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
}
.health-table-head {
  background: var(--surface-strong);
  text-transform: uppercase;
}
.health-row {
  min-height: 68px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
}
.health-track {
  display: grid;
  min-width: 0;
  gap: 4px;
  font-family: 'Inter Variable', sans-serif;
}
.health-track strong {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.health-track span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
}
.health-danger {
  color: var(--danger);
}
code {
  overflow: hidden;
  color: var(--accent-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
}
.health-last {
  justify-content: flex-start;
}
.attempt-copy,
.recent-failures button {
  display: inline-flex;
  min-width: 32px;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  background: var(--surface);
  cursor: pointer;
}
.recent-failures ul {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
}
.recent-failures li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 11px 14px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
}
.recent-failures li:first-child {
  border-top: 0;
}
.recent-failures strong {
  color: var(--text);
}
.recent-failures time {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 9px;
}
.failure-context {
  grid-column: 1 / -1;
  overflow-wrap: anywhere;
}
@media (max-width: 71.99rem) {
  .health-heading {
    flex-direction: column;
  }
}
@media (min-width: 72rem) {
  .health-panel {
    max-width: 1360px;
    margin: 0 auto;
    padding: 24px;
  }
  .health-summary {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 47.99rem) {
  .health-table-head {
    display: none;
  }
  .health-row {
    grid-template-columns: 1fr auto;
    gap: 5px 12px;
  }
  .health-row > span,
  .health-row > code,
  .health-last {
    justify-self: end;
  }
  .health-row > span::before {
    content: '';
  }
  .health-row > span:nth-child(2)::before {
    content: 'Execuções ';
    color: var(--text-subtle);
  }
  .health-row > span:nth-child(3)::before {
    content: 'Falhas ';
    color: var(--text-subtle);
  }
  .health-row > span:nth-child(4)::before {
    content: 'Taxa ';
    color: var(--text-subtle);
  }
  .health-row > code {
    grid-column: 1 / -1;
    justify-self: start;
  }
  .health-last {
    grid-column: 1 / -1;
    justify-self: start;
  }
  .recent-failures li {
    grid-template-columns: 1fr auto;
  }
  .recent-failures time {
    grid-column: 1;
  }
  .recent-failures button {
    grid-column: 2;
    grid-row: 2;
  }
}
</style>
