# Guia de trabalho

Waves é um painel privado para controlar a fila e o player de um bot Discord.
Leia este arquivo antes de trabalhar no repositório.

## Arquitetura

- `apps/web`: Nuxt 4, API Nitro, regras de negócio e persistência SQLite/Drizzle.
- `apps/bot`: discord.js; acessa somente a API interna protegida.
- `packages/shared`: schemas Zod e tipos compartilhados.
- Nuxt é a fonte da verdade da fila e do player. O bot mantém apenas conexões de
  voz, players, subscriptions e streams efêmeros, sincronizados pela API.
- Spotify fornece metadados; YouTube Music via `youtubei.js` é a única fonte de
  áudio, isolada atrás de `AudioSourceResolver`.
- Trocar o provedor ou introduzir play-dl, @distube/ytdl-core, yt-dlp ou Lavalink
  exige decisão arquitetural explícita. Altere `resolved_sources` somente com
  necessidade comprovada.
- Sessões e vinculação Discord identificam usuários, mas não protegem o acesso à
  implantação. Exposição pública exige autenticação externa.

## Interface

Antes de criar, alterar, revisar ou testar a UI de `apps/web`, leia integralmente
[DESIGN.md](DESIGN.md) e [pencil.pen](pencil.pen). Use o primeiro para interpretar
tokens, componentes e acessibilidade; use o segundo para composição e proporções.

Precedência: requisitos do código e testes, regras do DESIGN.md e composição do
Pencil. Em divergência material, registre o conflito e solicite decisão antes de
alterar a linguagem visual.

Preserve Queue Social e mobile-first. Valide o viewport mobile do design, uma
largura intermediária e desktop; compare com os frames relevantes. Confira
default, hover, focus-visible, active, disabled e loading, WCAG AA, alvos de toque
e alternativas ao drag-and-drop.

## Convenções

- Preserve TypeScript strict e `exactOptionalPropertyTypes`; justifique qualquer
  uso de `any`.
- Valide env, payloads e respostas externas com Zod.
- Mantenha rotas finas, regras em services e persistência em repositories.
- Preserve compatibilidade entre painel, API e comandos Discord.
- Código, nomes técnicos e commits em inglês; interface e documentação interna
  em português. Atualize os dois READMEs quando mudar informação pública.
- Nunca registre credenciais, tokens ou headers de autorização.

## Verificação

Execute `pnpm typecheck` para mudanças de código e os testes, lint e formatação
aplicáveis. Os gates da CI são:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

Use o Node declarado em `.node-version` e o pnpm de `packageManager`. Antes da
primeira verificação ou após alterar o pacote compartilhado, execute
`pnpm --filter @waves/shared build` e `pnpm --filter web exec nuxt prepare`.
Execute o build completo
build somente quando solicitado ou necessário para validar empacotamento,
Docker, deploy ou comportamento exclusivo de produção. O deploy é manual.

## Documentação de dependências

Para perguntas de API, configuração, migração, setup ou debugging de biblioteca,
busque documentação atual com Context7 fora do sandbox:

```bash
npx ctx7@latest library <nome-oficial> "<pergunta-completa>"
npx ctx7@latest docs <libraryId> "<pergunta-completa>"
```

Resolva o ID primeiro, exceto se fornecido pelo usuário; prefira nome exato,
relevância, snippets, reputação e benchmark. Use o ID versionado retornado quando
aplicável. Limite a três comandos por pergunta e não inclua secrets. Em falha de
rede, repita fora do sandbox; em quota, informe e sugira `npx ctx7@latest login` ou
`CONTEXT7_API_KEY`. Não use Context7 para refatoração, scripts do zero, regras de
negócio, revisão de código ou conceitos gerais.
