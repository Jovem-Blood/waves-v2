# Próxima etapa — Banco e repositórios

**Status:** concluída em 18 de junho de 2026.

## Objetivo

Implementar a persistência SQLite do Nuxt com Drizzle ORM e criar repositórios
testáveis para fila e estado do player. Esta etapa não cria rotas HTTP nem services
de domínio.

## Pré-condições

- Etapas 0 e 1 concluídas.
- Contratos de `@waves/shared` disponíveis.
- Todos os gates atuais passando.

## Documentação obrigatória

Antes de editar código, consultar com Context7 a documentação atual de:

1. Drizzle ORM com SQLite e `better-sqlite3`.
2. Drizzle Kit para geração e execução de migrações.
3. Integração server-side do Nuxt/Nitro apenas se surgir configuração específica.

## Dependências previstas em `apps/web`

- `drizzle-orm`
- `better-sqlite3`
- `drizzle-kit`
- tipos de `better-sqlite3`, se necessários

Confirmar versões e APIs atuais antes da instalação.

## Estrutura

```text
apps/web/
  drizzle.config.ts
  server/
    db/
      client.ts
      schema.ts
    repositories/
      queue.repository.ts
      player-state.repository.ts
  test/
    repositories/
      queue.repository.test.ts
      player-state.repository.test.ts
```

As migrações geradas devem ficar em um diretório versionado, por exemplo
`apps/web/drizzle`.

## Ordem de implementação

1. [x] Configurar Drizzle Kit e os scripts `db:generate`, `db:migrate` e `db:studio`.
2. [x] Implementar as tabelas `queue_items`, `player_state`, `resolved_sources` e
       `allowed_users`.
3. [x] Criar o client SQLite server-only.
4. [x] Criar uma forma de injetar banco temporário nos testes.
5. [x] Implementar `queue.repository`.
6. [x] Implementar `player-state.repository`.
7. [x] Gerar a migração inicial.
8. [x] Testar persistência, ordenação e singleton do player.

## Contrato do queue repository

Operações mínimas:

- listar itens ativos ordenados por posição.
- buscar item por ID.
- inserir item.
- atualizar status e posição.
- atualizar várias posições em transação.
- remover definitivamente um item.
- listar itens necessários para recálculo.

O repositório não deve:

- recalcular regras de movimento.
- decidir qual faixa será pulada.
- conhecer HTTP ou eventos Nuxt.

## Contrato do player-state repository

Operações mínimas:

- obter o singleton.
- criar o estado inicial `idle` quando ausente.
- atualizar campos do singleton.

## Mapeamento

- Converter `artists` entre `string[]` e JSON de banco.
- Converter linhas para os tipos de `@waves/shared`.
- Datas devem sair como ISO 8601.
- Validar dados nas fronteiras quando isso detectar corrupção ou divergência.

## Testes obrigatórios

- [x] Migração cria as quatro tabelas.
- [x] Inserção e leitura preservam TrackMetadata.
- [x] Listagem retorna apenas itens ativos e ordenados.
- [x] Remoção definitiva funciona.
- [x] Status históricos ficam fora da fila ativa.
- [x] Estado inicial do player é criado uma única vez.
- [x] Atualização do singleton persiste.
- [x] Banco temporário não altera `dev.db`.

## Definição de pronto

- [x] Scripts Drizzle funcionam.
- [x] Migração inicial está versionada.
- [x] Repositórios passam nos testes com SQLite temporário.
- [x] Nenhuma rota ou service contém SQL.
- [x] `pnpm test`, lint, typecheck, build e format check passam.

## Decisões técnicas

- `QueueItem.id` e `TrackMetadata.id` são persistidos separadamente em `id` e
  `track_id`, permitindo itens distintos para a mesma faixa sem perder metadados.
- O client de runtime é singleton, mas `createDatabaseConnection` permite injetar
  `:memory:` nos testes.
- Posições ativas e o item `playing` possuem índices únicos parciais no SQLite.
- Atualizações em lote usam posições temporárias dentro da transação para evitar
  conflitos transitórios de unicidade.

## Referências internas

- [`docs/specs/04-banco-de-dados.md`](../specs/04-banco-de-dados.md)
- [`docs/specs/02-arquitetura.md`](../specs/02-arquitetura.md)
- [`AGENTS.md`](../../AGENTS.md)
