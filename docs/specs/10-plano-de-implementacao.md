# 10 — Plano de implementação

## Etapa 0 — Fundação do monorepo

Objetivo: criar uma base instalável e verificável.

Entregáveis:

- [x] workspace pnpm.
- [x] manifests raiz, web, bot e shared.
- [x] TypeScript strict.
- [x] ESLint e Prettier.
- [x] scripts raiz.
- [x] `.env.example`.
- [x] README inicial.

Pronto quando:

- [x] `pnpm install`, lint e typecheck funcionam.
- [x] build e verificação de formatação funcionam.
- [x] pnpm reconhece raiz, web, bot e shared.

**Status:** concluída em 18 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-01-contratos-compartilhados.md`](../implementation/etapa-01-contratos-compartilhados.md).

## Etapa 1 — Contratos compartilhados

Objetivo: estabilizar o vocabulário do sistema.

Entregáveis:

- [x] schemas Track, Queue, Player, Events e API Error.
- [x] payloads AddQueueItem, MoveQueueItem e BotPlay.
- [x] tipos inferidos.
- [x] exports públicos.
- [x] testes unitários dos schemas.
- [x] importação de `@waves/shared` validada em web e bot.

Pronto quando:

- [x] web e bot podem importar `packages/shared`.
- [x] testes, lint, typecheck, build e format check passam.

**Status:** concluída em 18 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-02-banco-e-repositorios.md`](../implementation/etapa-02-banco-e-repositorios.md).

## Etapa 2 — Banco e repositórios

Objetivo: criar persistência confiável.

Entregáveis:

- [x] schema Drizzle das quatro tabelas.
- [x] client SQLite server-only e injetável.
- [x] migração inicial versionada.
- [x] queue repository.
- [x] player state repository.
- [x] testes de integração.

Pronto quando:

- [x] fila e player puderem ser lidos e alterados em banco temporário.
- [x] testes, lint, typecheck, build e format check passam.

**Status:** concluída em 18 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-03-servicos-de-dominio.md`](../implementation/etapa-03-servicos-de-dominio.md).

## Etapa 3 — Serviços de domínio

Objetivo: implementar regras sem dependência HTTP.

Entregáveis:

- [x] queue service.
- [x] player state service.
- [x] invariantes e transações.
- [x] testes de adicionar, mover, remover e skip.

Pronto quando:

- [x] todos os fluxos da fila funcionarem por chamada direta aos serviços.
- [x] testes, lint, typecheck, build e format check passam.

**Status:** concluída em 18 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-04-spotify.md`](../implementation/etapa-04-spotify.md).

## Etapa 4 — Spotify

Objetivo: buscar e normalizar faixas.

Entregáveis:

- [x] validação das credenciais.
- [x] Client Credentials Flow.
- [x] cache de token.
- [x] busca e normalização.
- [x] tratamento de falhas.
- [x] testes com HTTP mockado.

Pronto quando:

- [x] uma busca configurada retornar `TrackMetadata[]` com HTTP mockado.
- [x] testes, lint, typecheck, build e format check passam.

**Status:** concluída em 18 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-05-api-publica.md`](../implementation/etapa-05-api-publica.md).

## Etapa 5 — API pública

Objetivo: expor health, busca, fila e player.

Entregáveis:

- [x] todas as rotas públicas.
- [x] validação Zod.
- [x] formato de erros consistente.
- [x] testes de integração.

Pronto quando:

- [x] os fluxos puderem ser executados apenas por HTTP.
- [x] testes, lint, typecheck, build e format check passam.

**Status:** concluída em 18 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-06-api-interna.md`](../implementation/etapa-06-api-interna.md).

## Etapa 6 — API interna

Objetivo: criar a fronteira segura do bot.

Entregáveis:

- [x] middleware/helper bearer.
- [x] queue, play, skip e events internos.
- [x] testes 401 e fluxos autorizados.

Pronto quando:

- [x] um cliente HTTP externo puder operar a fila sem acessar o banco.
- [x] testes, lint, typecheck, build e format check passam.

**Status:** concluída em 18 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-07-bot-waves.md`](../implementation/etapa-07-bot-waves.md).

## Etapa 7 — Bot Waves

Objetivo: conectar Discord aos endpoints internos.

Entregáveis:

- [x] client e bootstrap.
- [x] registro dos cinco comandos.
- [x] handlers e cliente de API.
- [x] respostas e erros amigáveis.
- [x] documentação de registro.

Pronto quando:

- [x] handlers e registro forem validados com dependências mockadas.
- [x] testes, lint, typecheck, build do bot e format check passam.
- [x] build completo da raiz reconfirmado após as Etapas 8 e 9.
- [x] comandos operarem a fila em validação manual no Discord.

**Status:** concluída em 19 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-08-interface-queue-social.md`](../implementation/etapa-08-interface-queue-social.md)
após resolver a divergência registrada entre `DESIGN.md` e `pencil.pen`.

## Etapa 8 — Interface Queue Social

Objetivo: entregar o painel mobile-first escolhido.

Entregáveis:

- [x] layout e tokens visuais.
- [x] música atual.
- [x] fila com remoção e movimento.
- [x] busca inferior e resultados.
- [x] adição e skip.
- [x] polling.
- [x] estados de erro e vazio.
- [x] responsividade.

Pronto quando:

- [x] todos os fluxos web funcionarem em 390×844 e desktop.

**Status:** concluída em 19 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-09-end-to-end-documentacao.md`](../implementation/etapa-09-end-to-end-documentacao.md).

## Etapa 9 — End-to-end e documentação

Objetivo: validar o sistema como um todo.

Entregáveis:

- [x] smoke tests automatizáveis.
- [x] verificação de secrets no cliente e logs.
- [x] README completo.
- [x] setup local reproduzível.
- [x] limitações da fase 1.

Pronto quando:

- [x] todos os critérios de aceite estiverem marcados.

**Status:** concluída em 19 de junho de 2026, com 95 testes aprovados e o fluxo
Discord → bot → API → SQLite confirmado contra a mesma fila do painel web.

## Fase 1

**Status:** concluída em 19 de junho de 2026.

## Fase 2 — Voz e áudio

## Etapa 10 — Fundação de voz

Objetivo: conectar e desconectar o bot com ciclo de vida seguro, ainda sem áudio.

Entregáveis:

- [x] dependência `@discordjs/voice` e diagnóstico de runtime.
- [x] `VoiceManager` e adapter injetável.
- [x] `/join` real com timeout e estado pronto.
- [x] `/leave` real e idempotente.
- [x] limpeza de conexões no shutdown.
- [x] eventos tipados de conexão persistindo canal e guild no Nuxt.
- [x] testes unitários e de integração sem sockets reais.
- [x] validação manual em canal de voz de teste.

Pronto quando:

- [x] o bot entra e sai do canal por slash commands;
- [x] o painel/API refletem conexão e desconexão;
- [x] nenhuma reprodução ou resolução de fonte foi introduzida;
- [x] testes, lint, typecheck, build e format check passam.

**Status:** concluída em 20 de junho de 2026.

**Handoff:** seguir
[`docs/implementation/etapa-10-fundacao-de-voz.md`](../implementation/etapa-10-fundacao-de-voz.md).

## Etapa 11 — Resolução de fonte

- [x] escolher e registrar o provedor de áudio;
- [x] definir `AudioSourceResolver`;
- [x] implementar cache e expiração em `resolved_sources`;
- [x] validar fonte sem iniciar reprodução.
- [x] expor endpoint interno e cliente do bot;
- [x] cobrir matching, cache, renovação, erros e autorização.

**Status:** concluída em 20 de junho de 2026.

**Validação real:** busca pública do Audius retornou uma correspondência controlada
e a URL assinada entregou `206`, `audio/mpeg` e bytes de áudio. A URL não foi
registrada. A busca por uma faixa popular do Spotify retornou apenas covers, o que
confirmou a necessidade de matching conservador e `SOURCE_NOT_FOUND`.

**Handoff:** seguir
[`docs/implementation/etapa-12-reproducao-e-avanco-automatico.md`](../implementation/etapa-12-reproducao-e-avanco-automatico.md).

## Etapa 12 — Reprodução e avanço automático

- [x] criar `AudioPlayer` por guild;
- [x] reproduzir a fonte resolvida;
- [x] coordenar conclusão, falha e próximo item com a API;
- [x] tornar `/play` capaz de iniciar reprodução quando conectado;
- [x] tornar `/skip` capaz de interromper áudio e avançar atomicamente;
- [x] adicionar `@discordjs/opus` e validar FFmpeg/libopus;
- [x] validar pipeline real Audius → FFmpeg → recurso de voz;
- [x] validar reprodução Audius em canal Discord;
- [x] identificar cobertura Audius insuficiente no smoke de produto;
- [x] implementar YouTube Music via `youtubei.js` como provedor primário;
- [x] manter Audius como fallback;
- [x] validar matching e áudio com amostra representativa de catálogo;
- [x] validar conclusão automática e skip no Discord com o provedor primário;
- [x] executar novamente todos os gates após a troca de provedor.

**Status:** concluída em 20 de junho de 2026. O smoke Discord confirmou reprodução
integral, avanço natural, autojoin por `/play`, retomada de fila adicionada pela web,
`/skip`, `/leave` e cancelamento explícito dos ranges. Os gates finais passaram.

**Spec de implementação:** seguir
[`docs/implementation/etapa-12-youtube-music.md`](../implementation/etapa-12-youtube-music.md).

## Etapa 13 — Controles e interface

- pause e resume;
- volume;
- progresso observado;
- atualizar textos e estados do painel Queue Social;
- preservar controles acessíveis e mobile-first.

## Etapa 14 — End-to-end de voz

- validar Discord → voz → fonte → API → SQLite → painel;
- validar reconexão, shutdown e falhas;
- revisar bundle, logs, setup e troubleshooting;
- concluir os critérios de aceite da fase 2.
