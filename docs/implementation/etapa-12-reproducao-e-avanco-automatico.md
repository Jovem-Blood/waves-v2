# Etapa 12 — Reprodução e avanço automático

## Objetivo

Consumir a fonte temporária entregue pela API interna, criar um `AudioPlayer` por
guild e coordenar conclusão, falha, skip e avanço da fila com o Nuxt como fonte da
verdade.

## Estado recebido

- conexão de voz real e lifecycle concluídos na Etapa 10;
- Audius isolado atrás de `AudioSourceResolver`;
- cache/renovação persistidos pelo Nuxt em `resolved_sources`;
- bot obtém a fonte por
  `POST /api/internal/bot/sources/:queueItemId/resolve`;
- URLs assinadas têm TTL conservador e não podem ser logadas;
- nenhuma reprodução foi antecipada.

## Antes de implementar

1. Consultar documentação atual de `@discordjs/voice`, FFmpeg e codec escolhido via
   Context7.
2. Decidir e registrar a biblioteca Opus necessária no ambiente Windows.
3. Confirmar o formato real retornado pelo Audius e quando FFmpeg é necessário.
4. Definir eventos tipados para início, conclusão e falha de faixa.
5. Definir a operação atômica no Nuxt para concluir/falhar o item e selecionar o
   próximo.

## Escopo

- `AudioPlayerManager` injetável, um player por guild;
- criação de `AudioResource` a partir da fonte resolvida;
- subscription na conexão de voz existente;
- início somente quando houver conexão e item elegível;
- eventos seguros de playback;
- avanço automático coordenado pela API;
- skip interrompendo o stream e avançando atomicamente;
- recuperação limitada para URL expirada ou fonte indisponível;
- testes sem abrir sockets reais nem depender da rede.

## Fora do escopo

- pause, resume, volume, seek e progresso;
- mudanças de UI;
- filas independentes por guild;
- download permanente;
- trocar ou adicionar provedor de áudio sem nova decisão.

## Gates

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Execução em 20 de junho de 2026

### Implementado

- `@discordjs/opus` 0.10.0 com build nativo explicitamente autorizado;
- `AudioPlayerManager` injetável, um player por guild;
- subscription pelo `VoiceManager`;
- recurso criado da URL Audius via FFmpeg;
- claim autoritativo antes de iniciar;
- conclusão/falha e promoção do próximo item em transação no Nuxt;
- `/play` inicia quando conectado e não interrompe playback existente;
- `/skip` atualiza a API, suprime `Idle` intencional e inicia o próximo;
- retry único com `forceRefresh`;
- eventos `playback.started`, `playback.finished` e `playback.failed`;
- cleanup no leave, desconexão inesperada e shutdown;
- testes sem sockets, rede ou Discord real.

### Validação de runtime

`generateDependencyReport` confirmou:

- `@discordjs/voice` 0.19.2;
- `@discordjs/opus` 0.10.0;
- FFmpeg 8.1.1 com `libopus`;
- AES-256-GCM nativo e DAVE disponíveis.

Uma URL Audius real foi entregue a `createAudioResource`; o pipeline FFmpeg/Opus
produziu 407 bytes na primeira leitura. A URL assinada não foi exibida ou logada.

### Pendente manual

1. iniciar web e bot;
2. executar `/join` em um canal de teste;
3. executar `/play` para uma faixa com correspondência Audius;
4. confirmar áudio audível e `PlayerState.playing`;
5. aguardar conclusão e confirmar avanço automático;
6. adicionar duas faixas, executar `/skip` e confirmar interrupção/avanço;
7. executar `/leave` durante playback e confirmar cleanup.

## Estado

Implementação concluída, mas a Etapa 12 permanece aberta até o smoke manual no
Discord e a execução final dos gates após qualquer correção resultante.
