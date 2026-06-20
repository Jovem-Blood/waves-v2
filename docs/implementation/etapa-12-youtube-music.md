# Etapa 12 — YouTube Music como fonte primária

## Objetivo

Adicionar YouTube Music como provedor primário de áudio usando `youtubei.js`,
preservando Audius como fallback e sem alterar a propriedade da fila/player.

## Estado atual

### Audius implementado

- cliente HTTP e schemas Zod;
- matching conservador de título, artista e duração;
- cache e expiração em `resolved_sources`;
- renovação com `forceRefresh`;
- endpoint interno autenticado;
- integração com `AudioPlayerManager`, FFmpeg e Opus;
- bytes reais e reprodução em Discord confirmados.

### Limitação comprovada

O catálogo Audius não cobre a maioria das buscas Spotify esperadas. Em buscas
populares, candidatos ausentes, covers ou versões alternativas são comuns. O
resolver falha com segurança, mas isso produz `SOURCE_NOT_FOUND` demais para o
produto.

### Pendências técnicas anteriores

- cinco arquivos ainda precisam ser formatados pelo Prettier;
- lint e typecheck passaram após a implementação do player;
- 137 testes passaram;
- build e `format:check` finais não foram concluídos após as últimas alterações;
- conclusão automática e skip precisam ser revalidados com o novo provedor.

## Decisão

Usar `youtubei.js` como primário, conforme `D-015`. Não usar `play-dl`,
`@distube/ytdl-core`, yt-dlp ou Lavalink.

## Arquitetura alvo

```text
AudioSourceService
  |
  v
FallbackAudioSourceResolver
  |-- YouTubeMusicAudioSourceResolver (primary)
  `-- AudiusAudioSourceResolver (fallback)
```

O contrato continua:

```ts
type AudioSourceProvider = 'youtube_music' | 'audius'

interface ResolvedAudioSource {
  provider: AudioSourceProvider
  sourceIdentifier: string
  streamUrl: string
  expiresAt: string
}
```

Para YouTube Music:

- `sourceIdentifier` = video ID;
- `streamUrl` = URL temporária do formato escolhido;
- `expiresAt` = expiração extraída da URL quando confiável ou TTL conservador;
- nenhum objeto YouTube.js cruza a fronteira do adapter.

## Dependência

Adicionar `youtubei.js` ao `apps/web`, não ao bot.

Motivo: resolução, matching, cache e acesso externo pertencem ao Nuxt. O bot continua
cliente HTTP e não conhece o provedor.

## Cliente YouTube.js

Criar uma porta injetável:

```ts
interface YouTubeMusicClientPort {
  searchSongs(query: string): Promise<YouTubeMusicCandidate[]>
  resolveAudioFormat(videoId: string): Promise<YouTubeAudioFormat>
}
```

O adapter real deve:

1. inicializar uma única sessão `Innertube` por processo;
2. usar cache de player/session suportado pela biblioteca;
3. executar `music.search(query, { type: 'songs' })`;
4. normalizar resultados em schemas Zod internos;
5. obter streaming data somente para o candidato selecionado;
6. selecionar formato somente de áudio, sem DRM;
7. aplicar timeout e traduzir erros.

## Busca e matching

### Query

Construir a busca com:

1. título;
2. todos os artistas;
3. ISRC, em tentativa separada quando disponível.

Não enviar URL Spotify.

### Normalização

- lowercase e remoção de diacríticos;
- normalização de pontuação e espaços;
- aliases seguros de `feat.`, `featuring`, `ft.`;
- separar qualificadores entre parênteses/colchetes.

### Pontuação mínima

Pontuar:

- título: 40%;
- artista principal e colaboradores: 35%;
- duração: 20%;
- sinais de gravação oficial/Topic: 5%.

Requisitos eliminatórios:

- divergência de duração maior que `max(12s, 8%)`;
- artista principal ausente;
- candidato sem video ID ou duração;
- conteúdo indisponível, live ativa, privado ou com DRM;
- qualificadores conflitantes.

### Qualificadores conflitantes

Rejeitar quando não presentes no Spotify:

- cover;
- remix/edit/mix;
- live;
- karaoke;
- instrumental;
- slowed/reverb;
- sped up/nightcore;
- acoustic;
- lyric video.

Não rejeitar automaticamente `official audio`, `official video`, `Topic` ou
`provided to YouTube`.

### Ambiguidade

Se os dois melhores candidatos tiverem diferença pequena e nenhum possuir sinais
fortes de gravação oficial, retornar ausência segura e tentar Audius.

## Seleção do formato

Preferir:

1. áudio-only;
2. Opus/WebM quando utilizável diretamente;
3. AAC/M4A como segunda opção;
4. bitrate adequado para voz Discord, sem exigir o maior bitrate disponível.

O runtime pode continuar usando FFmpeg para normalizar formatos. Não persistir
headers, cookies ou URLs em logs.

## Cache e expiração

- persistir provider, video ID, URL e expiração na tabela existente;
- não criar migração sem necessidade comprovada;
- reutilizar somente resolução válida do provedor selecionado;
- `forceRefresh` deve obter nova URL para o mesmo video ID;
- se o video ID ficar indisponível, refazer busca e matching;
- o fallback Audius pode substituir uma resolução YouTube expirada somente após
  falha classificada da tentativa primária.

## Autenticação

Primeira versão obrigatoriamente anônima.

Fora do escopo inicial:

- cookies;
- OAuth;
- PO token;
- visitor data configurável;
- proxy residencial;
- conta Google dedicada.

Se a execução anônima não for estável, parar e registrar nova decisão antes de
adicionar qualquer secret.

## Erros

Manter erros públicos seguros:

- `SOURCE_NOT_FOUND`: nenhum provedor encontrou candidato seguro;
- `SOURCE_UNAVAILABLE`: InnerTube/Audius indisponível ou sem formato utilizável.

Internamente, diferenciar sem expor detalhes:

- search unavailable;
- challenge/attestation required;
- candidate unavailable;
- no playable format;
- decipher/player failure;
- timeout;
- rate limited.

## Testes

### Unitários

- normalização de título/artistas;
- ranking por título, artista e duração;
- preferência por oficial/Topic;
- rejeição de cover/remix/live;
- empate ambíguo;
- seleção de formato;
- expiração extraída e TTL fallback;
- retry do mesmo video ID;
- fallback Audius.

### Integração

- rota interna preserva bearer;
- `source.provider` retorna `youtube_music`;
- cache reutiliza video ID/URL válidos;
- refresh não muda de candidato desnecessariamente;
- respostas externas malformadas não vazam payload;
- falha dupla produz erro seguro.

### Smoke real

Usar uma lista versionada de pelo menos dez faixas:

- hits internacionais;
- música brasileira;
- faixa antiga;
- colaboração;
- título com acentos;
- faixa explícita;
- música com várias versões;
- faixa cujo Audius falha;
- faixa com canal Topic;
- faixa com official audio.

Meta inicial:

- pelo menos 9/10 candidatos corretos;
- pelo menos 9/10 streams abrem;
- nenhuma seleção conhecida de cover/remix incorreto;
- três reproduções completas em Discord;
- skip e avanço automático validados.

## Segurança e termos

`youtubei.js` usa API privada. A integração pode quebrar e possui risco de
incompatibilidade com os Termos do YouTube. Esse risco está aceito em `D-015`.

Nunca registrar:

- cookies;
- PO tokens;
- visitor data;
- URL de mídia;
- query de assinatura;
- resposta bruta do player;
- erro bruto contendo URL.

## Fora do escopo

- busca pública diretamente no YouTube;
- alterar Spotify como provedor de metadados;
- download permanente;
- playlists YouTube;
- autenticação Google;
- UI de seleção manual de candidato;
- pause, resume, volume ou progresso.

## Gates

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Definição de pronto

- YouTube Music é primário e Audius fallback;
- contratos aceitam ambos os providers;
- matching atinge a meta do smoke;
- pipeline toca áudio correto no Discord;
- conclusão e skip funcionam;
- logs não expõem dados sensíveis;
- todos os gates passam;
- Etapa 12 pode ser encerrada.

## Implementação em 20 de junho de 2026

- `youtubei.js` 17.0.1 instalado somente em `apps/web`;
- `Innertube` lazy por processo com `UniversalCache` e sessão anônima;
- busca efetiva por `music.search(query, { type: 'song' })`, conforme o tipo da
  versão instalada;
- candidatos normalizados imediatamente e objetos YouTube.js confinados ao client;
- matching determinístico com pesos 40/35/20/5 e rejeição de versões conflitantes;
- formato audio-only sem DRM, preferindo WebM/Opus e usando M4A/AAC como fallback;
- expiração extraída da URL ou de `streaming_data.expires`, com TTL conservador;
- decifração em `node:vm`, contexto mínimo e timeout de 250 ms;
- refresh do mesmo video ID antes de nova busca;
- cadeia explícita YouTube Music → Audius;
- nenhuma migração de banco;
- bot sem import ou conhecimento de YouTube.js.

## Smoke de catálogo

Relatório versionado:
[`etapa-12-youtube-music-smoke.json`](etapa-12-youtube-music-smoke.json).

- candidatos corretos: 10/10;
- streams abertos: 10/10;
- covers/remixes incorretos conhecidos: 0;
- fallback Audius: validado com bytes reais;
- URLs de mídia: não registradas.

## Limitações

- InnerTube e o player privado podem mudar sem aviso;
- operação anônima pode sofrer challenge, rate limit ou restrição regional;
- cookies, OAuth, PO token, visitor data configurável e proxy continuam proibidos
  sem nova decisão;
- o script de decifração vem do player do YouTube e é executado isoladamente após
  autorização explícita do mantenedor.

## Transporte para o bot

O CDN de mídia validado exige ranges pequenos. O bot não entrega mais a URL
diretamente ao FFmpeg: ele busca blocos sequenciais de 512 KiB, valida
`Content-Range`, mantém memória limitada e entrega o stream local ao `demuxProbe`.
Essa adaptação evita o `403` observado quando FFmpeg abria a URL diretamente.
