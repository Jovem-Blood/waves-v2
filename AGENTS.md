# AGENTS.md

## Projeto

Waves é um sistema privado, mobile-first, para controlar a fila e o player de
músicas de um bot Discord. O nome técnico do monorepo é `discord-music-panel`.

## Interface web e design

Qualquer trabalho que crie, altere, revise ou teste a UI de `apps/web` deve começar
pela leitura integral de:

1. [`DESIGN.md`](DESIGN.md), fonte normativa para direção visual, tokens,
   tipografia, componentes, responsividade, estados e acessibilidade.
2. [`pencil.pen`](pencil.pen), fonte visual complementar com os frames e
   componentes desenhados no Pencil.

Não implemente a interface apenas a partir do `.pen`: use o `DESIGN.md` para
interpretar corretamente os detalhes visuais e transformar o desenho em componentes
consistentes. Da mesma forma, não ignore o `.pen` quando a tarefa depender de
composição, proporções ou comparação visual.

Ordem de precedência para decisões de UI:

1. Requisitos e restrições já implementados no código e nos testes.
2. Regras explícitas de `DESIGN.md`.
3. Composição e aparência do `pencil.pen`.

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

## Arquitetura e limites

- Nuxt é a fonte da verdade da fila e do player.
- O bot mantém somente recursos efêmeros de runtime, como `VoiceConnection`,
  `AudioPlayer`, subscriptions e streams.
- Estado observável é sincronizado pela API interna.
- Resolução de fonte fica atrás de `AudioSourceResolver` e é separada da busca de
  metadados do Spotify.
- YouTube Music via `youtubei.js` é a fonte primária; Audius é fallback.
- Não substituir o provedor nem introduzir `play-dl`, `@distube/ytdl-core`, yt-dlp
  ou Lavalink sem decisão arquitetural explícita.
- Não alterar o schema de `resolved_sources` sem necessidade comprovada.
- O painel não possui autenticação própria e não deve ser exposto publicamente sem
  proteção externa.

## Forma de trabalho

1. Preserve TypeScript strict e `exactOptionalPropertyTypes`.
2. Use Zod para env, payloads e respostas externas.
3. Mantenha rotas finas, regras em services e persistência em repositories.
4. Preserve compatibilidade entre painel, API e comandos Discord.
5. Execute os gates aplicáveis antes de concluir mudanças.

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
