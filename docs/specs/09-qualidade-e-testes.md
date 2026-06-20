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
- lifecycle do `AudioPlayerManager`, retry único, conclusão e skip intencional.
- claim, conclusão/falha e promoção atômica do próximo item.

### Integração

- Repositórios contra SQLite temporário.
- Rotas Nitro com payloads válidos e inválidos.
- Autorização dos endpoints internos.
- Fluxo adicionar → mover → remover → skip.
- Eventos de voz atualizando `PlayerState` pela API interna.
- Endpoint interno de resolução com bearer e contrato validado.
- Endpoints internos de claim e complete com bearer.

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
