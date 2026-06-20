# 08 — Configuração, segurança e observabilidade

## Variáveis de ambiente

```dotenv
NODE_ENV=development

NUXT_PUBLIC_APP_NAME=Waves
NUXT_PUBLIC_API_BASE=/api

DATABASE_URL=file:./dev.db

DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

INTERNAL_API_TOKEN=dev-internal-token
BOT_API_BASE_URL=http://localhost:3000/api
```

## Separação público/privado

Somente variáveis prefixadas com `NUXT_PUBLIC_` podem chegar ao cliente. Tokens do
Discord, Spotify, banco e API interna são exclusivos do servidor/processo.

## Validação

Cada aplicação possui schema de env próprio:

- web valida banco, Spotify e token interno.
- bot valida Discord, base URL e token interno.
- mensagens de erro indicam nomes ausentes sem revelar valores.

## Autorização interna

- Comparar `Authorization` com o token esperado.
- Rejeitar header ausente ou malformado com 401.
- Não aceitar token por query string.
- Registrar falhas sem registrar o valor recebido.

## Segurança da fase 1

- O painel não deve ser exposto publicamente sem proteção externa.
- CORS não deve ser aberto indiscriminadamente.
- Payloads têm limites e validação.
- Mensagens externas devem ser sanitizadas antes de logs estruturados.
- Dependências e lockfile devem ser versionados.

## Logger

Pino em web e bot.

Campos recomendados:

- `service`
- `environment`
- `requestId`
- `route`
- `guildId`
- `discordUserId`
- `queueItemId`
- `eventType`
- `durationMs`

Nunca registrar:

- tokens.
- secrets.
- header Authorization completo.
- respostas brutas do Spotify sem necessidade.
- `streamUrl`, URLs assinadas do provedor ou respostas brutas do Audius.

## Health check

`GET /api/health` verifica disponibilidade do processo. Banco e Spotify não
precisam ser consultados nesse endpoint na fase 1.

## Encerramento

Web e bot devem lidar com sinais de encerramento, finalizar logs e fechar recursos
abertos quando aplicável.

Na fase 2, o bot deve destruir todas as conexões e players de voz antes de encerrar.

## Voz

- Não registrar token, endpoint, session ID ou payloads brutos do Voice Gateway.
- Logs podem conter `guildId`, `voiceChannelId`, estado anterior, próximo estado e
  código interno de falha.
- Timeouts de conexão devem ser explícitos e configurados em código.
- Falhas de conexão não podem deixar uma sessão registrada como conectada.
- Dependências nativas ou executáveis de mídia só entram na etapa que realmente os
  utiliza e devem ser verificáveis no setup.

Na Etapa 12:

- FFmpeg deve estar disponível no `PATH` e possuir `libopus`;
- `@discordjs/opus` é a implementação Opus escolhida;
- `pnpm-workspace.yaml` autoriza build nativo somente para dependências conhecidas;
- logs de erro do player registram apenas guild, item e código/evento seguro;
- mensagens do FFmpeg, URL assinada e erro bruto do recurso não são registradas.
