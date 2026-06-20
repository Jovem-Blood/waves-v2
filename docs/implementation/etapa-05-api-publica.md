# Próxima etapa — API pública

**Status:** concluída em 18 de junho de 2026.

## Objetivo

Expor por rotas Nitro os fluxos públicos de health, busca Spotify, fila e player,
usando os services existentes. Rotas devem permanecer finas, validar entrada com
Zod e traduzir erros internos para o contrato `ApiError`.

## Pré-condições

- Etapas 0 a 4 concluídas.
- Banco, repositories, services de domínio e Spotify service validados.
- Todos os gates da raiz passando.

## Documentação obrigatória

Antes de editar código, consultar com Context7 a documentação atual de:

1. Nuxt 4/Nitro para handlers, params, query, body e status de resposta.
2. Ferramentas atuais de teste de rotas Nuxt/Nitro.
3. Zod somente se surgir API ainda não usada no projeto.

## Escopo

Implementar:

```text
GET    /api/health
GET    /api/spotify/search?q=
GET    /api/queue
POST   /api/queue
DELETE /api/queue/:id
POST   /api/queue/:id/move
GET    /api/player
POST   /api/player/skip
```

Não implementar nesta etapa:

- endpoints internos do bot;
- autenticação bearer;
- bot Discord;
- interface;
- áudio ou voz.

## Composição de dependências

- Criar factories ou helpers server-only para montar database, repositories,
  unit of work e services.
- Reutilizar a conexão singleton do runtime.
- Rotas não devem construir queries Drizzle nem duplicar regras.
- Spotify deve usar `parseSpotifyConfig`, `SpotifyClient` e `SpotifyService`.
- Manter dependências substituíveis em testes quando necessário.

## Validação e respostas

- `q` deve ser string não vazia após trim.
- `POST /api/queue` valida `addQueueItemInputSchema`.
- `POST /api/queue/:id/move` valida `moveQueueItemInputSchema`.
- IDs de rota devem ser strings não vazias.
- Respostas devem passar pelos schemas compartilhados aplicáveis.
- Campos opcionais ausentes não devem ser serializados como `undefined`.

## Tradução de erros

Criar um único helper de tradução para o formato compartilhado:

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

Mapeamento mínimo:

- Zod/entrada inválida → `400 VALIDATION_ERROR`;
- `QueueItemNotFoundError` → `404 QUEUE_ITEM_NOT_FOUND`;
- `SpotifyInvalidQueryError` → `400 VALIDATION_ERROR`;
- configuração, autenticação, indisponibilidade ou resposta inválida do Spotify →
  `503 SPOTIFY_UNAVAILABLE`;
- erro inesperado → `500 INTERNAL_ERROR`.

Não incluir stack, corpo bruto externo, secrets ou tokens na resposta.

## Comportamento das rotas

### Health

- Preservar `{ "ok": true }`.
- Não consultar banco ou Spotify.

### Busca

- Chamar `SpotifyService.searchTracks`.
- Retornar `TrackMetadata[]`.
- Não expor token ou configuração.

### Fila

- `GET` retorna apenas ativos ordenados.
- `POST` adiciona ao fim e retorna o item criado.
- `DELETE` remove, recalcula e retorna a fila.
- `move` limita a posição pelo service e retorna a fila.

### Player

- `GET` retorna/cria o singleton.
- `skip` retorna `{ player, queue }`.

## Testes obrigatórios

- [x] Health retorna 200 e `{ ok: true }`.
- [x] Busca rejeita query ausente, vazia ou não textual.
- [x] Busca retorna faixas normalizadas com Spotify mockado.
- [x] Falhas Spotify retornam `SPOTIFY_UNAVAILABLE` sem dados sensíveis.
- [x] GET queue retorna fila ativa ordenada.
- [x] POST queue aceita payload válido e rejeita inválido/campos extras.
- [x] DELETE e move retornam 404 para item inexistente.
- [x] Move rejeita payload inválido.
- [x] GET player cria estado idle.
- [x] Skip atualiza fila e player consistentemente.
- [x] Erros seguem exatamente `apiErrorSchema`.
- [x] Rotas não contêm SQL.

## Definição de pronto

- [x] Todos os fluxos públicos funcionam por HTTP em testes.
- [x] Rotas são finas e usam services.
- [x] Entradas e respostas externas são validadas.
- [x] Erros seguem contrato compartilhado.
- [x] Nenhum secret aparece em resposta ou bundle cliente.
- [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` e
      `pnpm format:check` passam.

## Decisões técnicas

- Handlers exportam factories injetáveis e defaults para o runtime Nuxt.
- Testes montam os handlers em servidor H3 efêmero, usando SQLite em memória,
  repositories e services reais; somente Spotify é mockado.
- Um wrapper único converte erros em respostas validadas por `apiErrorSchema`,
  evitando stack ou payload externo bruto.
- A composição de Spotify é lazy: rotas de fila e player não exigem credenciais
  Spotify para funcionar.

## Referências internas

- [`docs/specs/03-dominio-e-contratos.md`](../specs/03-dominio-e-contratos.md)
- [`docs/specs/05-api-e-servicos-web.md`](../specs/05-api-e-servicos-web.md)
- [`docs/specs/08-configuracao-seguranca-observabilidade.md`](../specs/08-configuracao-seguranca-observabilidade.md)
- [`docs/specs/09-qualidade-e-testes.md`](../specs/09-qualidade-e-testes.md)
- [`docs/implementation/etapa-04-spotify.md`](etapa-04-spotify.md)
