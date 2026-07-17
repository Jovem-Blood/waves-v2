# Proxima rodada de lapidacao

Este documento detalha pontos de melhoria para um LLM transformar em plano de
execucao. O foco e reduzir falhas silenciosas, melhorar diagnostico para usuarios
e manter a experiencia Queue Social estavel em filas grandes.

1. **Persistir motivo real de falha de playback**
   - Objetivo: quando uma faixa falhar, o usuario deve saber se o problema foi
     resolucao de fonte, indisponibilidade do provider, stream invalido, erro do
     player ou falha de comunicacao com a API interna.
   - Problema atual: `queue_items.status = failed` preserva que houve falha, mas
     nao guarda o motivo. O painel so consegue exibir uma mensagem generica.
   - Implementacao sugerida:
     - Adicionar campos opcionais em `queue_items`, por exemplo
       `failure_code`, `failure_message` e talvez `playback_attempt_id`.
     - Criar migration Drizzle/SQLite para os novos campos.
     - Estender `queueItemSchema` e tipos compartilhados em `packages/shared`.
     - Estender `completePlaybackInputSchema` para aceitar motivo de falha
       quando `outcome = failed`.
     - No bot, mapear `classifyPlaybackError(error)` e erros seguros como
       `SOURCE_NOT_FOUND`, `SOURCE_UNAVAILABLE`, `SOURCE_HTTP_STATUS`,
       `DEMUX_PROBE_FAILED`, `PLAYER_ERROR`, `PREMATURE_IDLE` e
       `PLAYBACK_SYNC_FAILED` para um codigo persistivel.
     - No `PlayerStateService.completePlayback`, gravar o motivo somente quando
       o outcome for `failed`; limpar ou ignorar em `played`.
   - Arquivos provaveis:
     - `apps/web/server/db/schema.ts`
     - `apps/web/drizzle/*.sql`
     - `apps/web/server/repositories/queue.repository.ts`
     - `apps/web/server/services/player-state.service.ts`
     - `apps/bot/src/playback/audio-player-manager.ts`
     - `packages/shared/src/schemas/queue.schema.ts`
     - `packages/shared/src/schemas/playback.schema.ts`
   - Testes esperados:
     - Contratos compartilhados para falha com e sem motivo.
     - Repository preservando `failureCode`/`failureMessage`.
     - Service marcando item como `failed` com motivo.
     - Bot client enviando payload de falha com codigo.
   - Cuidados:
     - Nao persistir `streamUrl`, tokens, cookies, headers ou dados sensiveis.
     - Manter compatibilidade com falhas antigas que nao tenham motivo salvo.

2. **Exibir detalhe de falha no historico**
   - Objetivo: a pagina `/hist` deve explicar por que uma faixa falhou, usando o
     motivo persistido na fila historica.
   - Problema atual: o historico mostra status `Falhou`, mas nao diferencia uma
     busca sem resultado de um erro de stream ou de player.
   - Implementacao sugerida:
     - Criar um helper de apresentacao, por exemplo `playbackFailureCopy.ts`, que
       mapeia `failureCode` para titulo curto e descricao em portugues.
     - Em `HistoryItem.vue`, quando `item.status === 'failed'`, renderizar uma
       linha secundaria com a explicacao.
     - Em desktop, manter a tabela escaneavel: status na coluna de resultado e
       detalhe compacto na coluna de faixa ou como texto auxiliar.
     - Em mobile, usar texto curto abaixo dos metadados da faixa.
   - Arquivos provaveis:
     - `apps/web/app/components/HistoryItem.vue`
     - `apps/web/app/components/HistoryPanel.vue`
     - `apps/web/app/utils/*`
     - `apps/web/test/components/history-page.test.ts`
   - Testes esperados:
     - Renderiza detalhe para `SOURCE_NOT_FOUND`.
     - Renderiza fallback generico para codigo desconhecido ou ausente.
     - Mantem estados `played` e `skipped` sem detalhe de falha.
   - Cuidados:
     - Nao transformar o historico em tela de log tecnico.
     - Texto deve ser util para usuario final, nao apenas para dev.

3. **Criar centro de eventos recentes no painel principal**
   - Objetivo: manter uma trilha curta de eventos recentes, alem dos toasts
     temporarios, para que o usuario consiga entender o que acabou de acontecer.
   - Problema atual: toasts somem; se o usuario nao viu, perde o contexto de
     falhas, reconexoes, autoplay sem recomendacao ou problemas de sync.
   - Implementacao sugerida:
     - Criar um composable `useRecentEvents` no cliente, inicialmente local e
       derivado de eventos ja observados pelo painel: falha detectada no
       historico, erro de polling, bot offline, voice reconnecting, autoplay com
       `failureCode`.
     - Renderizar um bloco compacto no painel principal, provavelmente abaixo do
       status/header ou no topo da coluna secundaria no desktop.
     - Itens devem ter tipo, timestamp relativo, mensagem curta e severidade.
     - Limitar a 3-5 eventos visiveis, com opcao simples de limpar.
   - Arquivos provaveis:
     - `apps/web/app/pages/index.vue`
     - `apps/web/app/composables/useRecentEvents.ts`
     - `apps/web/app/components/RecentEventsPanel.vue`
     - `apps/web/app/composables/useQueue.ts`
     - `apps/web/app/composables/useOperationalStatus.ts`
   - Testes esperados:
     - Falha de playback adiciona evento.
     - Erro de API adiciona evento uma unica vez por periodo.
     - Eventos antigos sao limitados ou descartados.
   - Cuidados:
     - Evitar duplicar tudo que ja aparece como estado permanente.
     - Nao ocupar area dominante da fila no mobile.

4. **Fortalecer estados offline, reconectando e erro de API**
   - Objetivo: controles devem comunicar claramente quando uma acao nao pode
     funcionar por web/API indisponivel, bot offline ou voz reconectando.
   - Problema atual: ha status operacional e alguns controles desabilitados, mas
     ainda existem falhas que aparecem so como erro generico ou ficam implicitas.
   - Implementacao sugerida:
     - Auditar `controlsDisabledReason` e propagar motivos especificos para
       `PlayerBar`, `SpotifySearch`, `QueuePanel` e autoplay.
     - Se `/api/queue`, `/api/player` ou `/api/status` falhar, mostrar aviso
       persistente no painel, nao apenas toast.
     - Diferenciar:
       - web/API indisponivel;
       - bot offline;
       - bot sem canal de voz;
       - voice reconectando;
       - provider externo indisponivel.
     - Desabilitar mutacoes afetadas com tooltip/label acessivel.
   - Arquivos provaveis:
     - `apps/web/app/pages/index.vue`
     - `apps/web/app/components/PlayerBar.vue`
     - `apps/web/app/components/QueuePanel.vue`
     - `apps/web/app/components/SpotifySearch.vue`
     - `apps/web/app/composables/useQueue.ts`
     - `apps/web/app/composables/usePlayerState.ts`
   - Testes esperados:
     - Controles desabilitam com motivo quando bot esta offline.
     - Polling com erro mostra aviso persistente.
     - Recuperacao da API limpa o aviso.
   - Cuidados:
     - Nao bloquear busca Spotify se apenas o bot/voice estiver offline, a menos
       que a acao de adicionar dependa de estado indisponivel.

5. **Validar e ajustar scroll mobile da fila**
   - Objetivo: garantir que filas grandes funcionem bem em mobile sem esconder o
     player, os controles principais ou a busca.
   - Problema atual: no desktop a fila pode usar scroll interno; no mobile a
     pagina inteira rolavel pode ser correta, mas precisa ser validada com muitos
     itens, teclado aberto e toasts.
   - Implementacao sugerida:
     - Testar manualmente viewports 360px, 390px, 500px, tablet intermediario e
       desktop.
     - Avaliar se o `PlayerBar` deve ficar sticky no mobile ou se basta manter
       controles no topo.
     - Garantir que `QueuePanel` nao crie scroll horizontal.
     - Verificar se drag-and-drop e botoes de mover continuam usaveis com muitos
       registros.
     - Ajustar `max-height`, `position: sticky` ou ordem dos blocos apenas se a
       validacao mostrar problema real.
   - Arquivos provaveis:
     - `apps/web/app/assets/css/main.css`
     - `apps/web/app/components/QueuePanel.vue`
     - `apps/web/app/components/PlayerBar.vue`
     - `apps/web/test/components/queue-social.test.ts`
   - Testes esperados:
     - Testes unitarios para render com muitos itens.
     - Se houver ferramenta de browser disponivel, capturar screenshots mobile e
       desktop para comparar com `DESIGN.md` e `pencil.pen`.
   - Cuidados:
     - Mobile-first: nao copiar o comportamento desktop se ele prejudicar o fluxo
       vertical natural no celular.

6. **Adicionar acao "tentar novamente" para faixa falhada**
   - Objetivo: permitir recuperar rapidamente uma faixa que falhou, sem o usuario
     precisar buscar de novo.
   - Problema atual: a faixa falhada fica no historico, mas nao ha acao direta
     para re-adicionar ou forcar nova resolucao.
   - Implementacao sugerida:
     - No historico, adicionar acao secundaria para `failed`: "Tentar novamente".
     - A primeira versao pode simplesmente re-adicionar a mesma `track` ao fim da
       fila via endpoint existente `POST /api/queue`.
     - Uma versao posterior pode aceitar `placement = next`.
     - Para forcar nova resolucao de audio, avaliar se o bot ja chama
       `resolveSource(..., forceRefresh = true)` em retry; se precisar de novo
       contrato, manter como etapa separada.
   - Arquivos provaveis:
     - `apps/web/app/components/HistoryItem.vue`
     - `apps/web/app/components/HistoryPanel.vue`
     - `apps/web/app/composables/useHistory.ts`
     - `apps/web/app/composables/useQueue.ts`
     - `apps/web/server/api/queue/index.post.ts`
   - Testes esperados:
     - Botao aparece somente para `failed`.
     - Click chama add queue com a track correta.
     - Duplicata ativa retorna mensagem clara.
   - Cuidados:
     - Nao restaurar o mesmo registro historico; criar novo item de fila para
       preservar auditoria.

7. **Detalhar diagnostico de autoplay**
   - Objetivo: transformar o aviso generico de autoplay em mensagens especificas
     e acionaveis.
   - Problema atual: `failureCode` existe, mas a UI mostra quase sempre a mesma
     frase.
   - Implementacao sugerida:
     - Criar mapa de copy para:
       - `spotify_unavailable`;
       - `invalid_response`;
       - `recommendation_unavailable`;
       - `metadata_unavailable`;
       - `no_seeds`;
       - `no_candidates`.
     - Renderizar mensagem curta no `QueuePanel`.
     - Opcional: incluir o evento no centro de eventos recentes.
   - Arquivos provaveis:
     - `apps/web/app/components/QueuePanel.vue`
     - `apps/web/app/composables/useAutoplay.ts`
     - `packages/shared/src/schemas/autoplay.schema.ts`
     - `apps/web/test/components/queue-social.test.ts`
   - Testes esperados:
     - Cada codigo conhecido mostra copy correta.
     - Codigo ausente ou desconhecido usa fallback generico.
   - Cuidados:
     - Nao expor detalhes de provider que nao ajudem o usuario.

8. **Planejar sincronizacao em tempo real com SSE**
   - Objetivo: reduzir dependencia de polling para fila, player, status e falhas.
   - Problema atual: o painel descobre mudancas a cada 2,5s e precisa inferir
     que um item sumiu. SSE permitiria emitir evento `queue.item_failed`,
     `player.updated`, `status.changed` diretamente.
   - Implementacao sugerida:
     - Criar endpoint Nitro SSE, por exemplo `/api/events`.
     - Criar pequeno event bus server-side em memoria para publicar mudancas de
       fila/player/status.
     - Services publicam eventos apos mutacoes relevantes.
     - Cliente cria composable `useRealtimeEvents` com reconexao e fallback para
       polling.
     - Manter polling como backup enquanto SSE amadurece.
   - Arquivos provaveis:
     - `apps/web/server/api/events.get.ts`
     - `apps/web/server/services/*`
     - `apps/web/server/utils/*`
     - `apps/web/app/composables/useQueue.ts`
     - `apps/web/app/composables/usePlayerState.ts`
     - `packages/shared/src/schemas/events.schema.ts`
   - Testes esperados:
     - Evento e emitido apos add/remove/move/complete.
     - Cliente aplica evento sem quebrar polling.
     - Reconexao volta para polling temporariamente.
   - Cuidados:
     - Como o runtime pode rodar em mais de um processo no futuro, deixar claro
       que event bus em memoria e solucao local/dev. Para escala, precisaria
       broker externo ou storage compartilhado.

9. **Fazer verificacao visual responsiva sistematica**
   - Objetivo: validar que mudancas de UI nao degradam a direcao Queue Social.
   - Problema atual: testes unitarios cobrem estrutura, mas nao garantem que a UI
     renderizada esteja boa com fila grande, historico grande, toasts e estados
     de erro.
   - Implementacao sugerida:
     - Rodar app local com dados mockados ou banco seedado.
     - Capturar screenshots em:
       - 360 x 800;
       - 390 x 844;
       - 500 x 1130;
       - 768 x 1024;
       - 1440 x 1024.
     - Estados a validar:
       - fila vazia;
       - fila com 30 itens;
       - faixa tocando;
       - falha recente;
       - bot offline;
       - voice reconnecting;
       - historico com muitos itens;
       - toasts empilhados.
   - Arquivos provaveis:
     - `apps/web/test/components/*`
     - Possivel script novo em `apps/web/scripts/*`
   - Testes esperados:
     - Se houver Playwright ou ferramenta de browser disponivel, criar smoke
       visual leve. Caso contrario, documentar checklist manual.
   - Cuidados:
     - Seguir `DESIGN.md` e `pencil.pen`; qualquer divergencia material deve ser
       registrada antes de mudar linguagem visual.

10. **Melhorar observabilidade sem expor segredo**
    - Objetivo: facilitar diagnostico de falhas reais durante uso privado.
    - Problema atual: logs ja possuem `playbackAttemptId`, mas o usuario nao tem
      como relacionar uma falha no painel com um trecho de log sem procurar por
      horario/faixa.
    - Implementacao sugerida:
      - Persistir `playbackAttemptId` junto da falha, sem URLs nem headers.
      - Mostrar esse ID apenas em area discreta, talvez tooltip/detalhe avancado
        no historico de falhas.
      - Padronizar logs web/bot para sempre incluir `queueItemId`,
        `playbackAttemptId`, `provider` e `errorCode` quando aplicavel.
      - Adicionar redaction para qualquer campo sensivel conhecido em logs.
    - Arquivos provaveis:
      - `apps/bot/src/playback/audio-player-manager.ts`
      - `apps/bot/src/observability.ts`
      - `apps/web/server/utils/logger.ts`
      - `apps/web/server/services/player-state.service.ts`
      - `apps/web/app/components/HistoryItem.vue`
    - Testes esperados:
      - Unit tests de classificacao/redaction.
      - Contrato aceita `playbackAttemptId` opcional.
    - Cuidados:
      - Nunca registrar `streamUrl`, `Authorization`, cookies, signatures,
        tokens, `visitorData` ou `poToken`.

## Ordem recomendada

1. Persistir motivo real de falha de playback.
2. Exibir detalhe de falha no historico e nos toasts.
3. Adicionar "tentar novamente" para faixa falhada.
4. Fortalecer estados offline/reconectando/API indisponivel.
5. Detalhar diagnostico de autoplay.
6. Criar centro de eventos recentes.
7. Validar scroll/responsividade mobile e desktop com fila grande.
8. Planejar e implementar SSE com polling como fallback.
9. Melhorar observabilidade correlacionando historico e logs.

## Gates minimos por rodada

- `pnpm typecheck`
- `pnpm lint`
- Testes focados do pacote alterado.
- Para mudancas de contrato compartilhado, rodar tambem testes de
  `packages/shared`.
- Para mudancas visuais relevantes, validar mobile primeiro e depois desktop.
