# Próxima etapa — Serviços de domínio

**Status:** concluída em 18 de junho de 2026.

## Objetivo

Implementar as regras da fila e do player em services independentes de HTTP,
Discord e Spotify. A etapa deve coordenar os repositórios da Etapa 2, preservar as
invariantes do banco e manter as operações relacionadas dentro de transações.

## Pré-condições

- Etapas 0, 1 e 2 concluídas.
- Migração inicial aplicada e repositórios validados em SQLite temporário.
- Todos os gates da raiz passando.

## Documentação obrigatória

Antes de editar código, consultar com Context7 a documentação atual de qualquer API
de Drizzle ORM ou SQLite necessária para transações coordenadas. Não é necessário
consultar documentação para regras de negócio puras.

## Escopo

Criar em `apps/web/server/services`:

```text
queue.service.ts
player-state.service.ts
```

Implementado também `server/repositories/unit-of-work.ts` para compartilhar uma
transação Drizzle entre os repositórios sem expor SQL aos services.

Criar testes em `apps/web/test/services` usando banco SQLite em memória e a migração
versionada.

Não criar nesta etapa:

- rotas públicas ou internas;
- integração Spotify;
- bot Discord;
- interface;
- áudio, voz ou resolução de fontes.

## Dependências e testabilidade

- [x] Services recebem repositórios, relógio e gerador de IDs por construtor ou factory.
- [x] Nenhum service abre conexão SQLite diretamente.
- [x] Nenhum service importa APIs HTTP, Nitro ou componentes Vue.
- [x] Testes usam `createDatabaseConnection({ url: ':memory:' })`.
- [x] Datas produzidas usam ISO 8601.
- [x] IDs são determinísticos nos testes.

## `queue.service`

Operações mínimas:

### `list`

- Retornar a fila ativa já ordenada pelo repositório.

### `add`

1. Validar ou receber `AddQueueItemInput` já validado pelo contrato compartilhado.
2. Ler a fila ativa.
3. Criar um `QueueItem` com ID novo, status `queued` e posição igual ao tamanho da
   fila.
4. Usar o mesmo timestamp ISO em `createdAt` e `updatedAt`.
5. Persistir e retornar o item.

### `remove`

1. Confirmar que o item existe.
2. Remover definitivamente.
3. Recalcular posições contíguas dos itens ativos restantes.
4. Persistir a nova ordem em transação.
5. Retornar a fila atualizada.

Definir um erro de domínio explícito para item inexistente; não criar ainda erro
HTTP.

### `move`

1. Ler a fila ativa.
2. Confirmar que o item está ativo.
3. Limitar `newPosition` ao intervalo válido.
4. Remover o item da posição atual e inseri-lo na posição de destino.
5. Recalcular todas as posições a partir de zero.
6. Persistir as posições em uma única transação.
7. Retornar a fila atualizada.

Movimento para a posição atual deve ser idempotente.

## `player-state.service`

Operações mínimas:

### `get`

- Retornar o singleton; o repositório cria `idle` quando ausente.

### `skip`

1. Obter player e fila ativa dentro de uma operação coordenada.
2. Determinar o item atual:
   - usar `currentQueueItemId` quando ele apontar para item ativo;
   - caso contrário, usar o primeiro item ativo;
   - se a fila estiver vazia, persistir `idle` sem item atual.
3. Marcar o item atual como `skipped`.
4. Recalcular posições dos itens ativos restantes.
5. Se houver próximo item:
   - marcá-lo como `playing`;
   - definir `currentQueueItemId`;
   - definir player como `playing`.
6. Se não houver próximo item:
   - limpar `currentQueueItemId`;
   - definir player como `idle`.
7. Persistir mudanças de fila e player atomicamente.
8. Retornar `{ player, queue }`.

Não implementar reprodução real de áudio.

## Fronteira transacional

As operações `remove`, `move` e `skip` precisam ser atômicas. Se os repositórios
atuais não permitirem compartilhar uma transação Drizzle entre múltiplas operações,
adicionar uma abstração pequena no pacote web, mantendo SQL e detalhes do banco fora
dos services. Não duplicar queries nos services.

## Invariantes obrigatórias

- Posições ativas são contíguas e começam em zero.
- Apenas `queued` e `playing` aparecem na fila ativa.
- No máximo um item possui status `playing`.
- `currentQueueItemId` vazio corresponde a player sem item atual.
- `currentQueueItemId`, quando definido, referencia item existente.
- Falhas intermediárias não deixam fila e player parcialmente atualizados.

## Testes obrigatórios

- [x] Adicionar em fila vazia cria posição zero.
- [x] Adicionar em fila existente entra no fim.
- [x] Mover para início, meio e fim recalcula posições.
- [x] Movimento fora do intervalo é limitado.
- [x] Movimento para a posição atual é idempotente.
- [x] Remover primeiro, intermediário e último recalcula posições.
- [x] Remover item inexistente retorna erro de domínio.
- [x] Skip usa o item atual quando válido.
- [x] Skip usa o primeiro ativo quando o player não possui item atual válido.
- [x] Skip preserva histórico com status `skipped`.
- [x] Skip promove o próximo item para `playing`.
- [x] Skip do último item deixa player `idle`.
- [x] Skip em fila vazia é idempotente.
- [x] Uma falha simulada durante operação coordenada causa rollback completo.

## Definição de pronto

- [x] Regras são exercitáveis por chamada direta aos services.
- [x] Nenhum SQL aparece em routes ou services.
- [x] Testes comprovam invariantes e rollback.
- [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` e
      `pnpm format:check` passam.

## Decisões técnicas

- `DatabaseUnitOfWork` cria repositórios vinculados ao mesmo executor transacional.
- Exceções propagadas pelo callback Drizzle acionam rollback; o teste induz falha
  depois das mutações de skip e confirma que fila e player permanecem inalterados.
- `QueueItemNotFoundError` é erro de domínio e ainda não conhece status HTTP.
- Skip usa o item indicado pelo player quando ativo; caso contrário, usa o primeiro
  item ativo da fila.

## Referências internas

- [`docs/specs/02-arquitetura.md`](../specs/02-arquitetura.md)
- [`docs/specs/03-dominio-e-contratos.md`](../specs/03-dominio-e-contratos.md)
- [`docs/specs/04-banco-de-dados.md`](../specs/04-banco-de-dados.md)
- [`docs/specs/05-api-e-servicos-web.md`](../specs/05-api-e-servicos-web.md)
- [`docs/implementation/etapa-02-banco-e-repositorios.md`](etapa-02-banco-e-repositorios.md)
