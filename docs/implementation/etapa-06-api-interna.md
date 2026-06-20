# Próxima etapa — API interna

**Status:** concluída em 18 de junho de 2026.

## Objetivo

Criar a fronteira HTTP privada usada pelo bot Discord, protegida por bearer token e
reutilizando exatamente os mesmos services de fila, player e Spotify da API pública.

## Pré-condições

- Etapas 0 a 5 concluídas.
- Rotas públicas e tradução de erros validadas por HTTP.
- `INTERNAL_API_TOKEN` definido no ambiente local.
- Todos os gates da raiz passando.

## Documentação obrigatória

Antes de editar código, consultar com Context7 a documentação atual de Nuxt
4/Nitro/H3 para middleware, leitura de headers, status 202 e testes HTTP. Consultar
Pino caso ele seja adicionado para registro estruturado de eventos.

## Escopo

Implementar:

```text
GET  /api/internal/bot/queue
POST /api/internal/bot/play
POST /api/internal/bot/skip
POST /api/internal/bot/events
```

Todas as rotas exigem:

```http
Authorization: Bearer ${INTERNAL_API_TOKEN}
```

Não implementar nesta etapa:

- processo ou comandos Discord;
- interface;
- áudio, voz ou resolução de fontes;
- acesso do bot ao SQLite.

## Configuração

- Validar `INTERNAL_API_TOKEN` com Zod no servidor.
- Rejeitar valor ausente ou vazio sem revelar configuração.
- Permitir injetar o token esperado nos testes.
- Nunca aceitar token por query string ou body.

## Autorização

Criar helper ou middleware server-only que:

1. Leia somente o header `Authorization`.
2. Exija exatamente o esquema `Bearer`.
3. Compare o token recebido com o esperado de forma resistente a timing quando os
   comprimentos forem compatíveis.
4. Retorne `401 UNAUTHORIZED` para header ausente, malformado ou inválido.
5. Nunca registre nem inclua o valor recebido em erros.

As rotas internas não devem duplicar essa lógica.

## Rotas

### `GET /api/internal/bot/queue`

- Reutilizar `QueueService.list`.
- Retornar a mesma fila ativa da API pública.

### `POST /api/internal/bot/play`

1. Validar `botPlayInputSchema`.
2. Buscar faixas com `SpotifyService.searchTracks`.
3. Selecionar o primeiro resultado.
4. Se não houver resultado, retornar `404 TRACK_NOT_FOUND`.
5. Adicionar via `QueueService.add`, preservando ID e display name do solicitante.
6. Retornar `{ item, track }`, validado com schemas compartilhados.

Criar erro de domínio `TrackNotFoundError`; a rota não deve decidir status HTTP
diretamente.

### `POST /api/internal/bot/skip`

- Reutilizar `PlayerStateService.skip`.
- Retornar o mesmo `{ player, queue }` da rota pública.

### `POST /api/internal/bot/events`

- Validar `botEventSchema`.
- Registrar somente campos seguros e estruturados.
- Retornar status `202` e um acknowledgement mínimo.
- Não persistir eventos nesta etapa.

## Erros

Estender o tradutor central:

- autenticação ausente/inválida → `401 UNAUTHORIZED`;
- ausência de resultado → `404 TRACK_NOT_FOUND`;
- demais validações e falhas mantêm os mapeamentos existentes.

Todas as respostas devem passar por `apiErrorSchema`.

## Testes obrigatórios

- [x] Cada endpoint retorna 401 sem header.
- [x] Cada endpoint retorna 401 para esquema malformado.
- [x] Cada endpoint retorna 401 para token inválido.
- [x] Token válido autoriza a operação.
- [x] Token em query string não autoriza.
- [x] Queue interna corresponde à fila pública.
- [x] Play rejeita payload inválido e campos extras.
- [x] Play busca, seleciona o primeiro resultado e adiciona solicitante.
- [x] Play sem resultado retorna `TRACK_NOT_FOUND`.
- [x] Skip interno produz o mesmo estado da rota pública.
- [x] Events rejeita envelope inválido.
- [x] Events retorna 202 para envelope válido.
- [x] Logs de events não contêm token, Authorization ou payload bruto.
- [x] Nenhuma rota interna contém SQL.
- [x] O pacote bot continua sem importar banco, Drizzle ou better-sqlite3.

## Definição de pronto

- [x] Cliente HTTP externo autorizado opera fila e player.
- [x] Requests não autorizados não executam services.
- [x] Rotas internas reutilizam contratos e services existentes.
- [x] Erros seguem `apiErrorSchema`.
- [x] Nenhum secret aparece em resposta ou logs.
- [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` e
      `pnpm format:check` passam.

## Decisões técnicas

- O bearer é validado antes de ler body ou executar dependências.
- Tokens de mesmo comprimento são comparados com `timingSafeEqual`.
- A configuração `INTERNAL_API_TOKEN` é validada com Zod e nunca aparece em erros.
- Pino usa redaction defensiva; o endpoint de eventos envia ao logger somente tipo,
  horário, guild e canal de voz.
- `TrackNotFoundError` é erro de domínio traduzido centralmente para
  `TRACK_NOT_FOUND`.

## Referências internas

- [`docs/specs/03-dominio-e-contratos.md`](../specs/03-dominio-e-contratos.md)
- [`docs/specs/05-api-e-servicos-web.md`](../specs/05-api-e-servicos-web.md)
- [`docs/specs/06-bot-discord.md`](../specs/06-bot-discord.md)
- [`docs/specs/08-configuracao-seguranca-observabilidade.md`](../specs/08-configuracao-seguranca-observabilidade.md)
- [`docs/implementation/etapa-05-api-publica.md`](etapa-05-api-publica.md)
