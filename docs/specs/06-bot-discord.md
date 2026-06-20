# 06 — Bot Discord

## Tecnologia

- discord.js v14.
- `@discordjs/voice` 0.19.x.
- TypeScript strict.
- `tsx` durante desenvolvimento.
- Application commands, sem prefix commands.
- Intents mínimos necessários.

## Inicialização

1. Validar env.
2. Criar o client Discord.
3. Registrar handler de interações.
4. Efetuar login.
5. Registrar logs de pronto, erro e encerramento.

## Registro de comandos

O script `bot:register` registra comandos no guild configurado por
`DISCORD_GUILD_ID`, permitindo atualização rápida no desenvolvimento.

## Comandos

### `/play query:string`

- Adia a resposta quando a chamada puder demorar.
- Envia query e identidade do usuário à API interna.
- Confirma título e artistas adicionados.
- Trata ausência de resultado e indisponibilidade da API.
- Quando o bot está conectado, solicita o claim autoritativo e inicia o
  `AudioPlayer`.
- Quando já existe reprodução, apenas adiciona a faixa à fila.

### `/queue`

- Consulta a API.
- Mostra no máximo 10 itens.
- Exibe posição, título, artistas e solicitante quando houver.
- Informa claramente quando a fila estiver vazia.

### `/skip`

- Chama o serviço interno de skip.
- Informa faixa pulada e próxima faixa, quando houver.
- Na Etapa 12, chama primeiro o skip autoritativo, suprime o `Idle` intencional do
  player e inicia o item promovido pela API.

### `/join`

- Verifica se o membro está em canal de voz.
- Conecta ao canal do membro usando o adapter creator do guild.
- Aguarda a conexão atingir estado pronto com timeout explícito.
- Substitui de forma controlada uma conexão anterior da mesma guild.
- Publica `voice.connected` somente após a conexão estar pronta.
- Responde de forma ephemeral.

### `/leave`

- Destrói a conexão da guild, quando existir.
- A operação é idempotente quando o bot já estiver desconectado.
- Publica `voice.disconnected`.
- Responde de forma ephemeral.

## Runtime de voz

- `VoiceManager` é injetável nos comandos e no bootstrap.
- Uma guild possui no máximo uma `VoiceConnection`.
- Conexões são destruídas no shutdown.
- O manager observa estados de desconexão e erro sem registrar tokens, endpoints ou
  pacotes de voz.
- A Etapa 10 não cria `AudioResource`, não inicializa FFmpeg e não reproduz áudio.
- O client usa os intents `Guilds` e `GuildVoiceStates`. O segundo é necessário
  para receber `VOICE_STATE_UPDATE` e completar a conexão até o estado ready.

## Runtime de playback

- `AudioPlayerManager` mantém no máximo um `AudioPlayer` por guild conectada.
- `VoiceManager` expõe apenas verificação de conexão e subscription; não conhece
  regras de fila.
- URLs Audius `audio/mpeg` são entregues a `createAudioResource` e transcodificadas
  pelo FFmpeg.
- `@discordjs/opus` codifica o áudio para o Discord.
- transição natural para `Idle` conclui a faixa e solicita o próximo item à API;
- erro renova a fonte uma vez e, se persistir, marca o item como `failed`;
- skip e shutdown interrompem recursos sem tratar o `Idle` resultante como
  conclusão natural;
- eventos observacionais nunca incluem `streamUrl`.

## Cliente da API

- Base URL configurável.
- Header bearer aplicado centralmente.
- Timeout explícito.
- Parsing validado por schemas compartilhados quando aplicável.
- Erros técnicos não devem ser enviados diretamente ao Discord.

## Respostas

- Usar respostas ephemeral para erros de configuração, validação ou contexto.
- Respostas de `/play`, `/queue` e `/skip` podem ser públicas para dar visibilidade
  ao canal.
- Nunca registrar token Discord ou token interno.

## Limites da Etapa 10

O bot cria conexão de voz, mas ainda não resolve fontes, não reproduz áudio e não
possui estado de fila próprio.
