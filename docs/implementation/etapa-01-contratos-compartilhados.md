# Próxima etapa — Contratos compartilhados

**Status:** concluída em 18 de junho de 2026.

## Objetivo

Implementar em `packages/shared` os schemas Zod e tipos TypeScript que formarão o
contrato único entre frontend, servidor e bot.

## Pré-condições

- A Etapa 0 deve estar integralmente marcada em
  [`docs/specs/10-plano-de-implementacao.md`](../specs/10-plano-de-implementacao.md).
- `pnpm install`, `pnpm lint`, `pnpm typecheck` e `pnpm build` devem passar.

## Ordem de implementação

1. [x] Criar `src/schemas/track.schema.ts`.
2. [x] Criar `src/schemas/queue.schema.ts`.
3. [x] Criar `src/schemas/player.schema.ts`.
4. [x] Criar `src/schemas/events.schema.ts`.
5. [x] Criar schema de erros HTTP.
6. [x] Criar tipos inferidos em `src/types`.
7. [x] Exportar toda a API pública por `src/index.ts`.
8. [x] Adicionar testes unitários de entradas válidas e inválidas.
9. [x] Confirmar que bot e web importam o pacote pelo nome `@waves/shared`.

## Regras

- Zod é a fonte dos tipos sempre que possível.
- Datas atravessam processos como strings ISO 8601.
- Campos opcionais devem respeitar `exactOptionalPropertyTypes`.
- Não adicionar regras de banco, HTTP ou Discord ao pacote.
- Não criar dependências do shared para `apps/*`.

## Definição de pronto

- [x] TrackMetadata, QueueItem, PlayerState e eventos estão especificados e exportados.
- [x] Payloads de adicionar, mover e play interno estão validados.
- [x] Testes dos schemas passam.
- [x] Lint, typecheck, build e format check do monorepo passam.

## Referência

Usar como contrato funcional:
[`docs/specs/03-dominio-e-contratos.md`](../specs/03-dominio-e-contratos.md).
