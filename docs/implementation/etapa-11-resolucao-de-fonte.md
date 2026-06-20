# Etapa 11 — Resolução de fonte

## Resultado

Etapa concluída em 20 de junho de 2026 sem iniciar reprodução.

## Implementado

- Audius registrado em `D-013`;
- contrato compartilhado de fonte resolvida;
- `AudioSourceResolver` e adaptador Audius injetáveis;
- validação Zod das respostas externas;
- matching conservador de título, artista e duração;
- rejeição de covers/remixes não solicitados, streams gated e resultados ambíguos;
- repository/service de `resolved_sources`, sem nova migração;
- cache válido por cinco minutos e renovação após expiração;
- `POST /api/internal/bot/sources/:queueItemId/resolve`;
- método correspondente no cliente HTTP do bot;
- erros seguros `SOURCE_NOT_FOUND` e `SOURCE_UNAVAILABLE`;
- testes de contrato, cliente, resolver, repository, service, API e bot.

## Validação real

O endpoint público do Audius respondeu sem credencial usando `app_name=Waves`.
Uma faixa controlada foi encontrada e a URL assinada entregou:

- status `206 Partial Content`;
- `Content-Type: audio/mpeg`;
- 1.024 bytes solicitados por range.

A URL assinada não foi exibida nem registrada. Uma busca por faixa popular do
Spotify retornou somente covers; isso validou operacionalmente a política de falhar
com segurança quando artista, versão ou duração não correspondem.

## Limites preservados

- Spotify não é tratado como fonte de áudio.
- O bot não acessa SQLite/Drizzle.
- Não há `AudioPlayer`, `AudioResource`, FFmpeg ou codec novo.
- `/play`, `/skip` e a fila não iniciam reprodução.
- Não há download permanente.

## Gates

Os cinco gates da raiz passaram em 20 de junho de 2026:

```bash
pnpm test          # 119 testes: 88 web, 20 bot e 11 shared
pnpm lint          # passou
pnpm typecheck     # passou
pnpm build         # passou
pnpm format:check  # passou
```

O Vitest web e o rastreamento Nitro precisaram ser executados fora do sandbox local
por bloqueios de leitura do ambiente, sem mudança de código para contornar essas
permissões.
