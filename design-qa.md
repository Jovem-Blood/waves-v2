# Design QA — Etapa 8

- Source visual truth: `pencil.pen` (`Mobile Viewport`, `Desktop Viewport` e
  `Design System`) e `DESIGN.md`
- Implementation target: `http://127.0.0.1:3000/`
- Viewports: 390×844, 900×900 e 1440×1024
- State: player e fila preenchidos com respostas locais validadas pelos schemas
- Mobile screenshot: `artifacts/qa-mobile-final-390x844.png`
- Intermediate screenshot: `artifacts/qa-intermediate-900x900.png`
- Desktop screenshot: `artifacts/qa-desktop-populated-1440x1024.png`

## Full-view comparison evidence

- Mobile preserva a ordem normativa: player, fila e busca inferior.
- Desktop usa fila primária de 900px e coluna secundária de 468px.
- A largura intermediária retorna corretamente ao fluxo vertical.
- Não há overflow horizontal nas três larguras verificadas.
- Tipografia Geist/Inter/Geist Mono, tokens, bordas, estados e acentos seguem
  `DESIGN.md` e os frames correspondentes do Pencil.

## Focused region comparison evidence

- Player: estado, metadados, progresso lógico e skip permanecem visíveis.
- Fila: linha ativa, status textual, solicitante, duração e ações acessíveis.
- Busca: input de 50px, provider badge, debounce e cards de resultado.
- Mobile: botões de movimento e remoção medem 44×44.
- Foco por teclado é visível no campo de busca.

## Findings

Não restam findings P0, P1 ou P2.

## Patches made since previous QA pass

- Campo de busca recebeu `id` e `name`, removendo o aviso do navegador.
- Controles das linhas mobile foram ampliados de 36×44 para 44×44.

## Verification

- Console sem erros, warnings ou issues após as correções.
- Busca renderizou três resultados após debounce.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` e
  `pnpm format:check` passaram.

## Follow-up polish

- P3: substituir as capas vazias por arte real dependerá das URLs retornadas pelo
  Spotify em ambiente configurado.

final result: passed
