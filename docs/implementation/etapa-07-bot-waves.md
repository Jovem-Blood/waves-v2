# Próxima etapa — Bot Waves

**Status:** implementação concluída em 18 de junho de 2026; build web fora do
sandbox, registro e conexão reais no Discord ainda não verificados.

## Objetivo

Implementar o processo Discord em `apps/bot`, registrar slash commands e conectar
os comandos à API interna do Nuxt. O bot deve permanecer um cliente HTTP sem estado
próprio de fila e sem acesso ao banco.

## Pré-condições

- Etapas 0 a 6 concluídas.
- API interna protegida e validada por HTTP.
- Aplicação Discord, bot token, client ID e guild ID disponíveis no ambiente local.
- Todos os gates da raiz passando.

## Documentação obrigatória

Antes de editar código, consultar com Context7 a documentação atual de:

1. discord.js v14 para `Client`, intents, eventos, chat input commands, defer/reply
   e registro REST de application commands.
2. Pino para logger do processo bot.
3. Fetch/AbortSignal somente se surgir dúvida sobre timeout no Node atual.

Não incluir tokens, IDs privados ou headers bearer nas consultas.

## Configuração

Validar com Zod:

```dotenv
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
INTERNAL_API_TOKEN=
BOT_API_BASE_URL=http://localhost:3000/api
```

Regras:

- mensagens indicam nomes ausentes sem valores;
- `BOT_API_BASE_URL` deve ser URL HTTP/HTTPS válida;
- configuração é server/process-only;
- testes injetam configuração sem ler `.env`.

## Estrutura sugerida

```text
apps/bot/src/
  api/
    waves-api.client.ts
  commands/
    play.command.ts
    queue.command.ts
    skip.command.ts
    join.command.ts
    leave.command.ts
    index.ts
  config.ts
  logger.ts
  register-commands.ts
  index.ts
```

Criar testes unitários para configuração, client HTTP, formatação e handlers.

## Cliente da API Waves

Operações:

```ts
getQueue()
play(input)
skip()
sendEvent(event)
```

Regras:

- aplicar bearer centralmente;
- base URL configurável;
- timeout explícito via `AbortSignal`;
- validar respostas com schemas compartilhados;
- validar `{ item, track }` e `{ player, queue }` com schemas locais compostos;
- interpretar `apiErrorSchema`;
- nunca registrar URL com token, Authorization ou body sensível;
- traduzir timeout, indisponibilidade e respostas inválidas para erros internos do
  bot.

## Registro de comandos

O script `bot:register` deve registrar no guild:

- `/play query:string` obrigatório;
- `/queue`;
- `/skip`;
- `/join`;
- `/leave`.

Usar registro por guild para desenvolvimento rápido. O script deve validar env,
registrar apenas nomes/quantidade e nunca imprimir token.

## Bootstrap

1. Validar env.
2. Criar logger.
3. Criar Waves API client.
4. Criar Discord client com intents mínimos.
5. Registrar handler `interactionCreate`.
6. Tratar apenas chat input commands conhecidos.
7. Login no Discord.
8. Registrar eventos de ready, erro e encerramento seguro.

O bot não deve importar nada de `apps/web`, Drizzle, SQLite ou repositories.

## Comandos

### `/play`

- obter query obrigatória;
- deferir resposta quando apropriado;
- enviar query, Discord user ID e display name à API interna;
- confirmar título e artistas do item adicionado;
- tratar `TRACK_NOT_FOUND`, indisponibilidade e timeout com mensagem amigável.

### `/queue`

- buscar fila;
- mostrar no máximo 10 itens;
- incluir posição humana, título, artistas e solicitante quando disponível;
- informar claramente quando vazia;
- limitar conteúdo ao tamanho aceito pelo Discord.

### `/skip`

- chamar API interna;
- informar que a fila estava vazia, ou indicar próxima faixa quando existir;
- não alegar reprodução real de áudio.

### `/join`

- verificar se o membro está em canal de voz;
- responder de forma ephemeral quando não estiver;
- quando estiver, informar que conexão de voz pertence à fase 2;
- não importar nem usar bibliotecas de voz.

### `/leave`

- informar que o bot não mantém conexão de voz na fase 1;
- não alterar fila ou player.

## Respostas e erros

- Erros de configuração, contexto e falhas técnicas devem ser ephemeral.
- Respostas bem-sucedidas de play, queue e skip podem ser públicas.
- Se a interação já foi deferred/replied, usar `editReply` ou `followUp`
  corretamente.
- Nunca enviar stack, URL interna, token ou resposta técnica bruta ao Discord.

## Testes obrigatórios

- [x] Config válida é aceita; campos ausentes são rejeitados sem valores.
- [x] Client aplica bearer e base URL corretamente.
- [x] Client aborta após timeout.
- [x] Client valida respostas de queue, play e skip.
- [x] Client traduz `ApiError` e resposta inválida.
- [x] Definições contêm exatamente cinco comandos.
- [x] `/play` envia identidade e query corretas.
- [x] `/play` trata faixa inexistente e indisponibilidade.
- [x] `/queue` limita a 10 e formata fila vazia.
- [x] `/skip` formata fila vazia e próximo item.
- [x] `/join` exige canal e comunica fase 2.
- [x] `/leave` comunica limitação da fase 1.
- [x] Handler desconhecido não executa API.
- [x] Bot não importa banco, Drizzle, better-sqlite3 ou código de `apps/web`.
- [x] Logs e mensagens não expõem secrets.

## Validação manual

Quando credenciais Discord válidas estiverem disponíveis:

1. [ ] Executar `pnpm --filter bot bot:register`.
2. [ ] Executar `pnpm dev:bot`.
3. [ ] Confirmar conexão no guild.
4. [ ] Validar os cinco comandos contra a API local.

Não marcar esses critérios se as credenciais ou o Discord real não forem usados.

## Definição de pronto

- [x] Comandos são registráveis por guild.
- [x] Handlers funcionam com API mockada nos testes.
- [x] Bot usa somente HTTP para fila e player.
- [x] Limites da fase 1 são comunicados corretamente.
- [x] Nenhum secret aparece em logs ou respostas.
- [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, build do bot e
      `pnpm format:check` passam.
- [ ] `pnpm build` completo reconfirmado fora do sandbox após esta etapa.

## Decisões técnicas

- O bot carrega o `.env` da raiz em desenvolvimento sem sobrescrever variáveis já
  fornecidas pelo processo.
- O cliente HTTP usa `AbortSignal.timeout`, valida respostas com Zod e nunca inclui
  URL interna, bearer ou corpo técnico nas mensagens ao Discord.
- Handlers usam um contexto mínimo testável; o adaptador discord.js concentra
  detalhes de reply, defer e identidade do membro.
- `/play` é deferred como ephemeral para garantir privacidade também nas falhas.
- O bootstrap usa apenas `GatewayIntentBits.Guilds`.

## Referências internas

- [`docs/specs/03-dominio-e-contratos.md`](../specs/03-dominio-e-contratos.md)
- [`docs/specs/05-api-e-servicos-web.md`](../specs/05-api-e-servicos-web.md)
- [`docs/specs/06-bot-discord.md`](../specs/06-bot-discord.md)
- [`docs/specs/08-configuracao-seguranca-observabilidade.md`](../specs/08-configuracao-seguranca-observabilidade.md)
- [`docs/implementation/etapa-06-api-interna.md`](etapa-06-api-interna.md)
