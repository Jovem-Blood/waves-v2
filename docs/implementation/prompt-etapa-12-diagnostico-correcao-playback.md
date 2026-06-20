# Prompt de diagnóstico e correção — Playback da Etapa 12

Continue o projeto Waves em `C:\Users\luiss\Projects\waves` e diagnostique e corrija
o playback real da Etapa 12.

Não implemente a Etapa 13. Não adicione pause, resume, volume, progresso, seek ou
mudanças de UI.

## Resultado exigido

Uma faixa adicionada por `/play`, com o bot conectado, deve:

1. permanecer na fila enquanto está tocando;
2. produzir áudio correto no Discord;
3. não ser marcada como `played` após poucos milissegundos;
4. concluir naturalmente somente após duração plausível;
5. promover e tocar o próximo item;
6. executar skip real sem conclusão duplicada;
7. falhar com estado consistente quando a fonte não puder ser reproduzida.

Não declare conclusão sem smoke Discord real.

## Leitura obrigatória

Leia integralmente:

- `AGENTS.md`;
- `SPEC.md`;
- `README.md`;
- `docs/specs/02-arquitetura.md`;
- `docs/specs/03-dominio-e-contratos.md`;
- `docs/specs/04-banco-de-dados.md`;
- `docs/specs/05-api-e-servicos-web.md`;
- `docs/specs/06-bot-discord.md`;
- `docs/specs/08-configuracao-seguranca-observabilidade.md`;
- `docs/specs/09-qualidade-e-testes.md`;
- `docs/specs/10-plano-de-implementacao.md`;
- `docs/specs/11-criterios-de-aceite.md`;
- `docs/specs/12-decisoes.md`;
- `docs/implementation/etapa-11-resolucao-de-fonte.md`;
- `docs/implementation/etapa-12-reproducao-e-avanco-automatico.md`;
- `docs/implementation/etapa-12-youtube-music.md`;
- `docs/implementation/etapa-12-youtube-music-smoke.json`;
- `docs/implementation/prompt-etapa-12-observabilidade-playback.md`;
- código e testes atuais de playback, voz, API, fila, player e resolução.

Sempre preserve mudanças existentes. O worktree está significativamente modificado
e contém a implementação ainda não concluída da Etapa 12.

## Arquitetura que deve ser preservada

- Nuxt/Nitro é a fonte da verdade da fila e do player.
- O bot nunca acessa SQLite ou Drizzle.
- Spotify fornece somente busca e metadados.
- YouTube Music via `youtubei.js` 17.0.1 é o resolver primário.
- Audius é fallback.
- O bot recebe somente `ResolvedAudioSource`.
- `VoiceConnection`, `AudioPlayer`, `AudioResource` e streams são efêmeros.
- Não adicionar cookies, OAuth, PO token, visitor data configurável ou proxy.
- Não substituir YouTube.js por play-dl, yt-dlp, Lavalink ou outro provedor.

## Estado técnico confirmado

### Resolução de fonte

- contrato aceita `youtube_music` e `audius`;
- matching YouTube Music passou em 10/10 faixas;
- 10/10 URLs novas entregaram bytes no smoke de catálogo;
- fallback Audius entregou bytes;
- video ID e TTL são persistidos em `resolved_sources`;
- refresh tenta o mesmo video ID antes de nova busca;
- objetos YouTube.js permanecem no adapter web;
- a decifração do player ocorre em `node:vm`, com contexto mínimo e timeout.

### Runtime de voz

- `@discordjs/voice` 0.19.2;
- `@discordjs/opus` 0.10.0;
- FFmpeg 8.1.1 com `libopus`;
- join e leave já funcionaram no Discord;
- subscription do `AudioPlayer` à conexão existe.

### Falha real observada

Em 20 de junho de 2026:

- o bot entrou no canal;
- `/play` adicionou a faixa;
- o Nuxt fez claim e marcou o item como `playing`;
- foi emitido `playback.started`;
- aproximadamente 130–150 ms depois foi emitido `playback.finished`;
- nenhum áudio foi ouvido;
- os itens foram marcados como `played`;
- o runtime avançou rapidamente até esvaziar a fila;
- o `PlayerState` terminou `idle`, sem item atual.

Exemplos afetados:

- `No One Noticed`;
- `Hurt`.

O banco mostrou fontes `youtube_music` e itens consumidos como `played`.

### Causa já comprovada

Uma URL persistida respondeu:

- `fetch` com range pequeno: `206` e bytes;
- FFmpeg abrindo a URL diretamente: `403`, zero bytes.

Também foi comprovado:

- download HTTP sem range era rejeitado;
- `Range: bytes=0-` era rejeitado;
- range de 1 MiB era rejeitado;
- ranges de 16 KiB, 64 KiB, 256 KiB e 512 KiB eram aceitos.

O runtime anterior passava a URL diretamente para `createAudioResource`, portanto
FFmpeg fazia a requisição bloqueada. Como o player transitava brevemente para
`Playing` e depois `Idle` sem evento `error`, o código classificava a falha como
conclusão natural.

### Correção presente, ainda sem smoke Discord

O worktree atual contém:

- `createRangedAudioStream`;
- fetch sequencial em blocos de 512 KiB;
- validação de `206` e `Content-Range`;
- memória limitada por backpressure do `Readable`;
- `demuxProbe` antes de `createAudioResource`;
- `Idle` com playback inferior a um segundo tratado como falha recuperável;
- retry único com `forceRefresh`;
- testes do bot para ranges e `Idle` prematuro.

Essa correção passou em:

- 28 testes do bot;
- lint;
- typecheck;
- format check.

Ela não foi validada ponta a ponta porque a execução externa foi interrompida por
limite de uso. Não assuma que está correta apenas porque os testes passam.

## Primeira tarefa: observabilidade

Verifique se o prompt
`docs/implementation/prompt-etapa-12-observabilidade-playback.md` já foi
implementado.

Se não foi, implemente primeiro a instrumentação mínima necessária para observar:

- claim;
- resolve;
- provider;
- ranges;
- probe;
- criação do recurso;
- transições do player;
- duração;
- retry;
- complete/fail;
- próximo item.

Não prossiga por tentativa e erro sem esses sinais.

## Plano obrigatório de diagnóstico

### 1. Reproduzir com uma faixa

1. Limpar ou isolar uma fila de teste de forma segura pela API/domínio.
2. Iniciar web e bot com logs capturados.
3. Executar `/join`.
4. Adicionar uma única faixa.
5. Registrar a sequência por `queueItemId` e `playbackAttemptId`.
6. Confirmar:
   - provider;
   - source identifier;
   - ranges solicitados;
   - bytes recebidos;
   - tipo retornado por `demuxProbe`;
   - estado do recurso;
   - transições do player;
   - playback duration;
   - primeiro ponto de falha.

### 2. Validar o transporte fora do Discord

Com uma URL nova, sem imprimi-la:

1. consumir `createRangedAudioStream`;
2. confirmar múltiplos ranges;
3. confirmar backpressure e cancelamento;
4. passar por `demuxProbe`;
5. criar `AudioResource`;
6. ler bytes reais de `resource.playStream` por pelo menos três segundos;
7. confirmar que o stream não encerra imediatamente;
8. repetir com WebM/Opus e, se disponível, M4A/AAC.

Não use URL antiga do banco para concluir o teste. Gere uma resolução nova.

### 3. Auditar detalhes de HTTP

Verifique:

- limites reais de range;
- `Content-Range`;
- content length total;
- comportamento ao cruzar o último bloco;
- timeout durante headers e body;
- abort/cancelamento quando skip, leave ou shutdown ocorrer;
- URL expirada no meio do stream;
- retry sem continuar lendo o stream antigo;
- ausência de downloads concorrentes após cleanup.

### 4. Auditar o lifecycle do player

Confirme:

- `Buffering → Playing` não é confundido com conclusão;
- `Playing → Idle` usa duração plausível;
- erro assíncrono não disputa com `Idle`;
- retry não deixa dois recursos ativos;
- skip suprime apenas o `Idle` intencional correspondente;
- leave/shutdown cancelam fetch e recurso;
- falha definitiva chama `completePlayback(... failed)`;
- conclusão natural chama `played` uma única vez;
- complete/fail não avança duas vezes;
- o próximo item só inicia após resposta autoritativa da API.

Procure condições de corrida em `session.current` e `session.settling`.

### 5. Auditar o estado Nuxt

Confirme no banco e pelos endpoints:

- somente um item `playing`;
- `currentQueueItemId` aponta para o item correto;
- item não vira `played` em falha de transporte;
- falha vira `failed`;
- posições ativas permanecem contíguas;
- fila não é drenada por loop rápido;
- restart do bot não deixa item autoritativo preso sem estratégia de recuperação.

## Correções permitidas

Altere somente o necessário na Etapa 12:

- transporte HTTP segmentado;
- probing/demux/transcode;
- lifecycle e classificação de término;
- cancelamento;
- retry;
- sincronização complete/fail;
- logs e testes associados.

Não altere UI ou contratos da Etapa 13.

## Testes obrigatórios

Inclua testes para:

- múltiplos ranges até EOF;
- último range menor;
- `403`, `416`, range inválido e body vazio;
- timeout no primeiro e em blocos posteriores;
- cancelamento durante skip/leave;
- erro do stream após `Playing`;
- `Idle` prematuro;
- `Idle` natural com duração plausível;
- corrida `error` + `Idle`;
- retry único;
- falha definitiva;
- avanço de dois itens sem duplicidade;
- fila com três itens não ser drenada após falha do primeiro;
- ausência de URLs e secrets em logs.

## Smoke Discord obrigatório

Com web e bot ativos:

1. `/join`;
2. adicionar uma única faixa YouTube Music;
3. confirmar áudio correto por pelo menos 30 segundos;
4. confirmar item `playing` durante o áudio;
5. confirmar que a fila não é limpa;
6. tocar três faixas;
7. aguardar conclusão natural e avanço;
8. adicionar duas faixas e usar `/skip`;
9. confirmar interrupção e próximo item;
10. `/leave` durante playback;
11. confirmar cancelamento dos ranges e cleanup;
12. revisar logs sem URLs, tokens ou payloads InnerTube.

Registre somente resultados realmente observados.

## Gates

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
pnpm --filter bot exec node -e "import('@discordjs/voice').then(m => console.log(m.generateDependencyReport()))"
```

## Documentação final

Atualize:

- `README.md`;
- specs 05, 06, 08, 09, 10, 11 e 12;
- `docs/implementation/README.md`;
- `docs/implementation/etapa-12-reproducao-e-avanco-automatico.md`;
- `docs/implementation/etapa-12-youtube-music.md`;
- handoff da Etapa 13.

Não marque a Etapa 12 concluída enquanto áudio, conclusão natural, skip e cleanup
não forem confirmados no Discord.
