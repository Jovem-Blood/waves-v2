# Waves

Waves é um painel privado mobile-first para controlar a fila de músicas de um bot
Discord. A fase 1 usa Spotify para busca e metadados, sem reprodução real de áudio.

## Estrutura

```text
apps/
  web/       Nuxt 4 fullstack e API Nitro
  bot/       processo discord.js
packages/
  shared/    schemas e tipos compartilhados
```

## Requisitos

- Node.js 22 ou superior
- pnpm 10 ou superior
- FFmpeg no `PATH`, compilado com suporte a `libopus`

## Preparação

```bash
pnpm install
```

Copie `.env.example` para `.env` na raiz e preencha:

- Spotify: `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`;
- Discord: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` e `DISCORD_GUILD_ID`;
- API interna: o mesmo `INTERNAL_API_TOKEN` para web e bot;
- `BOT_API_BASE_URL`, normalmente `http://localhost:3000/api`.

O bot carrega o `.env` da raiz durante o desenvolvimento.
O script `dev:web` também aponta explicitamente para esse arquivo no monorepo.

## Scripts

```bash
pnpm dev
pnpm dev:web
pnpm dev:bot
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
```

## Banco

```bash
pnpm --filter web db:migrate
```

Execute a migração antes da primeira inicialização. Se `/api/queue` ou
`/api/player` responder `INTERNAL_ERROR`, confirme primeiro que a migração foi
aplicada e que `DATABASE_URL` aponta para um caminho gravável.

## Discord

Com o `.env` configurado e o bot adicionado ao guild:

```bash
pnpm --filter bot bot:register
pnpm dev:web
pnpm dev:bot
```

O registro é feito por guild e cria os comandos `/play`, `/queue`, `/skip`, `/join`
e `/leave`.

## Smoke test local

Com o banco migrado e o web ativo:

```bash
pnpm dev:web
```

Verifique:

1. `http://localhost:3000/api/health` retorna `{"ok":true}`;
2. a busca Spotify retorna resultados;
3. adicionar, mover e remover sobrevivem ao polling;
4. skip atualiza player e fila;
5. reiniciar o web preserva a fila no SQLite.

Para validar o bot:

```bash
pnpm --filter bot bot:register
pnpm dev:bot
```

O log deve informar o registro de cinco comandos e `Waves bot ready`, sem imprimir
tokens ou headers de autorização.

## Troubleshooting

- `SPOTIFY_UNAVAILABLE`: revise as credenciais e a conectividade com os endpoints
  oficiais do Spotify.
- `401 UNAUTHORIZED` na API interna: confirme que web e bot usam exatamente o
  mesmo `INTERNAL_API_TOKEN`.
- Comandos não aparecem: registre novamente no guild correto e confirme
  `DISCORD_CLIENT_ID` e `DISCORD_GUILD_ID`.
- Bot conecta, mas não opera a fila: confirme que `BOT_API_BASE_URL` termina em
  `/api` e que o web está ativo.
- Nunca exponha o painel diretamente à internet sem uma camada externa de
  autenticação e controle de acesso.

## Arquitetura e limites

- O Nuxt é o único proprietário do SQLite e das regras da fila/player.
- O bot usa apenas a API interna protegida por bearer.
- Spotify e tokens permanecem no servidor.
- A fase 1 possui somente player lógico; não há áudio ou conexão de voz.

## Estado atual

A fase 1 foi concluída em 19 de junho de 2026. Navegador, API, SQLite, Spotify e
bot foram validados localmente. Os cinco comandos foram registrados no guild, e
`/play`, `/queue` e `/skip` operaram a mesma fila exibida no painel web. Todos os
gates finais passaram, incluindo 95 testes.

Conexão de voz e reprodução real de áudio continuam fora da fase 1.

A Fase 2 foi especificada e começa pela fundação de voz: `/join`, `/leave`,
reconexão, shutdown e sincronização com a API, ainda sem reprodução na Etapa 10.
A Etapa 10 foi concluída: entrada e saída reais do canal de voz foram validadas.
A Etapa 11 foi concluída com resolução Audius atrás de uma interface injetável,
cache curto em `resolved_sources` e endpoint interno autenticado. O matching é
conservador: faixas sem correspondência segura retornam `SOURCE_NOT_FOUND`.

A implementação da Etapa 12 já inclui `AudioPlayer`, `@discordjs/opus`, FFmpeg,
avanço automático e skip real. O pipeline local foi validado com uma URL Audius
real; falta confirmar áudio, conclusão e skip em um canal Discord de teste antes
de declarar a etapa concluída.

Consulte [`SPEC.md`](SPEC.md) para o índice completo da especificação.
