# Próxima etapa — Spotify

**Status:** concluída em 18 de junho de 2026.

## Objetivo

Implementar no servidor Nuxt a autenticação Client Credentials, busca de faixas e
normalização de respostas do Spotify para `TrackMetadata[]`, sem criar rotas HTTP
ainda.

## Pré-condições

- Etapas 0 a 3 concluídas.
- Contratos compartilhados e services de domínio estáveis.
- Todos os gates da raiz passando.

## Documentação obrigatória

Antes de editar código, consultar com Context7 a documentação atual de:

1. Spotify Web API Client Credentials Flow.
2. Endpoint de busca de faixas e seus parâmetros.
3. Estrutura atual das respostas de token e busca.
4. API de `$fetch`/ofetch do Nuxt somente se ela for usada no client.

Não incluir client secret, token ou outras credenciais nas consultas.

## Escopo

Criar componentes server-only, por exemplo:

```text
apps/web/server/
  clients/
    spotify.client.ts
  services/
    spotify.service.ts
  utils/
    env.ts
```

Criar testes em:

```text
apps/web/test/
  clients/
  services/
```

Não criar nesta etapa:

- rotas `/api/spotify/search`;
- rotas públicas ou internas adicionais;
- comandos Discord;
- interface;
- persistência de tokens;
- reprodução ou resolução de áudio.

## Configuração

- [x] Validar `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` com Zod no servidor.
- [x] Não ler secrets em código cliente.
- [x] Não registrar Authorization headers, client secret ou access token.
- [x] Permitir injetar configuração e cliente HTTP nos testes.

## Client Credentials

O client deve:

1. Enviar credenciais somente ao endpoint oficial de token.
2. Usar o formato de autenticação e corpo exigido pela documentação atual.
3. Validar a resposta externa com Zod.
4. Retornar token e expiração em uma representação interna explícita.
5. Traduzir respostas inválidas, timeouts e erros HTTP para erros internos estáveis.

## Cache do token

O service mantém em memória:

```ts
{
  accessToken: string
  expiresAt: number
}
```

Regras:

- buscar token quando o cache estiver vazio;
- reutilizar token ainda válido;
- renovar antes da expiração com margem explícita;
- permitir relógio injetável;
- não persistir token no SQLite;
- não compartilhar token com navegador ou bot.

## Busca

Operação mínima:

```ts
searchTracks(query: string): Promise<TrackMetadata[]>
```

Regras:

- rejeitar query vazia após trim;
- solicitar somente resultados do tipo faixa;
- usar limite inicial de 10;
- validar a resposta externa com Zod;
- normalizar cada resultado para `TrackMetadata`;
- ignorar ou tratar explicitamente itens incompletos;
- preservar a ordem retornada pelo Spotify.

## Normalização

Mapeamento esperado:

- `id`: `spotify:{providerTrackId}`;
- `provider`: `spotify`;
- `providerTrackId`: ID da faixa;
- `title`: nome da faixa;
- `artists`: nomes dos artistas, mantendo ordem;
- `albumName`: nome do álbum quando disponível;
- `durationMs`: duração inteira não negativa;
- `coverUrl`: imagem de álbum escolhida por regra determinística;
- `externalUrl`: URL pública da faixa;
- `isrc`: código ISRC quando disponível e válido.

O resultado final deve passar por `trackMetadataSchema`.

## Erros internos

Definir erros sem dependência HTTP para:

- configuração ausente ou inválida;
- autenticação recusada;
- indisponibilidade do Spotify;
- resposta externa inválida.

A conversão desses erros para `ApiError` pertence à Etapa 5.

## Testes obrigatórios

- [x] Configuração válida é aceita.
- [x] Configuração ausente ou vazia é rejeitada sem expor valores.
- [x] Primeira busca solicita token.
- [x] Buscas subsequentes reutilizam token válido.
- [x] Token próximo da expiração é renovado.
- [x] Credenciais usam o formato exigido pela documentação.
- [x] Query vazia é rejeitada antes de chamar HTTP.
- [x] Busca envia tipo e limite corretos.
- [x] Resposta é normalizada para `TrackMetadata[]`.
- [x] Múltiplos artistas preservam ordem.
- [x] Campos opcionais ausentes não aparecem como `undefined`.
- [x] Resposta externa inválida é rejeitada.
- [x] Erros de token e busca são traduzidos para erros internos.
- [x] Logs e mensagens de erro não contêm secrets ou access tokens.

## Definição de pronto

- [x] Uma chamada direta ao service retorna `TrackMetadata[]`.
- [x] HTTP externo e relógio são injetáveis.
- [x] Token é reutilizado e renovado corretamente.
- [x] Nenhum secret entra no bundle cliente ou nos logs.
- [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` e
      `pnpm format:check` passam.

## Decisões técnicas

- O client usa `fetch` nativo injetável; nenhuma biblioteca HTTP adicional foi
  necessária.
- Client Credentials usa Basic Auth e corpo
  `grant_type=client_credentials`, conforme a documentação oficial.
- Schemas Zod validam apenas os campos consumidos e toleram campos adicionais da
  resposta oficial.
- A primeira imagem do álbum é selecionada de forma determinística.
- Violações do contrato normalizado são convertidas em
  `SpotifyInvalidResponseError`.
- Não foi realizada chamada real ao Spotify; a etapa foi validada integralmente com
  HTTP mockado, conforme o escopo.

## Referências internas

- [`docs/specs/03-dominio-e-contratos.md`](../specs/03-dominio-e-contratos.md)
- [`docs/specs/05-api-e-servicos-web.md`](../specs/05-api-e-servicos-web.md)
- [`docs/specs/08-configuracao-seguranca-observabilidade.md`](../specs/08-configuracao-seguranca-observabilidade.md)
- [`docs/specs/09-qualidade-e-testes.md`](../specs/09-qualidade-e-testes.md)
- [`docs/implementation/etapa-03-servicos-de-dominio.md`](etapa-03-servicos-de-dominio.md)
