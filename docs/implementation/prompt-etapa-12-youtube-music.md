# Prompt de implementação — Etapa 12

Copie o conteúdo abaixo para uma nova sessão de implementação.

---

Continue o projeto Waves em `C:\Users\luiss\Projects\waves` e conclua a **Etapa 12
— Reprodução e avanço automático**, adicionando **YouTube Music via `youtubei.js`
como fonte primária de streams** e preservando **Audius como fallback**.

Não implemente a Etapa 13.

## Leitura obrigatória

Antes de agir, leia integralmente:

- `AGENTS.md`;
- `SPEC.md`;
- `README.md`;
- `docs/specs/01-visao-e-escopo.md`;
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
- `docs/implementation/README.md`;
- `docs/implementation/etapa-11-resolucao-de-fonte.md`;
- `docs/implementation/etapa-12-reproducao-e-avanco-automatico.md`;
- `docs/implementation/etapa-12-youtube-music.md`.

Sempre confirme também o `AGENTS.md` da raiz.

## Estado atual

- Fase 1 concluída.
- Etapa 10 concluída e validada no Discord.
- Etapa 11 concluída com `AudioSourceResolver`, cache e `resolved_sources`.
- O Audius está implementado ponta a ponta:
  - cliente HTTP e schemas Zod;
  - matching conservador;
  - cache, TTL e `forceRefresh`;
  - endpoint interno autenticado;
  - integração com o bot.
- O runtime parcial da Etapa 12 já existe:
  - `AudioPlayerManager`;
  - um `AudioPlayer` por guild;
  - `@discordjs/opus`;
  - FFmpeg com `libopus`;
  - claim, complete/fail, skip e avanço autoritativos pela API;
  - eventos de playback;
  - cleanup em leave, desconexão e shutdown.
- O pipeline Audius → FFmpeg → Opus produziu bytes reais.
- O usuário confirmou reprodução Audius em canal Discord.
- O Audius não atende como provedor principal:
  - cobertura insuficiente;
  - muitas buscas sem resultado;
  - covers e versões alternativas são frequentes.
- `D-015` autoriza `youtubei.js` como primário e Audius como fallback.
- `play-dl`, `@distube/ytdl-core`, yt-dlp e Lavalink não estão autorizados.
- Após as últimas mudanças parciais:
  - 137 testes passaram;
  - lint e typecheck passaram;
  - cinco arquivos de código ainda estavam pendentes de Prettier;
  - build e `format:check` finais não foram reconfirmados.
- O diretório `.git` já foi encontrado vazio/inválido em auditoria anterior. Verifique
  novamente, mas não presuma que existe baseline Git.

## Decisões obrigatórias

- Nuxt/Nitro continua sendo a fonte da verdade da fila e do player.
- O bot nunca acessa SQLite ou Drizzle.
- Spotify continua sendo somente provedor de busca e metadados.
- YouTube Music será a fonte primária de áudio.
- Audius continuará como fallback.
- A biblioteca obrigatória é `youtubei.js`.
- `youtubei.js` deve ser instalado em `apps/web`, não em `apps/bot`.
- O bot não pode importar YouTube.js nem conhecer detalhes do provedor.
- O contrato `AudioSourceResolver` continua sendo a fronteira do domínio.
- Recursos `VoiceConnection`, `AudioPlayer`, `AudioResource`, subscriptions e
  streams permanecem efêmeros no bot.
- Preserve TypeScript strict e `exactOptionalPropertyTypes`.
- Use Zod para env, contratos e respostas externas normalizadas.
- Não use cookies pessoais.
- A primeira implementação deve operar anonimamente.
- Não adicione cookies, OAuth, PO token, visitor data configurável, proxy ou conta
  Google sem nova decisão registrada.
- Não registre:
  - URLs de mídia;
  - query strings assinadas;
  - cookies;
  - PO tokens;
  - visitor data;
  - player scripts;
  - respostas brutas do InnerTube;
  - erros brutos que possam conter URL.
- O risco técnico e jurídico do uso da API privada InnerTube está aceito em `D-015`.
- Não altere o schema de `resolved_sources` sem necessidade comprovada.
- Não introduza UI, pause, resume, volume ou progresso nesta etapa.

## Documentação atual obrigatória

Antes de instalar ou implementar, consulte a documentação atual via Context7:

```bash
npx ctx7@latest library "YouTube.js" "<pergunta completa da Etapa 12>"
npx ctx7@latest docs /luanrt/youtube.js "<pergunta completa da Etapa 12>"
```

Confirme na versão efetivamente instalada:

- forma recomendada de instalar a versão estável;
- `Innertube.create`;
- `UniversalCache`;
- `music.search(query, { type: 'songs' })`;
- estrutura real dos resultados de música;
- `music.getInfo` ou API equivalente;
- acesso a `basic_info`;
- acesso a `streaming_data`;
- seleção/decifração de formato;
- cache de sessão/player;
- comportamento anônimo;
- erros e challenges conhecidos.

Não copie exemplos cegamente. Inspecione exports, tipos e comportamento da versão
instalada. Se a API atual divergir desta spec, preserve a arquitetura e documente a
adaptação.

## Objetivo

Concluir a Etapa 12 com a cadeia:

```text
Spotify TrackMetadata
  → YouTubeMusicAudioSourceResolver
  → AudiusAudioSourceResolver (fallback)
  → resolved_sources
  → API interna
  → AudioPlayerManager
  → FFmpeg / Opus
  → Discord Voice
```

O sistema deve selecionar a gravação pretendida, obter uma URL temporária de áudio,
reproduzir, renovar quando expirada, avançar automaticamente e executar skip real.

## Resultado normalizado

Atualize o contrato compartilhado:

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

- `sourceIdentifier` é o video ID;
- `streamUrl` é temporária;
- `expiresAt` usa expiração confiável da URL quando disponível;
- na ausência de expiração confiável, aplicar TTL conservador;
- objetos do YouTube.js nunca saem do adapter.

## Plano obrigatório de implementação

Trabalhe na ordem abaixo. Não avance deixando testes quebrados.

### 1. Auditar e estabilizar o estado parcial

1. Verifique o worktree e preserve alterações existentes.
2. Confirme o estado real de `.git`.
3. Leia os arquivos já alterados da Etapa 12.
4. Execute Prettier nos cinco arquivos pendentes identificados anteriormente.
5. Execute testes, lint e typecheck antes da nova implementação.
6. Corrija somente regressões relacionadas à Etapa 12.
7. Não marque a etapa como concluída nesse ponto.

### 2. Instalar YouTube.js no web

1. Resolva a versão estável atual via documentação.
2. Instale `youtubei.js` somente em `apps/web`.
3. Preserve lockfile e política de builds do pnpm.
4. Não instale pacote alternativo de YouTube.
5. Confirme import e inicialização em Node 22+.

### 3. Expandir contratos compartilhados

1. Alterar `audioSourceProviderSchema` para aceitar:
   - `youtube_music`;
   - `audius`.
2. Preservar contrato estrito.
3. Adicionar testes para ambos os providers.
4. Confirmar que bot e web consomem o novo `dist` de `@waves/shared`.

### 4. Criar modelos externos normalizados

Em `apps/web/server/clients`:

1. Criar schemas Zod internos para:
   - candidato de música;
   - artista;
   - video ID;
   - duração;
   - sinais de oficial/Topic;
   - formato de áudio selecionado.
2. Não tentar validar objetos gigantes do YouTube.js diretamente.
3. Mapear imediatamente os objetos da biblioteca para estruturas mínimas.
4. Rejeitar campos ausentes ou tipos inesperados com erro seguro.

Modelo sugerido:

```ts
interface YouTubeMusicCandidate {
  videoId: string
  title: string
  artists: string[]
  durationMs: number
  albumName?: string
  channelName?: string
  isOfficial: boolean
  isTopic: boolean
}

interface YouTubeAudioFormat {
  videoId: string
  streamUrl: string
  mimeType: string
  bitrate?: number
  expiresAt?: string
}
```

### 5. Criar `YouTubeMusicClientPort`

Defina uma porta injetável:

```ts
interface YouTubeMusicClientPort {
  searchSongs(query: string, limit?: number): Promise<YouTubeMusicCandidate[]>
  resolveAudioFormat(videoId: string): Promise<YouTubeAudioFormat>
}
```

O adapter real deve:

1. criar uma única instância lazy de `Innertube` por processo;
2. usar `UniversalCache` ou cache equivalente suportado;
3. pesquisar com o cliente Music e filtro `songs`;
4. limitar resultados;
5. normalizar resultados imediatamente;
6. obter info/streaming data somente após selecionar o candidato;
7. selecionar formato somente de áudio e sem DRM;
8. aplicar timeout explícito;
9. traduzir falhas sem incluir payload ou URL.

### 6. Implementar matching determinístico

Extraia o matching para funções puras e testáveis.

#### Query

Tente:

1. `title + artists`;
2. ISRC, quando disponível e útil;
3. não use URL Spotify.

#### Normalização

- lowercase;
- remoção de diacríticos;
- normalização de pontuação e espaços;
- equivalência de `feat.`, `ft.` e `featuring`;
- separação de qualificadores em parênteses/colchetes.

#### Pesos

- título: 40%;
- artistas: 35%;
- duração: 20%;
- oficial/Topic: 5%.

#### Eliminação

Rejeite:

- artista principal ausente;
- diferença de duração maior que `max(12s, 8%)`;
- candidato sem video ID ou duração;
- privado, indisponível, live ativa ou DRM;
- qualifiers conflitantes.

Quando não presentes no Spotify, trate como conflitantes:

- cover;
- remix, edit ou mix;
- live;
- karaoke;
- instrumental;
- slowed/reverb;
- sped up/nightcore;
- acoustic;
- lyric video.

Não penalize automaticamente:

- official audio;
- official video;
- canal Topic;
- provided to YouTube.

Se houver empate ambíguo entre os melhores candidatos, não adivinhe: acione o
fallback Audius.

### 7. Selecionar formato de áudio

Preferência:

1. áudio-only;
2. Opus/WebM compatível;
3. AAC/M4A;
4. bitrate suficiente para Discord, sem escolher o máximo por padrão.

Regras:

- sem DRM;
- URL HTTP(S) válida;
- compatível com FFmpeg existente;
- não persistir headers ou cookies;
- não imprimir formato completo;
- extrair expiração da URL somente quando confiável;
- usar TTL conservador caso contrário.

### 8. Implementar `YouTubeMusicAudioSourceResolver`

O resolver deve:

1. receber `TrackMetadata`;
2. pesquisar candidatos;
3. selecionar um candidato seguro;
4. resolver o formato do video ID;
5. retornar `ResolvedAudioSource` com provider `youtube_music`;
6. traduzir:
   - ausência segura → `AudioSourceNotFoundError`;
   - falha/challenge/timeout/formato inválido → `AudioSourceUnavailableError`.

Não acesse banco ou HTTP Nitro dentro do resolver.

### 9. Implementar cadeia com fallback

Crie uma composição explícita, por exemplo:

```text
FallbackAudioSourceResolver
  1. YouTubeMusicAudioSourceResolver
  2. AudiusAudioSourceResolver
```

Regras:

- YouTube Music sempre é tentado primeiro em uma nova resolução.
- `SOURCE_NOT_FOUND` do primário permite fallback.
- Falha recuperável do primário permite fallback.
- Erro de programação ou contrato interno não deve ser silenciosamente mascarado.
- Registre somente provider tentado, código seguro, duração e queue item.
- Nunca registre query completa se ela puder conter dados inesperados.
- O resultado final deve indicar o provider realmente usado.

### 10. Ajustar cache e refresh

1. Reutilize a tabela existente.
2. Não crie migração sem necessidade comprovada.
3. Cache válido pode ser reutilizado independentemente de ser YouTube ou Audius.
4. `forceRefresh` para YouTube deve primeiro renovar a URL do mesmo video ID.
5. Se o video ID não for mais utilizável:
   - refaça busca;
   - selecione novo candidato;
   - só então use fallback.
6. Substitua atomicamente a resolução anterior.
7. Preserve cascade delete por queue item.

### 11. Integrar dependências do runtime web

Em `audio-source-dependencies`:

1. criar cliente YouTube.js lazy;
2. injetar resolver YouTube;
3. compor fallback com Audius;
4. manter rota fina;
5. evitar inicializar InnerTube em build/client bundle;
6. garantir que YouTube.js permaneça server-only.

### 12. Preservar bot e playback

O bot não deve importar YouTube.js.

Confirme:

- `WavesApiClient` continua recebendo somente `ResolvedAudioSource`;
- `AudioPlayerManager` aceita provider sem branches desnecessários;
- FFmpeg abre os formatos selecionados;
- retry força refresh;
- skip suprime conclusão natural duplicada;
- conclusão promove o próximo item;
- falha persistente marca item como `failed`;
- leave e shutdown encerram recursos.

Só altere o bot se houver necessidade real de suportar formato/headers. Não envie
cookies ou headers secretos pela API.

### 13. Testes unitários

Adicione testes para:

- schema com ambos os providers;
- normalização de título e artistas;
- aliases de featuring;
- duração limite;
- preferência por Topic/oficial;
- rejeição de cover/remix/live;
- ausência de artista principal;
- empate ambíguo;
- seleção Opus/WebM;
- fallback AAC/M4A;
- ausência de formato;
- expiração extraída;
- TTL conservador;
- refresh do mesmo video ID;
- nova busca após video ID inválido;
- fallback YouTube → Audius;
- falha dos dois providers;
- ausência de URLs/secrets em logs e erros.

### 14. Testes de integração

Cubra:

- bearer obrigatório;
- rota retorna `youtube_music`;
- cache válido evita nova busca;
- expiração renova URL;
- `forceRefresh` é respeitado;
- fallback retorna `audius`;
- resposta externa inválida retorna erro seguro;
- Nuxt continua fonte da verdade;
- bot continua sem imports de banco ou YouTube.js.

### 15. Smoke real de catálogo

Crie uma lista versionada, sem dados sensíveis, com pelo menos dez faixas:

- hit internacional atual;
- hit internacional antigo;
- música brasileira;
- colaboração;
- título com acentos;
- faixa explícita;
- música com várias versões;
- faixa que falha no Audius;
- faixa de canal Topic;
- faixa com official audio.

Para cada faixa, registre somente:

- metadados esperados;
- video ID escolhido;
- duração esperada e encontrada;
- classificação do canal/resultado;
- provider usado;
- sucesso ou falha.

Não registre URL de mídia.

Meta obrigatória:

- pelo menos 9/10 candidatos corretos;
- pelo menos 9/10 streams abrem;
- zero cover/remix incorreto conhecido;
- fallback Audius validado com candidato controlado.

Se a meta falhar, ajuste matching antes de prosseguir. Não reduza silenciosamente a
meta.

### 16. Smoke Discord

Com web e bot ativos:

1. executar `/join`;
2. adicionar e tocar ao menos três faixas YouTube Music;
3. confirmar áudio correto;
4. confirmar `PlayerState.playing`;
5. aguardar conclusão natural e avanço;
6. adicionar duas faixas e executar `/skip`;
7. confirmar interrupção e próximo item;
8. executar `/leave` durante playback;
9. confirmar cleanup;
10. confirmar que logs não contêm URLs ou dados InnerTube.

Marque somente resultados realmente verificados.

### 17. Documentação final

Atualize:

- `README.md`;
- `SPEC.md`, se necessário;
- specs 02, 03, 05, 06, 08, 09, 10, 11 e 12;
- `docs/implementation/README.md`;
- `docs/implementation/etapa-12-youtube-music.md`;
- handoff da Etapa 13.

Registre:

- versão instalada do YouTube.js;
- API efetivamente usada;
- estratégia de cache;
- taxa de acerto do smoke;
- limitações anônimas;
- riscos conhecidos;
- estado do fallback Audius.

## Estrutura sugerida

```text
apps/web/server/clients/
  youtube-music.client.ts
  youtube-music.errors.ts
  youtube-music.schemas.ts

apps/web/server/services/
  audio-source-matching.ts
  youtube-music-audio-source-resolver.ts
  fallback-audio-source-resolver.ts

apps/web/test/clients/
  youtube-music.client.test.ts

apps/web/test/services/
  audio-source-matching.test.ts
  youtube-music-audio-source-resolver.test.ts
  fallback-audio-source-resolver.test.ts
```

Adapte nomes às convenções existentes, preservando as fronteiras.

## Fora do escopo

- autenticação Google;
- cookies;
- PO token;
- proxy;
- busca pública diretamente no YouTube;
- playlists YouTube;
- download permanente;
- UI para escolher candidato;
- pause;
- resume;
- volume;
- progresso;
- seek;
- novo provedor além de YouTube Music e Audius.

## Gates obrigatórios

Antes de declarar a etapa concluída:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

Também execute:

```bash
pnpm --filter bot exec node -e "import('@discordjs/voice').then(m => console.log(m.generateDependencyReport()))"
```

Não imprima configs, cookies, tokens ou URLs durante diagnósticos.

## Definição de pronto

A Etapa 12 só pode ser concluída quando:

- YouTube Music for o resolvedor primário;
- Audius continuar como fallback;
- contratos aceitarem ambos;
- matching atingir pelo menos 9/10;
- streams abrirem em pelo menos 9/10;
- nenhum cover/remix conhecido for selecionado incorretamente;
- três faixas YouTube Music forem reproduzidas no Discord;
- avanço automático e skip forem validados;
- cache e refresh forem comprovados;
- logs estiverem limpos de dados sensíveis;
- todos os gates passarem;
- documentação e handoff forem atualizados.

Não declare conclusão parcial como conclusão da Etapa 12.

---
