# Etapa 13 — Controles e interface

## Pré-requisito

Cumprido em 20 de junho de 2026: a Etapa 12 foi encerrada após smoke Discord e
gates completos.

## Handoff recebido da Etapa 12

- Nuxt continua como fonte da verdade da fila e do player;
- YouTube Music via `youtubei.js` 17.0.1 é o provedor primário;
- Audius permanece fallback;
- o bot recebe somente `ResolvedAudioSource`;
- pause, resume, volume, progresso e alterações de UI não foram antecipados;
- preservar o runtime de playback, refresh, skip e avanço automático existentes.
- preservar autojoin de `/play`, retomada de fila web e cancelamento explícito em
  skip, leave e shutdown;
- não executar duas instâncias do bot com o mesmo token durante validações.

## Objetivo

Adicionar pause, resume, volume e progresso observável, refletindo esses estados no
painel Queue Social sem transferir ao bot a propriedade persistida do player.

## Escopo previsto

- contratos e eventos de pause/resume;
- volume controlado no runtime e projetado pelo Nuxt;
- progresso periódico com frequência limitada;
- endpoints internos e públicos necessários;
- controles acessíveis no painel mobile-first;
- estados loading, disabled e erro;
- validação mobile, intermediária e desktop conforme `DESIGN.md` e `pencil.pen`.

## Fora do escopo

- novo provedor de áudio;
- seek arbitrário sem decisão específica;
- filas independentes por guild;
- autenticação web.

## Execução em 20 de junho de 2026

### Implementado

- `PlayerState` persistido com `volume` (0–100) e `progressMs`;
- migração incremental `0001_player_controls`;
- pause idempotente, resume validado, volume validado e progresso monotônico
  limitado à duração;
- rotas públicas de pause, resume e volume;
- rotas internas de leitura do player e atualização limitada de progresso;
- eventos de pause, resume e volume;
- `AudioResource` com volume inline;
- sincronização do runtime a cada ciclo do reconciliador existente;
- comandos Discord `/pause`, `/resume` e `/volume`;
- painel com pause/resume, skip, volume, progresso determinado e estados
  loading/disabled/erro;
- reset de progresso em claim, skip, conclusão e desconexão.

### Validação automatizada

- `pnpm test`: 185 testes aprovados;
- `pnpm lint`: aprovado;
- `pnpm typecheck`: aprovado;
- `pnpm format:check`: aprovado;
- dependency report: `@discordjs/voice` 0.19.2, `@discordjs/opus` 0.10.0,
  FFmpeg 8.1.1 e `libopus`;
- Context7 resolveu os IDs atuais de Nuxt 4 e `@discordjs/voice`, mas a consulta
  dos documentos foi bloqueada por quota mensal.

### Validação final

- `pnpm build`: aprovado após resolução do bloqueio operacional;
- validação visual mobile, intermediária e desktop: aprovada;
- smoke Discord: pause idempotente, resume, volume mínimo/máximo, progresso,
  conclusão após resume, skip/leave pausado e retomada aprovados;
- logs do smoke revisados sem secrets.

## Estado

Etapa 13 concluída em 20 de junho de 2026.

**Handoff:** seguir
[`etapa-14-end-to-end-de-voz.md`](etapa-14-end-to-end-de-voz.md).
