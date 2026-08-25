# Waves

Waves é um painel privado mobile-first para controlar a fila e a reprodução de
músicas de um bot Discord.

## Estrutura

```text
apps/
  web/       Nuxt 4 fullstack e API Nitro
  bot/       processo discord.js
packages/
  shared/    schemas e tipos compartilhados
```

## Requisitos

- Node.js 25.5.0 ou superior
- pnpm 10 ou superior
- FFmpeg no `PATH`, compilado com suporte a `libopus`
- acesso de rede ao YouTube Music

## Preparação

```bash
pnpm install
```

Copie `.env.example` para `.env` na raiz e preencha:

- Spotify: `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET`;
- Discord: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` e `DISCORD_GUILD_ID`;
- API interna: o mesmo `BOT_INTERNAL_SECRET` para web e bot;
- `INTERNAL_WEB_URL`, normalmente `http://localhost:3000`;
- `PUBLIC_APP_URL`, a URL HTTP(S) pública do painel incluída no link e QR code
  enviados pelo bot.
- `LOG_LEVEL`, com `debug`, `info`, `warn` ou `error`. O default é `debug` em
  desenvolvimento e `info` nos demais ambientes.
- `SESSION_COOKIE_SECURE`, use `false` para Docker local via HTTP e `true` quando
  acessar o painel por HTTPS.

O bot carrega o `.env` da raiz durante o desenvolvimento.
O script `dev:web` também aponta explicitamente para esse arquivo no monorepo.
`INTERNAL_API_TOKEN`, `BOT_API_BASE_URL` e `APP_HOSTNAME` continuam aceitos como
aliases legados, mas não devem ser usados em novas instalações.

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
pnpm dev:web
pnpm dev:bot
```

O registro é feito por guild e cria os comandos `/play`, `/queue`, `/skip`, `/join`,
`/leave`, `/pause`, `/resume` e `/volume`. O bot atualiza esses comandos
automaticamente antes de fazer login. Use `pnpm --filter bot bot:register` apenas
quando precisar registrar sem iniciar o processo do bot.

## Docker

Com o `.env` configurado na raiz:

```bash
docker compose up --build -d
docker compose logs -f web bot
```

O Compose cria dois serviços a partir da mesma imagem local `waves:local`:

- `web`: executa as migrações SQLite e inicia o Nuxt em `http://localhost:3000`.
- `bot`: espera o healthcheck do web e comunica-se com `http://web:3000/api`.

Os dois processos expõem liveness e readiness separados. O web usa
`/api/health/live` e `/api/health/ready`; o healthcheck do bot fica disponível
somente dentro do container em `/health/live` e `/health/ready`.

Web e bot usam o driver Docker `json-file` com rotação de 10 MiB por arquivo e
até cinco arquivos por container. Dozzle continua lendo esses logs pelo Docker;
não há transport externo. Após alterar essa configuração, recrie os containers
com `docker compose up -d --force-recreate`.

O banco fica no volume nomeado `waves-data`, montado em `/data`. Use
`docker compose down` para parar sem apagar dados. Use
`docker compose down -v` apenas quando quiser remover também o volume SQLite.

Backups online podem ser criados no volume `waves-backups` com
`apps/web/backup-database.mjs`; o script mantém 14 cópias diárias e 4 semanais.

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

O log deve informar o registro de oito comandos e `Waves bot ready`, sem imprimir
tokens ou headers de autorização.

Para diagnosticar playback, redirecione web e bot para arquivos locais ignorados:

```powershell
pnpm dev:web *> waves-web.log
pnpm dev:bot *> waves-bot.log
```

Use `playbackAttemptId`, `guildId` e `queueItemId` para reconstruir claim,
resolução, ranges, probe, criação do recurso, transições do player e conclusão.
Ranges aparecem em `debug`; marcos e transições aparecem em `info`. Antes de
compartilhar logs, procure por `streamUrl`, `Authorization`, `signature`, `token`,
`cookie`, `visitorData` e `poToken`.

## Troubleshooting

- `SPOTIFY_UNAVAILABLE`: revise as credenciais e a conectividade com os endpoints
  oficiais do Spotify.
- `401 UNAUTHORIZED` na API interna: confirme que web e bot usam exatamente o
  mesmo `BOT_INTERNAL_SECRET`.
- Comandos não aparecem: registre novamente no guild correto e confirme
  `DISCORD_CLIENT_ID` e `DISCORD_GUILD_ID`.
- Bot conecta, mas não opera a fila: confirme `INTERNAL_WEB_URL` e que o web está
  ativo.
- Playback termina imediatamente: filtre pelo mesmo `playbackAttemptId` e localize
  o primeiro `errorCode`, especialmente `SOURCE_HTTP_STATUS`,
  `DEMUX_PROBE_FAILED`, `PLAYER_ERROR` ou `PREMATURE_IDLE`.
- Nunca exponha o painel diretamente à internet sem uma camada externa de
  autenticação e controle de acesso.

## Arquitetura e limites

- O Nuxt é o único proprietário do SQLite e das regras da fila/player.
- O bot usa apenas a API interna protegida por bearer.
- Spotify e tokens permanecem no servidor.
- YouTube Music é a única fonte de áudio.
- Conexões, players e streams existem apenas no runtime do bot.

## Estado atual

O produto possui fila persistida, reprodução de voz, avanço automático, autojoin,
pause, resume, volume, progresso, skip, leave e controles web sincronizados. O
painel também informa separadamente a disponibilidade da web, do bot e da conexão
de voz.

O YouTube.js usa a API privada InnerTube e pode quebrar ou sofrer bloqueios sem
aviso. A integração é destinada a uso privado e não utiliza cookies ou OAuth.
