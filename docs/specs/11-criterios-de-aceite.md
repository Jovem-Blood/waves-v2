# 11 — Critérios de aceite

## Fundação

- [x] `pnpm install` conclui sem erro.
- [x] `.env.example` existe e não contém secrets reais.
- [x] TypeScript compila em strict.
- [x] lint, format check, typecheck e build funcionam na raiz.

## Web e API

- [x] `pnpm dev:web` inicia em `localhost:3000`.
- [x] `GET /api/health` retorna `{ "ok": true }`.
- [x] Busca Spotify funciona com credenciais válidas.
- [x] Secret Spotify não aparece no bundle cliente.
- [x] Adição, listagem, movimento e remoção persistem em SQLite.
- [x] Skip altera fila e player de forma consistente.
- [x] Endpoints internos rejeitam token ausente ou inválido.

## Contratos compartilhados

- [x] TrackMetadata, QueueItem, PlayerState e BotEvent possuem schemas Zod.
- [x] Payloads de adicionar, mover e play interno possuem schemas Zod.
- [x] Tipos TypeScript são inferidos dos schemas.
- [x] Schemas rejeitam campos extras e entradas inválidas.
- [x] Web e bot resolvem `@waves/shared` pelo workspace.
- [x] Testes unitários dos contratos passam.

## Banco e repositórios

- [x] Migração inicial cria `queue_items`, `player_state`, `resolved_sources` e
      `allowed_users`.
- [x] Repositório da fila preserva `TrackMetadata` e retorna datas ISO 8601.
- [x] Fila ativa contém apenas `queued` e `playing`, ordenados por `position`.
- [x] Remoção definitiva e atualização transacional de posições persistem em SQLite.
- [x] Estado inicial `idle` é criado uma única vez e atualizações do singleton persistem.
- [x] Testes usam SQLite em memória sem criar ou alterar `dev.db`.

## Serviços de domínio

- [x] Adição cria itens no fim da fila com ID e relógio injetáveis.
- [x] Movimento limita a posição e recalcula posições contíguas em transação.
- [x] Remoção definitiva recalcula a fila e retorna erro de domínio quando necessário.
- [x] Skip lógico preserva histórico, promove o próximo item e atualiza o singleton.
- [x] Falhas em operações coordenadas causam rollback completo de fila e player.
- [x] Services não dependem de HTTP, Discord, Spotify ou componentes Vue.

## Integração Spotify

- [x] Credenciais privadas são validadas com Zod sem revelar valores.
- [x] Client Credentials usa endpoint, autenticação e formulário documentados.
- [x] Token válido é reutilizado e renovado antes da expiração.
- [x] Busca mockada solicita somente faixas, com limite 10.
- [x] Respostas externas são validadas e normalizadas para `TrackMetadata[]`.
- [x] Erros externos são traduzidos sem incluir credenciais ou access tokens.
- [x] Client HTTP e relógio são injetáveis nos testes.

## API pública

- [x] Health, busca, fila e player são exercitados por HTTP.
- [x] Query, payloads e parâmetros de rota inválidos retornam `VALIDATION_ERROR`.
- [x] Itens inexistentes retornam `QUEUE_ITEM_NOT_FOUND`.
- [x] Falhas Spotify retornam `SPOTIFY_UNAVAILABLE` sem dados sensíveis.
- [x] Respostas de erro seguem exatamente `apiErrorSchema`.
- [x] Rotas permanecem finas e sem SQL ou regras de domínio duplicadas.

## API interna

- [x] Bearer ausente, malformado ou inválido retorna `401 UNAUTHORIZED`.
- [x] Token em query string ou body não autoriza requests.
- [x] Queue e skip internos reutilizam os mesmos services públicos.
- [x] Play interno seleciona o primeiro resultado e preserva o solicitante.
- [x] Play sem resultado retorna `404 TRACK_NOT_FOUND`.
- [x] Events valida o envelope, retorna 202 e registra apenas campos seguros.
- [x] Rotas internas não contêm SQL nem acessam o banco diretamente.

## Interface

- [x] A tela segue a direção Queue Social.
- [x] O fluxo principal funciona em viewport 390×844.
- [x] Música atual aparece no topo.
- [x] Fila aparece ordenada e atualiza por polling.
- [x] Busca fica acessível na região inferior.
- [x] Resultados podem ser adicionados.
- [x] Remoção, movimento e skip têm feedback.
- [x] Estados vazios, carregando e erro estão implementados.
- [x] Operações essenciais funcionam por teclado.

## Bot

- [x] `pnpm dev:bot` conecta com configuração válida.
- [x] `pnpm --filter bot bot:register` registra comandos no guild.
- [x] `/play` adiciona o primeiro resultado Spotify em testes com API mockada.
- [x] `/queue` mostra até 10 itens em testes.
- [x] `/skip` altera a fila por API mockada.
- [x] `/join` e `/leave` comunicam a limitação da fase 1.
- [x] O bot não importa client, schema ou driver de banco.

## Implementação do bot

- [x] Configuração é validada sem expor tokens.
- [x] Cliente HTTP aplica bearer, timeout e valida contratos compartilhados.
- [x] Cinco slash commands são definidos e registráveis por guild.
- [x] Interações desconhecidas não executam chamadas à API.
- [x] Falhas técnicas são traduzidas para mensagens amigáveis.
- [x] Bootstrap usa somente o intent `Guilds` e trata encerramento.

## Documentação e operação

- [x] README explica instalação e execução.
- [x] README explica Spotify e Discord setup.
- [x] README explica registro de comandos.
- [x] README descreve arquitetura e limitações.
- [x] Logs não expõem tokens ou secrets.

## Definição global de pronto

A fase 1 está concluída apenas quando todos os itens acima estiverem marcados e o
fluxo navegador → API → banco e Discord → bot → API → banco tiver sido validado.

## Fase 2 — Fundação de voz

- [x] `@discordjs/voice` é carregado sem falhas de runtime.
- [x] `/join` exige que o usuário esteja em canal de voz.
- [x] `/join` conecta o bot e só confirma após estado pronto.
- [x] Join repetido não vaza nem duplica conexões.
- [x] `/leave` destrói a conexão e é idempotente.
- [x] Shutdown destrói todas as conexões abertas.
- [x] API e `PlayerState` refletem guild e canal conectados.
- [x] Desconexão limpa guild e canal persistidos.
- [x] Erros e logs de voz não expõem credenciais ou dados do gateway.
- [x] Testes de voz não dependem de conexão real com Discord.
- [x] Validação manual confirma entrada e saída em um canal de teste.
- [x] Etapa 10 não resolve fontes nem reproduz áudio.

## Fase 2 — Resolução de fonte

- [x] Audius foi escolhido e registrado como provedor reproduzível.
- [x] Spotify permanece somente como busca e metadados.
- [x] `AudioSourceResolver` é injetável e validado por testes.
- [x] Respostas externas Audius são validadas com Zod.
- [x] Matching conservador usa título, artista, duração e rejeita versões alteradas.
- [x] Fonte válida é reutilizada de `resolved_sources`.
- [x] Fonte ausente ou expirada é renovada.
- [x] O schema existente foi reutilizado sem migração desnecessária.
- [x] O bot obtém a fonte somente pela API interna autenticada.
- [x] `SOURCE_NOT_FOUND` e `SOURCE_UNAVAILABLE` não expõem dados externos.
- [x] Logs e erros não incluem `streamUrl`.
- [x] Busca e stream reais do Audius foram validados sem iniciar reprodução.
- [x] Etapa 11 não cria `AudioPlayer`, não toca áudio e não altera `/play`.

## Fase 2 — Reprodução e avanço automático

- [x] Existe no máximo um `AudioPlayer` por guild conectada.
- [x] O bot obtém item e transições somente pela API interna.
- [x] Claim exige projeção de voz conectada no Nuxt.
- [x] Conclusão e falha promovem o próximo item atomicamente.
- [x] `/play` inicia playback quando conectado e preserva a fila autoritativa.
- [x] `/skip` interrompe o recurso sem registrar conclusão natural duplicada.
- [x] Falha do recurso força uma única renovação de fonte.
- [x] Falha persistente marca o item como `failed` e avança.
- [x] Eventos de playback não incluem URL assinada.
- [x] `@discordjs/opus`, FFmpeg e `libopus` foram detectados no runtime Windows.
- [x] Pipeline Audius → FFmpeg → `AudioResource` produziu bytes reais.
- [x] Reprodução Audius foi validada em canal Discord.
- [x] O smoke documentou que a cobertura Audius é insuficiente para uso principal.
- [x] Conclusão natural iniciou a próxima faixa no Discord.
- [x] `/skip` interrompeu o áudio e iniciou a próxima faixa no Discord.
- [x] YouTube Music é o primeiro resolvedor da cadeia.
- [x] Audius permanece como fallback funcional.
- [x] `source.provider` aceita `youtube_music` e `audius`.
- [x] Resultados do YouTube Music são validados e ranqueados conservadoramente.
- [x] Covers, remixes e versões incorretas são rejeitados quando não solicitados.
- [x] O resolvedor persiste video ID e TTL, sem expor URL de mídia.
- [x] Pelo menos dez faixas representativas atingem a taxa de acerto definida na
      spec de implementação.
- [x] O pipeline YouTube Music → FFmpeg → Discord é validado manualmente.
- [x] `/leave` durante playback cancela o transporte e devolve o item interrompido
      para `queued`.
- [x] Adição pela web retoma automaticamente uma fila ociosa quando o bot permanece
      conectado.
