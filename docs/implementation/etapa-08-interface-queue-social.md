# Próxima etapa — Interface Queue Social

## Bloqueio de design a resolver

Existe uma divergência material entre as fontes visuais:

- `DESIGN.md` descreve quatro frames completos (`Mobile Viewport`,
  `Desktop Viewport`, `Design System` e avatar), com componentes e proporções.
- O arquivo `pencil.pen` presente em 18 de junho de 2026 contém apenas um frame
  vazio chamado `Frame`, com 800×600.

Antes de implementar a interface, decidir uma das opções:

1. restaurar/substituir `pencil.pen` pelos frames descritos em `DESIGN.md`; ou
2. autorizar explicitamente `DESIGN.md` como única fonte visual operacional.

Não iniciar implementação visual enquanto essa divergência permanecer.

## Objetivo

Implementar o painel mobile-first Queue Social consumindo a API pública existente,
sem adicionar áudio, autenticação ou regras de domínio ao cliente.

## Pré-condições

- Etapas 0 a 7 implementadas.
- Divergência entre `DESIGN.md` e `pencil.pen` resolvida.
- API pública disponível.
- Todos os gates da raiz passando.

## Fontes obrigatórias

Antes de editar UI, ler integralmente e aplicar nesta ordem:

1. `SPEC.md` e specs funcionais.
2. `DESIGN.md`.
3. `pencil.pen` corrigido ou decisão explícita sobre sua ausência.
4. `docs/specs/07-interface-web.md`.
5. Convenções existentes em `apps/web`.

Usar o fluxo obrigatório do plugin Product Design (`get-context`) antes de
prototipar ou implementar.

## Documentação atual

Consultar via Context7:

- Nuxt 4 e Vue para composables, data fetching e lifecycle;
- Tailwind CSS v4 para integração Nuxt e tokens;
- Lucide Vue para ícones;
- bibliotecas adicionais somente se realmente necessárias.

## Escopo

Implementar:

- shell visual e tokens;
- header com estado do sistema;
- player lógico atual;
- fila ordenada;
- busca Spotify;
- adicionar, remover, mover e skip;
- polling;
- estados de loading, vazio, sucesso e erro;
- responsividade e acessibilidade.

Não implementar:

- autenticação;
- voz ou áudio;
- drag-and-drop como única forma de reordenação;
- acesso direto ao banco ou API interna;
- estado de domínio duplicado no frontend.

## Componentes mínimos

```text
apps/web/app/
  components/
    PlayerBar.vue
    QueuePanel.vue
    QueueItem.vue
    TrackCard.vue
    SpotifySearch.vue
  composables/
    usePlayerState.ts
    useQueue.ts
    useSpotifySearch.ts
  assets/css/main.css
```

## API pública

Consumir somente:

```text
GET    /api/health
GET    /api/spotify/search?q=
GET    /api/queue
POST   /api/queue
DELETE /api/queue/:id
POST   /api/queue/:id/move
GET    /api/player
POST   /api/player/skip
```

Validar respostas relevantes com os schemas de `@waves/shared`.

## Comportamento

- Fila e player atualizam por polling a cada 2–3 segundos.
- Evitar requests concorrentes do mesmo polling.
- Busca usa debounce e cancela resultado obsoleto.
- Mutações bloqueiam apenas os controles afetados.
- Após mutação, atualizar projeções locais a partir da resposta do servidor.
- Movimento oferece botões acessíveis, mesmo se drag-and-drop for adicionado.
- Progresso do player é visual/indeterminado e explicitamente lógico.

## Responsividade

- Referência funcional prioritária: 390×844.
- Validar também largura intermediária e desktop 1440×1024.
- Mobile: fluxo único — player, fila e busca.
- Desktop: fila principal e coluna secundária de 420–480px.
- Sem scroll horizontal na fila mobile.

## Design e acessibilidade

- Usar os tokens definidos em `DESIGN.md`.
- Tailwind v4 com `@import "tailwindcss"`.
- Geist/Inter e Geist Mono conforme papéis documentados.
- Estados nunca dependem somente de cor.
- Alvos de toque de pelo menos 44px.
- `focus-visible` em todos os controles.
- `aria-live="polite"` para polling e player.
- Respeitar `prefers-reduced-motion`.
- Controles icon-only possuem nome acessível.

## Testes obrigatórios

- Renderização de player sem faixa e com faixa atual.
- Fila vazia, carregando, atualizando e com erro.
- Busca vazia, debounce, resultados, sem resultados e Spotify indisponível.
- Adicionar faixa e bloquear durante mutação.
- Remover e mover por controles acessíveis.
- Skip atualiza player/fila e bloqueia durante request.
- Polling inicia, não sobrepõe requests e é limpo no unmount.
- Respostas inválidas da API são tratadas.
- Operações essenciais funcionam por teclado.
- Nenhum secret aparece no bundle.

## Verificação visual obrigatória

Após iniciar o dev server:

1. usar browser automation para verificar carregamento e console;
2. capturar 390×844, largura intermediária e 1440×1024;
3. comparar com os frames visuais restaurados;
4. verificar default, hover, focus-visible, active, disabled e loading;
5. corrigir divergências antes de concluir.

## Definição de pronto

- Fluxos web funcionam contra a API pública.
- Direção Queue Social é fiel às fontes resolvidas.
- Mobile, intermediário e desktop foram verificados.
- Estados e acessibilidade estão cobertos.
- Nenhum secret entra no cliente.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` e
  `pnpm format:check` passam.

## Referências internas

- [`DESIGN.md`](../../DESIGN.md)
- [`docs/specs/07-interface-web.md`](../specs/07-interface-web.md)
- [`docs/specs/05-api-e-servicos-web.md`](../specs/05-api-e-servicos-web.md)
- [`docs/specs/09-qualidade-e-testes.md`](../specs/09-qualidade-e-testes.md)
- [`docs/implementation/etapa-07-bot-waves.md`](etapa-07-bot-waves.md)

## Progresso em 19 de junho de 2026

O bloqueio visual foi resolvido: o `pencil.pen` atual contém `Mobile Viewport`,
`Desktop Viewport`, `Design System` e `Discord Bot Avatar - Colored`.

Implementação funcional concluída:

- shell responsivo mobile-first e desktop;
- player lógico com estados vazio, carregando, erro e skip;
- fila em cards/tabela, remoção e movimento acessível;
- busca Spotify com debounce e cancelamento de resposta obsoleta;
- polling de fila e player a cada 2,5 segundos sem sobreposição;
- validação das respostas com schemas de `@waves/shared`;
- tokens, fontes, Tailwind CSS v4 e ícones Lucide;
- testes de componentes e composables.

Gates verificados: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` e
`pnpm format:check`. As rotas `/`, `/api/health`, `/api/queue` e `/api/player`
também responderam HTTP 200, e o bundle público não contém nomes de secrets.

Validação visual concluída em 19 de junho de 2026 nas larguras 390×844, 900×900 e
1440×1024. Não houve overflow horizontal ou erros no console. Busca, estados
preenchidos, foco e alvos de toque foram verificados. O relatório está em
[`design-qa.md`](../../design-qa.md) com `final result: passed`.
