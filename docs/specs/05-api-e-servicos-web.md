# 05 — API e serviços web

## Rotas públicas

### `GET /api/health`

Resposta:

```json
{ "ok": true }
```

### `GET /api/spotify/search?q=`

- Exige `q` não vazio.
- Usa Spotify Client Credentials no servidor.
- Retorna `TrackMetadata[]`.
- Limite inicial sugerido: 10 resultados.
- Não expõe credenciais nem token do Spotify.

### `GET /api/queue`

- Retorna somente itens ativos.
- Ordena por `position` crescente.

### `POST /api/queue`

- Valida `AddQueueItemInput`.
- Insere no fim.
- Retorna o item criado.

### `DELETE /api/queue/:id`

- Remove definitivamente o item solicitado.
- Recalcula posições.
- Retorna a fila atualizada.

### `POST /api/queue/:id/move`

- Valida `{ newPosition }`.
- Limita a posição ao intervalo válido.
- Reordena em transação.
- Retorna a fila atualizada.

### `GET /api/player`

- Retorna o estado atual, criando estado inicial quando necessário.

### `POST /api/player/skip`

- Marca o item atual como `skipped`.
- Na ausência de item atual, usa o primeiro item ativo.
- Define o próximo item como estado lógico atual, se houver.
- Retorna `{ player, queue }`.

## Rotas internas do bot

Todas exigem:

```http
Authorization: Bearer ${INTERNAL_API_TOKEN}
```

### `GET /api/internal/bot/queue`

Retorna a mesma fila do endpoint público.

### `POST /api/internal/bot/play`

1. Valida o solicitante e a query.
2. Busca no Spotify.
3. Seleciona o primeiro resultado.
4. Adiciona à fila.
5. Retorna `{ item, track }`.

Se não houver resultado, retorna `404 TRACK_NOT_FOUND`.

### `POST /api/internal/bot/skip`

Executa exatamente o mesmo serviço usado por `/api/player/skip`.

### `POST /api/internal/bot/events`

Valida o envelope de evento, registra com pino e retorna `202`.

Na Etapa 10, eventos tipados de voz também atualizam a projeção persistida:

- `voice.connected`: define `guildId` e `voiceChannelId`, mantendo status `idle`;
- `voice.disconnected`: limpa guild/canal e mantém status `idle`;
- quando há item `playing`, `voice.disconnected` também o devolve para `queued`
  atomicamente, preservando a posição ativa;
- `voice.connection_failed`: registra somente código seguro, sem alterar para um
  estado conectado.

Essa rota permanece fina; a transição pertence ao `player-state.service`.

### `POST /api/internal/bot/sources/:queueItemId/resolve`

- exige o mesmo bearer interno;
- valida o item da fila;
- reutiliza `resolved_sources` quando a resolução ainda não expirou;
- consulta a cadeia YouTube Music → Audius quando ausente ou expirada;
- retorna o contrato normalizado de fonte reproduzível;
- retorna `404 SOURCE_NOT_FOUND` quando não há correspondência conservadora;
- retorna `503 SOURCE_UNAVAILABLE` para falha ou resposta inválida do provedor.

A rota não inicia reprodução e não registra `streamUrl`.

O body aceita `{ forceRefresh?: boolean }`. O bot usa refresh forçado no máximo uma
vez ao recuperar falha do recurso.

### `POST /api/internal/bot/playback/claim`

- exige bearer interno;
- retorna o item atual quando já existe playback autoritativo;
- caso contrário, promove o primeiro item da fila somente se voz estiver conectada;
- atualiza fila e `PlayerState` atomicamente.

### `POST /api/internal/bot/playback/complete`

- valida `CompletePlaybackInput`;
- marca o item atual como `played` ou `failed`;
- recalcula posições;
- promove o próximo item;
- retorna a nova fila, player e próximo item na mesma operação.

Uma tentativa de concluir item ativo diferente do item atual retorna
`409 PLAYBACK_CONFLICT`.

## Serviços

### `spotify.service`

- Obter e armazenar token em memória.
- Renovar antes da expiração.
- Buscar faixas.
- Normalizar resposta.
- Traduzir falhas externas para erros internos.

### `queue.service`

- Listar, adicionar, remover e mover.
- Garantir invariantes de posição.
- Coordenar transações.

### `player-state.service`

- Consultar estado.
- Executar skip lógico.
- Sincronizar item atual e fila.
- Reivindicar o próximo item para playback.
- Concluir/falhar e avançar atomicamente.

### `audio-source.service`

- Coordenar item da fila, cache e renovação.
- Persistir somente o resultado normalizado.
- Manter `AudioSourceResolver` injetável e independente de HTTP/Nitro.

### `AudiusAudioSourceResolver`

- Buscar por título e artistas.
- Rejeitar streams gated, covers/remixes não solicitados e divergências relevantes
  de artista ou duração.
- Aplicar TTL conservador de cinco minutos à URL assinada.
- Traduzir respostas externas inválidas sem expor URL ou payload.

O adaptador permanece implementado como fallback. O smoke manual confirmou que ele
não possui cobertura suficiente para ser a fonte principal do Waves.

### `YouTubeMusicAudioSourceResolver`

- Usar `youtubei.js`, sem `play-dl` ou `@distube/ytdl-core`.
- Pesquisar pelo cliente YouTube Music com filtro de músicas.
- Usar título, artistas, duração e ISRC, quando disponível, para ranquear candidatos.
- Preferir músicas oficiais, canais Topic e gravações de catálogo.
- Rejeitar cover, remix, live, karaoke, instrumental, slowed, sped-up e lyric video
  quando esses qualificadores não existirem nos metadados Spotify.
- Obter formato somente após selecionar o video ID.
- Selecionar formato somente de áudio, sem DRM e compatível com FFmpeg.
- Normalizar o resultado para o contrato `ResolvedAudioSource`.
- Traduzir bloqueio, challenge, ausência de formato ou resposta inválida para erros
  seguros.
- Na versão 17.0.1, executar o trecho mínimo de decifração extraído pelo YouTube.js
  em `node:vm`, com contexto reduzido e timeout.

### Cadeia de resolução

1. Reutilizar cache válido do provedor persistido.
2. Quando ausente ou expirado, tentar YouTube Music.
3. Usar Audius somente quando YouTube Music retornar ausência de candidato seguro
   ou indisponibilidade classificada como recuperável.
4. Se ambos falharem, retornar `SOURCE_NOT_FOUND` ou `SOURCE_UNAVAILABLE`.
5. `forceRefresh` renova a URL do mesmo provedor antes de mudar de provedor, salvo
   falha explicitamente não recuperável.

O fluxo foi validado com 10/10 candidatos e 10/10 streams abertos em 20 de junho de 2026. O relatório não contém URLs de mídia.

## Cache do Spotify

O token deve ser mantido em memória com:

- `accessToken`
- `expiresAt`

Deve ser renovado quando ausente ou próximo de expirar. O cache é por processo e
não precisa ser persistido.
