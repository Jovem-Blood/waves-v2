# Waves

[English](README.md) | [Português (Brasil)](README.pt-BR.md)

![Waves — painel de fila de música para Discord](apps/web/public/images/waves-banner.png)

Waves é um painel privado e mobile-first para um bot de música do Discord. Ele
mantém a fila, o estado do player, o histórico de reprodução e o estado operacional
em uma única aplicação web self-hosted, enquanto o processo do Discord cuida
apenas da voz e de outros recursos efêmeros de runtime.

> [!IMPORTANT]
> O Waves não possui controle de acesso de implantação integrado. Sessões de
> convidado e a vinculação da conta Discord identificam usuários dentro da
> aplicação, mas não protegem o painel contra visitantes não autorizados. Não
> exponha o Waves diretamente à internet pública; coloque-o atrás de HTTPS e de um
> proxy reverso com autenticação, VPN ou gateway zero-trust.

## Funcionalidades

- Fila colaborativa persistente, mobile-first e baseada em SQLite.
- Busca de faixas e metadados no Spotify.
- Resolução de áudio no YouTube Music e reprodução na voz do Discord.
- Controles web de reprodução, pausa, retomada, skip, volume, ordenação da fila e
  remoção/restauração.
- Comandos Discord: `/play`, `/queue`, `/login`, `/join`, `/leave`, `/pause`,
  `/resume`, `/skip` e `/volume`.
- Sessões de convidado e vinculação única da conta Discord por link privado e QR
  code.
- Avanço automático da fila e sugestões de autoplay vindas do Last.fm e YouTube
  Music, resolvidas novamente para metadados do Spotify.
- Sincronização do navegador em tempo real, histórico e diagnósticos de reprodução.
- Relatórios separados do estado da web, bot e voz, logs estruturados, health
  checks e backups do SQLite.

## Arquitetura

```text
apps/
  web/       app fullstack Nuxt 4, API Nitro, regras de domínio e acesso ao SQLite
  bot/       processo discord.js, conexões de voz, players e streams
packages/
  shared/    schemas Zod e tipos TypeScript compartilhados
```

O Nuxt é a fonte da verdade da fila e do player. O bot se comunica apenas com a
API interna protegida e nunca abre o SQLite diretamente. O Spotify é usado para
busca e metadados; o YouTube Music por meio de `youtubei.js` é a única fonte de
áudio. Conexões de voz, players de áudio, subscriptions e streams permanecem
efêmeros dentro do bot.

## Requisitos

### Self-hosting com Docker

- Docker Engine com Docker Compose v2.
- Uma aplicação Discord instalada em um servidor.
- Credenciais de uma aplicação Spotify.
- Uma chave de API do Last.fm é opcional, mas recomendada para sugestões de
  autoplay mais ricas.
- Acesso de rede ao Discord, Spotify, Last.fm quando configurado e YouTube Music.

A imagem já inclui o FFmpeg e o runtime Node.js necessário.

### Desenvolvimento local

- Node.js 25.5.0 ou mais recente, conforme `.node-version` e `.mise.toml`.
- pnpm 11.5.2, conforme declarado em `packageManager`.
- FFmpeg disponível no `PATH` com suporte a Opus.
- As mesmas credenciais e o mesmo acesso de rede exigidos no self-hosting.

## Configuração dos provedores

### Discord

1. Crie uma aplicação e um bot no Discord Developer Portal.
2. Copie o token do bot e o ID da aplicação.
3. Habilite a instalação no servidor desejado com os escopos `bot` e
   `applications.commands`. Conceda no mínimo Ver canais, Conectar e Falar nos
   canais de voz que o Waves utilizará.
4. Ative o Modo de desenvolvedor no Discord, copie o ID do servidor desejado e
   salve os três valores no `.env`.

O Waves solicita apenas os gateway intents `Guilds` e `GuildVoiceStates`; ele não
precisa dos intents privilegiados de conteúdo das mensagens ou membros. Os
comandos são registrados no servidor configurado durante a inicialização, então
as atualizações normalmente aparecem imediatamente.

### Spotify

Crie uma aplicação no Spotify Developer Dashboard e copie seu client ID e client
secret. O Waves usa o fluxo client credentials no servidor; esses valores nunca
devem ser expostos ao navegador nem commitados no Git.

### Last.fm

Crie uma conta de API no Last.fm e defina `LASTFM_API_KEY` para habilitar o
provedor de autoplay do Last.fm. Se ela for omitida, o Waves ainda poderá tentar o
provedor de recomendações do YouTube Music.

## Configuração do ambiente

Copie o arquivo de exemplo e edite a cópia local:

```bash
cp .env.example .env
```

Equivalente no PowerShell:

```powershell
Copy-Item .env.example .env
```

Os valores mínimos a revisar são:

| Variável                | Obrigatória     | Finalidade                                                                              |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`         | Sim             | Token do bot Discord.                                                                   |
| `DISCORD_CLIENT_ID`     | Sim             | ID da aplicação Discord.                                                                |
| `DISCORD_GUILD_ID`      | Sim             | Servidor onde os comandos do guild são registrados.                                     |
| `SPOTIFY_CLIENT_ID`     | Sim             | Client ID do Spotify usado no servidor.                                                 |
| `SPOTIFY_CLIENT_SECRET` | Sim             | Client secret do Spotify usado no servidor.                                             |
| `BOT_INTERNAL_SECRET`   | Sim             | Secret aleatório compartilhado apenas pela web e pelo bot.                              |
| `PUBLIC_APP_URL`        | Sim             | URL do painel acessível pelo navegador, usada nos links e QR codes de login do Discord. |
| `INTERNAL_WEB_URL`      | Desenvolvimento | Origem da web usada pelo bot local; normalmente `http://localhost:3000`.                |
| `LASTFM_API_KEY`        | Não             | Habilita o provedor de recomendações do Last.fm.                                        |
| `DATABASE_URL`          | Desenvolvimento | URL do SQLite; o padrão é `file:./dev.db`. O Docker usa `/data/waves.db`.               |
| `SESSION_COOKIE_SECURE` | Implantação     | Use `true` atrás de HTTPS; HTTP local usa `false`.                                      |
| `WAVES_BIND_ADDRESS`    | Não             | Endereço publicado pelo Docker; o padrão é loopback (`127.0.0.1`).                      |
| `LOG_LEVEL`             | Não             | `debug`, `info`, `warn` ou `error`.                                                     |

Gere `BOT_INTERNAL_SECRET` com um gerenciador de senhas ou gerador
criptograficamente seguro; por exemplo:

```bash
openssl rand -hex 32
```

A lista completa, valores padrão e variáveis de ajuste estão em `.env.example`.
`INTERNAL_API_TOKEN`, `BOT_API_BASE_URL` e `APP_HOSTNAME` continuam aceitos como
aliases legados, mas novas instalações devem usar os nomes acima.

## Self-hosting com Docker

Com o `.env` configurado:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f web bot
```

O Compose cria uma imagem local e inicia dois serviços:

- `web` aplica as migrações do SQLite e serve a aplicação Nuxt em
  `http://127.0.0.1:3000` por padrão.
- `bot` espera o readiness check da web, registra os comandos do guild, entra no
  Discord e acessa `http://web:3000/api` pela rede do Compose.

Verifique o readiness da web pelo host:

```bash
curl http://127.0.0.1:3000/api/health/ready
```

O serviço web expõe `/api/health/live` e `/api/health/ready`. O bot também possui
`/health/live` e `/health/ready`, mas seu servidor de health fica disponível
somente dentro do container por padrão.

Os dados da fila e do player ficam no volume nomeado `waves-data`. Pare a aplicação
sem apagar os dados com:

```bash
docker compose down
```

`docker compose down -v` também apaga os volumes do SQLite e de backup; use-o
somente quando a remoção permanente dos dados for intencional.

### Exposição em produção

Mantenha o binding padrão em loopback quando o proxy reverso rodar no mesmo host.
Termine o HTTPS nesse proxy, exija autenticação nele, defina `PUBLIC_APP_URL` como
a URL HTTPS externa e use `SESSION_COOKIE_SECURE=true`. Se um proxy em outra rede
precisar acessar a porta publicada, ajuste `WAVES_BIND_ADDRESS` deliberadamente e
aplique restrições de firewall.

### Backups e logs

Crie um backup online do SQLite com:

```bash
bash ops/backup.sh
```

Os backups são gravados no volume `waves-backups`. A aplicação mantém 14 cópias
diárias e 4 semanais. Os logs da aplicação são JSON estruturado do Pino no stdout;
o Docker rotaciona cinco arquivos de 10 MiB por serviço. Consulte
[`docs/observability.md`](docs/observability.md) para ver os campos e queries de
diagnóstico.

## Desenvolvimento local

Instale as dependências e aplique as migrações:

```bash
pnpm install --frozen-lockfile
pnpm --filter web db:migrate
```

Inicie os dois processos:

```bash
pnpm dev
```

Ou execute-os separadamente:

```bash
pnpm dev:web
pnpm dev:bot
```

Os dois processos leem o `.env` da raiz. O bot registra os nove comandos do guild
antes de entrar. Para registrá-los sem iniciar o bot:

```bash
pnpm --filter bot bot:register
```

Comandos de qualidade úteis:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

Use `pnpm build` ao validar empacotamento, Docker, implantação ou outro
comportamento exclusivo de produção.

## Checklist de verificação

Depois de iniciar:

1. `/api/health/ready` retorna uma resposta de sucesso.
2. Todos os nove comandos Discord aparecem no servidor configurado.
3. A busca no Spotify retorna faixas.
4. Um usuário consegue entrar ou criar uma sessão de convidado, adicionar uma
   faixa, reordenar a fila e restaurar um item removido.
5. `/join` conecta o bot ao canal de voz de quem chamou e a reprodução avança para
   o próximo item da fila.
6. Controles web e comandos Discord permanecem sincronizados.
7. Reiniciar o serviço web preserva a fila no SQLite.

## Solução de problemas

- `SPOTIFY_UNAVAILABLE`: verifique as credenciais do Spotify e o acesso de rede de
  saída.
- `401 UNAUTHORIZED` na API interna: confirme que web e bot usam o mesmo
  `BOT_INTERNAL_SECRET`.
- Comandos Discord não aparecem: confira `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`,
  os escopos de instalação e reinicie o bot ou rode `bot:register`.
- O bot conecta, mas não controla a fila: confira `INTERNAL_WEB_URL` em
  desenvolvimento e confirme que o endpoint de readiness da web responde.
- A reprodução termina imediatamente: correlacione os logs por
  `playbackAttemptId` e localize o primeiro `errorCode`, especialmente
  `SOURCE_HTTP_STATUS`, `DEMUX_PROBE_FAILED`, `PLAYER_ERROR` ou `PREMATURE_IDLE`.
- Antes de compartilhar logs, procure por `streamUrl`, `Authorization`,
  `signature`, `token`, `cookie`, `visitorData` e `poToken` e remova valores
  sensíveis.

## Limitações e uso responsável

- O Waves foi projetado para um servidor Discord privado e um grupo confiável,
  não como um serviço público multi-tenant.
- O acesso ao YouTube Music usa a API privada InnerTube por meio de `youtubei.js`
  e pode mudar, falhar ou sofrer rate limit sem aviso.
- Os operadores são responsáveis por cumprir os termos do Discord, Spotify,
  Last.fm, YouTube e as regras de direitos autorais aplicáveis. O Waves não é
  afiliado a esses serviços.

## Licença

Este repositório ainda não inclui uma licença. A visibilidade pública, sozinha,
não concede permissão para usar, modificar ou redistribuir o código. Os
mantenedores devem adicionar uma licença explícita antes de incentivar o reúso ou
contribuições.
