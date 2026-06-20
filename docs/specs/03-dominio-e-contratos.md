# 03 — Domínio e contratos

Todos os schemas vivem em `packages/shared`. Os tipos TypeScript devem ser
inferidos dos schemas Zod sempre que possível.

## TrackMetadata

Representa metadados normalizados de uma faixa.

```ts
{
  id: string
  provider: 'spotify'
  providerTrackId: string
  title: string
  artists: string[]
  albumName?: string
  durationMs: number
  coverUrl?: string
  externalUrl?: string
  isrc?: string
}
```

Regras:

- `id` deve ser estável e pode ser `spotify:{providerTrackId}`.
- `durationMs` deve ser inteiro não negativo.
- `artists` deve conter pelo menos um nome.
- URLs opcionais devem ser URLs válidas.

## QueueItem

```ts
{
  id: string
  track: TrackMetadata
  requestedByDiscordUserId?: string
  requestedByDisplayName?: string
  status: 'queued' | 'playing' | 'played' | 'skipped' | 'failed'
  position: number
  createdAt: string
  updatedAt: string
}
```

Regras:

- Posições ativas são inteiros contíguos iniciando em zero.
- Novos itens entram com status `queued`.
- Datas trafegam em ISO 8601.
- O nome do solicitante pode existir sem ID para ações originadas do painel.

## PlayerState

```ts
{
  status: 'idle' | 'playing' | 'paused' | 'stopped'
  currentQueueItemId?: string
  voiceChannelId?: string
  guildId?: string
  updatedAt: string
}
```

Na fase 1, esse estado era lógico. Na fase 2, o estado persistido continua sendo a
projeção autoritativa, enquanto conexão e reprodução são recursos efêmeros do bot.

Na Etapa 10:

- `idle` com `voiceChannelId` representa bot conectado sem reprodução;
- desconexão limpa `voiceChannelId` e `guildId`;
- ainda não existem transições reais para `playing` por áudio.

## Eventos do bot

Envelope inicial:

```ts
{
  type: string
  occurredAt: string
  guildId?: string
  voiceChannelId?: string
  payload: Record<string, unknown>
}
```

Tipos adicionados na Etapa 10:

- `voice.connected`
- `voice.disconnected`
- `voice.connection_failed`

Tipos adicionados na Etapa 12:

- `playback.started`
- `playback.finished`
- `playback.failed`

Regras:

- eventos `voice.connected` exigem `guildId` e `voiceChannelId`;
- eventos `voice.disconnected` exigem `guildId`;
- falhas expõem somente código seguro e contexto não sensível;
- eventos de voz podem atualizar `PlayerState` por service no Nuxt;
- o bot nunca persiste eventos ou estado diretamente.
- eventos de playback exigem `guildId` e `payload.queueItemId`;
- eventos de playback são observacionais; transições da fila usam operações
  internas atômicas específicas.

## Transições de playback

```ts
CompletePlaybackInput = {
  queueItemId: string
  outcome: 'played' | 'failed'
}
```

`claimPlayback` promove o primeiro item elegível somente quando `PlayerState`
indica conexão de voz. `completePlayback` conclui ou falha o item atual, recalcula
posições e promove o próximo na mesma transação.

## Payloads auxiliares

```ts
MoveQueueItemInput = { newPosition: number }

AddQueueItemInput = {
  track: TrackMetadata
  requestedByDiscordUserId?: string
  requestedByDisplayName?: string
}

BotPlayInput = {
  query: string
  requestedByDiscordUserId: string
  requestedByDisplayName: string
}
```

## Erros HTTP

Formato consistente:

```ts
{
  statusCode: number
  statusMessage: string
  data?: {
    code: string
    details?: unknown
  }
}
```

Códigos previstos:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `TRACK_NOT_FOUND`
- `QUEUE_ITEM_NOT_FOUND`
- `SOURCE_NOT_FOUND`
- `SOURCE_UNAVAILABLE`
- `PLAYBACK_CONFLICT`
- `SPOTIFY_UNAVAILABLE`
- `INTERNAL_ERROR`

## Fonte de áudio resolvida

Contrato interno adicionado na Etapa 11:

```ts
{
  queueItemId: string
  source: {
    provider: 'youtube_music' | 'audius'
    sourceIdentifier: string
    streamUrl: string
    expiresAt: string
  }
}
```

`streamUrl` é dado sensível de runtime: pode trafegar somente pela API interna e
nunca deve aparecer em logs. `expiresAt` é ISO 8601 e determina a validade do cache.

Regras planejadas para YouTube Music:

- `sourceIdentifier` contém somente o video ID, nunca a URL completa;
- `streamUrl` é obtida imediatamente antes do playback e possui TTL curto;
- a resposta bruta do InnerTube não cruza a fronteira do resolver;
- cookies, visitor data, PO tokens e player scripts não fazem parte do contrato;
- o matching continua baseado em metadados Spotify normalizados.

Essas regras foram implementadas na Etapa 12. O provider final indica
`youtube_music` ou `audius` conforme a fonte realmente usada.
