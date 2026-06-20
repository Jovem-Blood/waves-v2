# 12 — Decisões registradas

## D-001 — Raiz do workspace

**Decisão:** usar o diretório atual como raiz do monorepo, sem criar uma pasta
aninhada `discord-music-panel`.

**Motivo:** o workspace já representa o projeto e começou vazio.

## D-002 — Nome

**Decisão:** o produto e o bot se chamam Waves. `discord-music-panel` permanece
como nome técnico do monorepo/package raiz.

## D-003 — Dono do domínio

**Decisão:** Nuxt/Nitro é o único proprietário da fila, estado e banco.

**Consequência:** o bot é um cliente HTTP e não importa Drizzle.

## D-004 — Sem áudio na fase 1

**Decisão:** player é um estado lógico, sem streaming real.

**Motivo:** validar contratos, UX e integração Discord antes da complexidade de voz.

## D-005 — Spotify como único provedor

**Decisão:** busca e metadados usam apenas Spotify Client Credentials.

**Consequência:** `TrackMetadata.provider` aceita apenas `spotify` nesta fase.

## D-006 — Interface Queue Social

**Decisão:** adotar a terceira direção visual.

**Características:**

- minimalista e direta.
- mobile-first.
- música atual no topo.
- fila como conteúdo principal.
- busca e resultados na parte inferior.
- estética musical escura com esmeralda e violeta.

## D-007 — Polling

**Decisão:** usar polling de 2 a 3 segundos.

**Motivo:** simplicidade operacional adequada à fase 1.

## D-008 — Autenticação adiada

**Decisão:** não implementar login no painel na fase 1.

**Risco:** o painel não deve ser publicado sem proteção externa.

**Evolução:** Discord OAuth e `allowed_users`.

## D-009 — Histórico de itens

**Decisão:** manter itens reproduzidos ou pulados no banco por status e ocultá-los
da fila ativa. Uma remoção explícita feita pelo usuário continua sendo definitiva.

**Motivo:** preservar histórico mínimo e simplificar evolução.

## D-010 — Estado persistido e runtime de voz

**Decisão:** Nuxt continua como fonte da verdade de fila e player. O bot possui
somente recursos efêmeros de voz em memória.

**Consequência:** `VoiceConnection`, `AudioPlayer`, subscriptions e streams nunca
são persistidos. O bot comunica transições pela API interna, que atualiza
`PlayerState`.

## D-011 — Spotify não é fonte de áudio

**Decisão:** Spotify permanece provedor de busca e metadados. Resolução de áudio usa
uma interface separada, `AudioSourceResolver`.

**Motivo:** os metadados Spotify não fornecem ao bot uma URL geral de streaming
reproduzível.

**Pendente:** escolher e registrar o provedor de áudio antes da Etapa 11.

## D-012 — Fundação de voz antes da reprodução

**Decisão:** a Etapa 10 implementa somente conexão, desconexão, lifecycle e
sincronização de estado.

**Motivo:** isolar falhas de Voice Gateway, reconexão e shutdown antes de adicionar
resolução, transcodificação e reprodução.

## D-013 — Audius como primeiro provedor de áudio

**Decisão:** usar a API REST pública do Audius como primeiro adaptador de
`AudioSourceResolver`.

**Motivos:**

- oferece busca e streaming por API documentada, sem scraping;
- não exige executável local, serviço sidecar ou SDK no runtime;
- funciona no Windows usando `fetch`;
- o endpoint público validado aceita identificação por `app_name`;
- retorna identificador estável e URL assinada reproduzível;
- permite testes determinísticos com cliente HTTP injetável.

**Compatibilidade com Spotify:** best-effort. O resolvedor pesquisa título e artistas,
mas só aceita candidato com correspondência conservadora de título, artista e
duração. Covers, remixes não solicitados, streams gated e resultados ambíguos são
rejeitados. Não existe garantia de que uma faixa do catálogo Spotify exista no
Audius.

**Cache:** a URL assinada recebe TTL local conservador de cinco minutos. O
`sourceIdentifier` é persistido junto com a URL e a expiração em
`resolved_sources`. A ausência de garantia pública de duração da assinatura impede
cache longo.

**Alternativas avaliadas:**

- YouTube, yt-dlp e play-dl: rejeitados nesta etapa por dependerem de extração não
  oficial, executável/biblioteca adicional e risco operacional/termos superior.
- Lavalink: rejeitado por adicionar serviço externo e não resolver por si só a
  escolha legal da fonte.
- SoundCloud: adiado por exigir integração e acesso próprios, com a mesma incerteza
  de correspondência de catálogo.
- biblioteca local controlada pelo operador: juridicamente previsível, mas exige
  ingestão, armazenamento e matching de arquivos, fora do escopo atual.

**Risco aceito:** cobertura menor que o Spotify. `SOURCE_NOT_FOUND` é resultado
normal e seguro.

**Validação em 20 de junho de 2026:** a API pública retornou uma faixa controlada e
sua URL assinada respondeu `206 Partial Content`, `audio/mpeg`, com bytes reais.
Uma busca popular retornou apenas covers e foi corretamente tratada como cenário
que exige rejeição conservadora.

## D-014 — FFmpeg e @discordjs/opus no runtime

**Decisão:** usar o FFmpeg instalado no sistema para converter as URLs
`audio/mpeg` do Audius e `@discordjs/opus` para codificação Opus.

**Motivos:**

- `@discordjs/voice` documenta `@discordjs/opus` como opção preferida;
- o ambiente Windows validado já possui FFmpeg 8.1.1 com `libopus`;
- evita adicionar um binário `ffmpeg-static` duplicado ao pacote;
- `createAudioResource` aceita a URL diretamente e mantém o processo atrás do
  adapter de runtime testável.

**Operação:** o setup exige FFmpeg no `PATH`. O pnpm autoriza explicitamente o build
nativo de `@discordjs/opus` em `pnpm-workspace.yaml`.

**Recuperação:** erro do recurso força uma única resolução sem cache. Nova falha
marca o item como `failed` e avança pela API.

**Validação em 20 de junho de 2026:** `generateDependencyReport` detectou
`@discordjs/opus` 0.10.0, FFmpeg 8.1.1 e `libopus`. Um recurso criado com URL
Audius real produziu 407 bytes na primeira leitura do pipeline, sem imprimir a URL.
