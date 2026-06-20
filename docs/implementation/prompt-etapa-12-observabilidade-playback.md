# Prompt de implementação — Observabilidade do playback da Etapa 12

Continue o projeto Waves em `C:\Users\luiss\Projects\waves` e implemente
observabilidade estruturada para diagnosticar o runtime de voz, resolução de fonte,
streaming e consumo da fila.

Trabalhe somente na Etapa 12. Não implemente a Etapa 13 e não altere
intencionalmente o comportamento funcional do playback neste trabalho.

## Objetivo

Quando uma faixa for adicionada, reivindicada, resolvida, baixada, entregue ao
`AudioPlayer`, iniciada, interrompida, concluída ou marcada como falha, os logs
devem permitir reconstruir a sequência completa sem expor secrets ou URLs.

O projeto já usa Pino:

- bot: `apps/bot/src/logger.ts`;
- web: `apps/web/server/utils/logger.ts`.

Não substitua Pino e não adicione outro logger.

## Leitura obrigatória

Leia integralmente antes de agir:

- `AGENTS.md`;
- `SPEC.md`;
- `docs/specs/02-arquitetura.md`;
- `docs/specs/03-dominio-e-contratos.md`;
- `docs/specs/05-api-e-servicos-web.md`;
- `docs/specs/06-bot-discord.md`;
- `docs/specs/08-configuracao-seguranca-observabilidade.md`;
- `docs/specs/09-qualidade-e-testes.md`;
- `docs/specs/10-plano-de-implementacao.md`;
- `docs/specs/11-criterios-de-aceite.md`;
- `docs/specs/12-decisoes.md`;
- `docs/implementation/etapa-12-reproducao-e-avanco-automatico.md`;
- `docs/implementation/etapa-12-youtube-music.md`;
- todos os arquivos atuais de playback, voz, API client, resolução e logging.

Preserve todas as mudanças não commitadas. Não presuma que o diff representa apenas
este trabalho.

## Estado e problema

O bot entra no canal, adiciona a faixa e reivindica a fila. Em smokes reais,
`playback.started` foi seguido por `playback.finished` em aproximadamente 130–150
ms, sem áudio audível. A fila foi consumida porque o runtime interpretou `Idle`
prematuro como conclusão.

Uma correção parcial já existe no worktree:

- download HTTP segmentado em ranges de 512 KiB;
- `demuxProbe` sobre `Readable`;
- `Idle` com menos de um segundo tratado como falha recuperável.

Essa correção ainda não foi validada novamente no Discord. A falta de logs impede
saber com precisão onde o pipeline termina.

## Requisitos de logging

### Contexto comum

Padronize campos estruturados:

- `service`;
- `operation`;
- `guildId`;
- `voiceChannelId`, quando aplicável;
- `queueItemId`;
- `provider`, sem URL;
- `sourceIdentifier`, somente se for seguro; video ID e Audius track ID são
  permitidos;
- `attempt`;
- `forceRefresh`;
- `playerStatusFrom`;
- `playerStatusTo`;
- `playbackDurationMs`;
- `durationMs`;
- `outcome`;
- `errorCode`;
- `httpStatus`, quando seguro;
- `rangeStart`, `rangeEnd`, `rangeBytes`;
- `contentLength`, sem headers completos;
- `streamType`;
- `correlationId` ou `playbackAttemptId`.

Crie um identificador por tentativa de playback e preserve-o desde o claim até o
resultado final. Não precisa persistir esse identificador no banco.

### Bot

Instrumente:

1. Recebimento e término dos comandos `/play`, `/join`, `/leave` e `/skip`.
2. Resultado da adição à fila, sem registrar a query completa do usuário.
3. Início e resultado de `AudioPlayerManager.start`.
4. Claim:
   - solicitado;
   - item retornado ou fila vazia;
   - conflito/falha.
5. Resolução pela API:
   - início;
   - provider retornado;
   - expiração;
   - refresh forçado;
   - erro seguro.
6. Transporte segmentado:
   - início;
   - cada range solicitado em nível `debug`;
   - status e quantidade de bytes;
   - range inválido, vazio, timeout ou cancelamento;
   - total acumulado ao terminar.
7. `demuxProbe` e criação do `AudioResource`.
8. Toda transição relevante do `AudioPlayer`:
   - Idle, Buffering, Playing, AutoPaused, Paused;
   - status anterior e novo;
   - duração observada;
   - missed frames, quando disponível.
9. Evento `error` do player:
   - nome/código sanitizado;
   - tentativa;
   - decisão de refresh ou falha definitiva.
10. `Idle`:
    - intencional por skip/leave/shutdown;
    - prematuro;
    - conclusão natural;
    - duração usada na classificação.
11. Chamada de complete/fail e item seguinte retornado pela API.
12. Subscription, cleanup, leave, desconexão inesperada e shutdown.

### Web/Nitro

Instrumente:

1. Entrada e resultado das rotas internas de:
   - play;
   - claim;
   - resolve;
   - complete;
   - skip;
   - events.
2. `AudioSourceService`:
   - cache hit/miss/expired;
   - provider e source identifier seguros;
   - refresh do mesmo identificador;
   - substituição da resolução.
3. `FallbackAudioSourceResolver`:
   - provider tentado;
   - duração;
   - resultado seguro;
   - motivo de fallback;
   - falha dos dois providers.
4. Matching YouTube Music:
   - quantidade de candidatos;
   - quantidade rejeitada por categoria;
   - video ID selecionado;
   - score selecionado;
   - ambiguidade.
     Não registre query completa, títulos externos arbitrários ou payloads brutos.
5. Transições de `PlayerState` e `QueueItem`:
   - status anterior e posterior;
   - item concluído;
   - outcome;
   - item promovido.

## Segurança obrigatória

Nunca registre:

- `streamUrl`;
- URL parcial ou hostname de mídia;
- query string assinada;
- headers completos;
- cookies;
- Authorization;
- tokens Discord, Spotify ou internos;
- PO token;
- visitor data;
- player script;
- resposta bruta InnerTube/Audius/Spotify;
- erro bruto que possa conter URL;
- query completa fornecida pelo usuário.

Amplie a configuração `redact` dos dois loggers para cobrir nomes e caminhos
prováveis desses campos, incluindo objetos aninhados.

Crie helpers para sanitizar erros externos. Logs devem registrar somente uma
classificação estável, por exemplo:

- `SOURCE_FETCH_TIMEOUT`;
- `SOURCE_HTTP_STATUS`;
- `SOURCE_INVALID_RANGE`;
- `SOURCE_EMPTY_RANGE`;
- `DEMUX_PROBE_FAILED`;
- `AUDIO_RESOURCE_FAILED`;
- `PLAYER_ERROR`;
- `PREMATURE_IDLE`;
- `PLAYBACK_SYNC_FAILED`.

## Níveis

- `info`: mudanças de estado e marcos de negócio.
- `warn`: retry, fallback, `Idle` prematuro, resposta externa recuperável.
- `error`: falha definitiva ou inconsistência de sincronização.
- `debug`: ranges, detalhes de probe e transições muito frequentes.

Permita configurar nível por `LOG_LEVEL`, validado com Zod, com default:

- `debug` em desenvolvimento;
- `info` fora de desenvolvimento.

Não revele valores inválidos da env na mensagem.

## Testes obrigatórios

Adicione testes para provar:

- sequência de logs de uma reprodução normal;
- sequência de logs de `Idle` prematuro;
- retry com o mesmo item;
- falha definitiva e avanço;
- skip não gera conclusão natural;
- ranges geram logs sem URL;
- fallback YouTube Music → Audius é visível;
- cache hit/miss é visível;
- `streamUrl`, tokens, headers, query assinada e erro bruto não aparecem;
- nível `debug` é configurável;
- logger não altera a lógica existente.

Prefira um logger injetável ou child loggers com bindings. Não faça assertions
frágeis sobre timestamps.

## Smoke manual

Após os testes:

1. iniciar web e bot redirecionando stdout/stderr para arquivos locais ignorados;
2. executar `/join`;
3. adicionar uma faixa;
4. observar claim, resolução, ranges, probe e transições do player;
5. executar `/skip`;
6. executar `/leave`;
7. confirmar que a sequência é reconstruível;
8. executar busca nos logs por padrões proibidos;
9. não publicar os logs no repositório.

Se o playback continuar quebrado, não corrija a reprodução neste prompt. Registre o
primeiro ponto de falha comprovado e encerre este trabalho como observabilidade
implementada, mantendo a Etapa 12 aberta.

## Documentação

Atualize:

- `.env.example`;
- `README.md`;
- `docs/specs/08-configuracao-seguranca-observabilidade.md`;
- `docs/specs/09-qualidade-e-testes.md`;
- `docs/implementation/etapa-12-reproducao-e-avanco-automatico.md`.

Documente os campos, níveis, redactions e como coletar logs para diagnóstico.

## Gates

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

Não declare a Etapa 12 concluída. O resultado deste prompt é somente
observabilidade suficiente para diagnosticar o playback.
