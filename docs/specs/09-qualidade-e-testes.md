# 09 — Qualidade e testes

## Ferramentas

- TypeScript strict.
- ESLint.
- Prettier.
- Test runner compatível com o monorepo.
- Build das duas aplicações como verificação obrigatória.

## Pirâmide de testes

### Unitários

- Schemas e normalização de Spotify.
- Reordenação e recálculo de posições.
- Skip lógico.
- Mapeamento de erros.
- Formatação das respostas do bot.
- Ciclo do `VoiceManager` com adapter mockado.
- Idempotência de join/leave e limpeza no shutdown.
- Matching de fonte por título, artista e duração.
- Rejeição de versões alteradas, streams gated e respostas externas inválidas.
- Cache e renovação de `resolved_sources`.
- ranking de candidatos YouTube Music e rejeição de versões incorretas;
- fallback YouTube Music → Audius;
- seleção e expiração de formato de áudio do YouTube.
- lifecycle do `AudioPlayerManager`, retry único, conclusão e skip intencional.
- claim, conclusão/falha e promoção atômica do próximo item.

### Integração

- Repositórios contra SQLite temporário.
- Rotas Nitro com payloads válidos e inválidos.
- Autorização dos endpoints internos.
- Fluxo adicionar → mover → remover → skip.
- Eventos de voz atualizando `PlayerState` pela API interna.
- Endpoint interno de resolução com bearer e contrato validado.
- respostas InnerTube mockadas e validadas sem rede nos testes automatizados.

### Smoke de provedor

- pesquisar ao menos dez faixas representativas do catálogo esperado;
- incluir música popular, antiga, brasileira, colaboração, versão explícita e título
  com caracteres especiais;
- confirmar que o video ID escolhido corresponde à gravação pretendida;
- confirmar bytes de áudio reais para pelo menos três candidatos;
- confirmar fallback Audius com candidato controlado;
- não imprimir URLs, cookies ou tokens durante o smoke.
- Endpoints internos de claim e complete com bearer.

O smoke de YouTube Music de 20 de junho de 2026 obteve 10/10 candidatos corretos,
10/10 streams com bytes reais, zero cover/remix incorreto conhecido e fallback
Audius com bytes reais.

### Interface

- Renderização dos estados essenciais.
- Busca e adição à fila.
- Polling e limpeza de timers.
- Botões desabilitados durante mutações.
- Reordenação por controle acessível.

### Smoke tests

- `GET /api/health`.
- Aplicação web inicia.
- Bot carrega comandos sem conectar ao banco.
- Bundle cliente não contém secrets conhecidos.
- Bot conecta e desconecta de um canal de voz de teste sem reproduzir áudio.

## Testabilidade de voz

- Comandos dependem de uma interface `VoiceManager`, não de funções globais.
- O adapter de `@discordjs/voice` fica atrás de uma factory injetável.
- Testes automatizados não abrem sockets de voz reais.
- Estados ready, disconnected, erro e timeout são simuláveis.
- Estados Playing, Idle e erro do player são simuláveis sem FFmpeg ou Discord nos
  testes unitários.
- A validação manual usa um guild e canal de voz de teste.

## Testabilidade

- Spotify deve ser acessado por um cliente injetável ou facilmente mockável.
- Relógio e geração de IDs devem ser isoláveis quando necessário.
- Serviços devem aceitar dependências por parâmetros ou factories simples.
- Banco de testes deve usar arquivo temporário ou memória compatível.

## Gates por etapa

## Observabilidade de playback

Testes automatizados cobrem sequência normal, `Idle` prematuro, retry, falha
definitiva, skip sem conclusão natural, ranges sem URL, fallback, cache hit/miss,
redaction e configuração de `LOG_LEVEL`.

O smoke manual inicia web e bot com stdout/stderr em arquivos `*.log` ignorados,
executa `/join`, adição, `/skip` e `/leave`, reconstrói a sequência pelo
`playbackAttemptId` e busca por `streamUrl`, `Authorization`, `signature`, `token`,
`cookie`, `visitorData`, `poToken` e URLs de mídia. Os arquivos não são versionados.

O smoke final de 20 de junho de 2026 também validou autojoin por `/play`, retomada
de fila adicionada pela web, cancelamento explícito em skip/leave e reparação do
item interrompido para `queued`. Os testes automatizados incluem status HTTP
400/403/416, range inválido, body vazio, timeout inicial e posterior, cancelamento
e corrida entre resolução e leave.

Antes de concluir uma etapa:

1. Typecheck passa.
2. Lint passa.
3. Testes relacionados passam.
4. Build afetado passa.
5. Critérios manuais da etapa foram verificados.

## Padrão de revisão

- Sem regras duplicadas entre rota, bot e frontend.
- Sem secrets no código.
- Sem acesso ao banco no bot.
- Sem `any` não justificado.
- Erros externos traduzidos para contratos internos.
- Componentes preservam acessibilidade e mobile-first.
