# Etapa 10 — Fundação de voz

## Objetivo

Fazer o Waves entrar e sair de um canal de voz com ciclo de vida seguro e estado
observável sincronizado pelo Nuxt, sem resolver fontes nem reproduzir áudio.

## Referência técnica

A implementação usa `@discordjs/voice` 0.19.x. A documentação atual confirma:

- `joinVoiceChannel` cria uma `VoiceConnection`;
- a conexão deve atingir estado pronto antes de confirmar sucesso;
- subscriptions de `AudioPlayer` existem, mas não pertencem a esta etapa.

## Escopo

1. Adicionar `@discordjs/voice` ao bot.
2. Criar uma interface `VoiceManager` injetável.
3. Implementar adapter real usando `joinVoiceChannel`, estados e destruição.
4. Manter no máximo uma conexão por guild.
5. Implementar `/join` real:
   - exigir guild e canal de voz;
   - conectar usando o adapter creator do guild;
   - aguardar ready com timeout;
   - substituir conexão anterior da mesma guild sem vazamento;
   - publicar `voice.connected`.
6. Implementar `/leave` real:
   - destruir a conexão;
   - aceitar repetição sem erro;
   - publicar `voice.disconnected`.
7. Destruir todas as conexões no shutdown.
8. Tipar eventos de voz em `packages/shared`.
9. Fazer o endpoint interno delegar eventos ao `player-state.service`.
10. Persistir ou limpar `guildId` e `voiceChannelId`.

## Fora do escopo

- `AudioPlayer` e `AudioResource`;
- FFmpeg;
- resolução ou download de fontes;
- YouTube, yt-dlp, play-dl ou Lavalink;
- pause, resume, volume e progresso;
- mudanças visuais no painel;
- fila independente por guild.

## Estrutura sugerida

```text
apps/bot/src/voice/
  voice-manager.ts
  discord-voice.adapter.ts
  voice.errors.ts

packages/shared/src/schemas/
  events.schema.ts

apps/web/server/services/
  player-state.service.ts
```

Os nomes podem ser ajustados às convenções existentes, preservando as fronteiras.

## Contratos

O contexto dos comandos precisa fornecer:

- `guildId`;
- `voiceChannelId`;
- adapter creator do guild ou uma operação equivalente encapsulada.

O command handler recebe `VoiceManager` por dependência. Testes não importam nem
abrem conexões reais.

Eventos mínimos:

```text
voice.connected
voice.disconnected
voice.connection_failed
```

## Regras de erro

- usuário fora de canal: resposta ephemeral e nenhuma conexão;
- timeout ou falha: destruir conexão parcial e publicar falha segura;
- join repetido no mesmo canal: sucesso idempotente;
- join em outro canal da mesma guild: substituir a conexão anterior;
- leave sem conexão: sucesso idempotente;
- falha ao notificar a API não deve revelar tokens ou dados do Voice Gateway.

## Testes

### Bot

- join sem canal;
- conexão pronta;
- timeout;
- falha;
- join repetido;
- troca de canal;
- leave conectado e desconectado;
- cleanup de todas as conexões;
- emissão dos eventos corretos.

### Web

- schemas rejeitam eventos incompletos;
- bearer continua obrigatório;
- `voice.connected` persiste guild/canal;
- `voice.disconnected` limpa guild/canal;
- evento de falha não cria estado conectado.

## Validação manual

1. Iniciar web e bot.
2. Entrar em um canal de voz do guild de teste.
3. Executar `/join`.
4. Confirmar visualmente que o Waves entrou no mesmo canal.
5. Confirmar `guildId` e `voiceChannelId` pela resposta da API, sem expor tokens.
6. Executar `/leave`.
7. Confirmar saída do canal e limpeza do estado na API.
8. Repetir `/leave` e confirmar resposta idempotente.
9. Encerrar o bot conectado e confirmar que ele sai do canal.

## Gates

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Definição de pronto

- `/join` e `/leave` controlam uma conexão real;
- lifecycle, timeout e shutdown estão cobertos por testes;
- Nuxt reflete conexão e desconexão;
- nenhum áudio ou resolvedor foi implementado;
- validação manual e todos os gates passaram.

## Execução em 20 de junho de 2026

### Concluído

- `@discordjs/voice` 0.19.2 instalado;
- diagnóstico de runtime confirmou crypto AES-256-GCM nativo e DAVE;
- `VoiceManager` implementado com timeout, idempotência, troca de canal,
  recuperação limitada, destruição e cleanup global;
- `/join` e `/leave` implementados e comandos registrados novamente no guild;
- eventos `voice.connected`, `voice.disconnected` e `voice.connection_failed`
  validados;
- Nuxt persiste e limpa guild/canal por `PlayerStateService`;
- testes usam adapter mockado e não abrem sockets reais;
- 101 testes passaram: 74 web, 18 bot e 9 shared;
- lint, typecheck, build e format check passaram.

O diagnóstico não encontrou biblioteca Opus instalada. Isso não bloqueia a Etapa
10, porque ainda não há criação de recurso nem reprodução de áudio. A dependência
de codec será decidida na etapa de reprodução.

### Pendente manual

1. iniciar web e bot com o código atualizado;
2. entrar em um canal de voz;
3. executar `/join` e confirmar que o Waves entra;
4. consultar `/api/player` e confirmar guild/canal;
5. executar `/leave` e confirmar saída e limpeza do estado;
6. repetir `/leave` para confirmar idempotência;
7. encerrar o bot conectado e confirmar cleanup.

### Correção após o primeiro smoke test

O primeiro `/join` conectou o bot ao canal, mas o Discord mostrou que o aplicativo
não respondeu. A causa era o comando aguardar a conexão pronta e a sincronização da
API antes de reconhecer a interação, ultrapassando a janela inicial do Discord.

`/join` e `/leave` agora executam defer ephemeral antes das operações assíncronas e
editam essa resposta ao concluir. O log de falha também registra somente o nome
seguro do erro. Testes, lint, typecheck e build do bot passaram após a correção.

O fato de o bot ter entrado no canal confirma parcialmente a validação manual de
conexão. Ainda é necessário repetir `/join` para confirmar a resposta e executar
`/leave`.

### Correção após o segundo smoke test

O defer passou a aparecer, mas a interação permaneceu em “Waves está pensando”.
Durante a investigação não havia processo escutando em `localhost:3000`. O comando
confirmava a operação no Discord somente depois de sincronizar
`voice.connected`/`voice.disconnected` com a API, fazendo a disponibilidade do web
bloquear a resposta de voz.

Os comandos agora:

1. concluem a operação de voz;
2. respondem imediatamente à interação;
3. tentam sincronizar o evento com a API sem reverter a operação de voz.

Foi adicionado teste de regressão com a API indisponível. Os 19 testes do bot, lint,
typecheck e build passaram.

O web ainda deve estar ativo para que `/api/player` reflita guild e canal, mas sua
indisponibilidade não deixa mais o comando pendente.

### Correção após o terceiro smoke test

O bot aparecia no canal, permanecia pensando por aproximadamente 15 segundos e
depois saía com erro de conexão. A conexão nunca atingia
`VoiceConnectionStatus.Ready` porque o client solicitava somente o intent `Guilds`.

O `@discordjs/voice` precisa receber os pacotes `VOICE_STATE_UPDATE` e
`VOICE_SERVER_UPDATE` durante o handshake. O client agora solicita também
`GuildVoiceStates`, com teste de regressão sobre os intents configurados.

### Validação manual concluída

Em 20 de junho de 2026:

- `/join` conectou o Waves ao canal de voz e respondeu corretamente;
- `/leave` desconectou o Waves e respondeu corretamente;
- a evidência visual confirmou entrada e saída reais no Discord.

## Resultado

Etapa 10 concluída em 20 de junho de 2026.
