# AGENTS.md

## Projeto

Waves é um sistema privado, mobile-first, para controlar a fila de músicas de um
bot Discord. O nome técnico do monorepo é `discord-music-panel`.

Leia [`SPEC.md`](SPEC.md) antes de implementar mudanças de produto ou arquitetura.
O plano incremental está em
[`docs/specs/10-plano-de-implementacao.md`](docs/specs/10-plano-de-implementacao.md).

## Interface web e design

Qualquer trabalho que crie, altere, revise ou teste a UI de `apps/web` deve começar
pela leitura integral de:

1. [`DESIGN.md`](DESIGN.md), fonte normativa para direção visual, tokens,
   tipografia, componentes, responsividade, estados e acessibilidade.
2. [`pencil.pen`](pencil.pen), fonte visual complementar com os frames e
   componentes desenhados no Pencil.
3. [`docs/specs/07-interface-web.md`](docs/specs/07-interface-web.md), fonte dos
   requisitos funcionais e da hierarquia Queue Social.

Não implemente a interface apenas a partir do `.pen`: use o `DESIGN.md` para
interpretar corretamente os detalhes visuais e transformar o desenho em componentes
consistentes. Da mesma forma, não ignore o `.pen` quando a tarefa depender de
composição, proporções ou comparação visual.

Ordem de precedência para decisões de UI:

1. Requisitos funcionais e restrições de `SPEC.md` e das specs.
2. Regras explícitas de `DESIGN.md`.
3. Composição e aparência do `pencil.pen`.
4. Convenções já implementadas em `apps/web`.

Se houver divergência material entre `DESIGN.md` e `pencil.pen`, não invente uma
terceira direção. Registre a divergência e solicite decisão antes de alterar a
linguagem visual.

Antes de concluir trabalho de UI:

- valide primeiro o viewport mobile definido no design;
- valide também desktop e largura intermediária;
- compare a implementação renderizada com os frames relevantes do Pencil;
- verifique estados default, hover, focus-visible, active, disabled e loading;
- preserve WCAG AA, alvos de toque e alternativas ao drag-and-drop;
- use os tokens e componentes descritos no `DESIGN.md`;
- não substitua a direção Queue Social por padrões genéricos de dashboard.

## Arquitetura obrigatória

- `apps/web`: Nuxt 4 fullstack, API Nitro, regras de negócio e acesso ao banco.
- `apps/bot`: discord.js; comunica-se apenas com a API interna.
- `packages/shared`: schemas Zod e tipos compartilhados.
- O bot nunca acessa SQLite ou Drizzle diretamente.
- O Nuxt é a fonte da verdade da fila e do player.

## Estado das fases

- Fase 1 concluída em 19 de junho de 2026.
- Etapa 10, fundação de voz, concluída em 20 de junho de 2026.
- A Fase 2 deve preservar Nuxt como fonte da verdade da fila e do player.
- O bot pode manter apenas recursos efêmeros de runtime, como `VoiceConnection` e
  `AudioPlayer`; estado observável continua sincronizado pela API interna.
- Resolução de fonte deve ficar atrás de um adaptador e não pode ser confundida com
  a busca de metadados do Spotify.
- Não introduza YouTube, yt-dlp, play-dl, Lavalink ou outra fonte sem decisão
  registrada em `docs/specs/12-decisoes.md`.
- YouTube Music via `youtubei.js` foi autorizado em `D-015` para a continuação da
  Etapa 12. Não substituir por `play-dl`, `@distube/ytdl-core`, yt-dlp ou Lavalink
  sem nova decisão.
- Trabalhe uma etapa da Fase 2 por vez.
- A Etapa 11 está limitada à escolha documentada do provedor, contrato
  `AudioSourceResolver`, resolução, validação, cache, expiração e uso de
  `resolved_sources`.
- A Etapa 11 não inclui `AudioPlayer`, `AudioResource`, reprodução, avanço
  automático, skip real do stream, pause, resume, volume, progresso ou mudanças de
  UI.
- Não altere o schema de `resolved_sources` sem necessidade comprovada.
- Não declare a Etapa 11 concluída sem validação real proporcional ao provedor
  escolhido.
- A Etapa 12 foi concluída em 20 de junho de 2026 com YouTube Music como fonte
  primária, Audius como fallback e smoke Discord de reprodução, avanço, skip,
  leave, autojoin e retomada da fila.
- A próxima etapa permitida é a Etapa 13: controles e interface.

## Forma de trabalho

1. Trabalhe uma etapa por vez.
2. Preserve TypeScript strict e `exactOptionalPropertyTypes`.
3. Use Zod para env, payloads e respostas externas.
4. Mantenha rotas finas, regras em services e persistência em repositories.
5. Antes de concluir uma etapa, execute os gates aplicáveis.
6. Marque apenas itens efetivamente verificados.
7. Crie ou atualize o handoff da etapa seguinte em `docs/implementation`.

## Documentação atual

Ao trabalhar com biblioteca, framework, SDK, API, CLI ou serviço de nuvem, consulte
primeiro a documentação atual usando Context7:

```bash
npx ctx7@latest library <nome> "<pergunta completa>"
npx ctx7@latest docs <libraryId> "<pergunta completa>"
```

Não inclua secrets nas consultas.

## Comandos de qualidade

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Convenções

- Código, nomes técnicos e commits em inglês.
- Documentação e interface inicial em português.
- Não use `any` sem justificativa explícita.
- Não registre tokens, secrets ou headers de autorização.
- Preserve a direção visual Queue Social e o comportamento mobile-first conforme
  `DESIGN.md` e `pencil.pen`.
