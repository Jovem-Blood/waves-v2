# Prompt de execução — Etapa 13: controles e interface

Continue o projeto Waves em `C:\Users\luiss\Projects\waves` e implemente somente a
Etapa 13 — Controles e interface.

## Leitura obrigatória

Leia integralmente:

- `AGENTS.md`;
- `SPEC.md`;
- `DESIGN.md`;
- `pencil.pen`;
- `README.md`;
- `docs/specs/03-dominio-e-contratos.md`;
- `docs/specs/05-api-e-servicos-web.md`;
- `docs/specs/06-bot-discord.md`;
- `docs/specs/07-interface-web.md`;
- `docs/specs/08-configuracao-seguranca-observabilidade.md`;
- `docs/specs/09-qualidade-e-testes.md`;
- `docs/specs/10-plano-de-implementacao.md`;
- `docs/specs/11-criterios-de-aceite.md`;
- `docs/specs/12-decisoes.md`;
- `docs/implementation/etapa-12-reproducao-e-avanco-automatico.md`;
- `docs/implementation/etapa-13-controles-e-interface.md`.

Use Context7 antes de trabalhar com APIs atuais de Nuxt, Vue, discord.js,
`@discordjs/voice` ou bibliotecas de UI.

## Estado recebido

- Etapa 12 concluída em 20 de junho de 2026;
- Nuxt é a fonte da verdade da fila e do player;
- YouTube Music via `youtubei.js` é a fonte primária e Audius é fallback;
- playback completo, avanço natural, skip e leave foram validados no Discord;
- `/play` executa autojoin quando o solicitante está em voz;
- `/join` retoma fila pendente;
- adição pela web retoma playback ocioso enquanto o bot está conectado;
- skip, leave, retry e shutdown cancelam o range HTTP ativo;
- `voice.disconnected` devolve o item interrompido para `queued`;
- não execute duas instâncias do bot com o mesmo token.

## Objetivo

Adicionar pause, resume, volume e progresso observável ao runtime e ao painel Queue
Social, mantendo o Nuxt como autoridade persistida e o bot apenas com recursos
efêmeros.

## Escopo

- contratos Zod e tipos compartilhados para pause, resume, volume e progresso;
- transições atômicas no `PlayerStateService`;
- endpoints públicos e internos finos;
- comandos Discord necessários;
- controle real do `AudioPlayer` e do volume do recurso;
- sincronização limitada de progresso, sem escrita excessiva;
- estados `playing`, `paused`, `idle` e erros consistentes;
- controles acessíveis e mobile-first no painel existente;
- loading, disabled, focus-visible e feedback de erro;
- testes unitários, integração e smoke Discord real.

## Restrições

- não alterar provedor de áudio;
- não introduzir seek arbitrário sem nova decisão;
- não mover regras de fila para o bot;
- não acessar SQLite/Drizzle no bot;
- não quebrar autojoin, retomada web, avanço, skip, leave ou cancelamento;
- não registrar URLs, tokens, headers, cookies ou payloads InnerTube;
- preservar TypeScript strict e `exactOptionalPropertyTypes`;
- preservar a direção visual Queue Social de `DESIGN.md` e `pencil.pen`.

## Sequência recomendada

1. Definir contratos e invariantes de estado.
2. Implementar services e persistência no Nuxt.
3. Implementar rotas públicas e internas.
4. Implementar runtime do bot e comandos.
5. Implementar UI conforme o design.
6. Testar pause/resume, volume, progresso e corridas com skip/leave.
7. Executar smoke Discord e validação visual mobile, intermediária e desktop.
8. Executar gates e atualizar documentação/handoff da Etapa 14.

## Casos obrigatórios

- pause durante playback e pause idempotente;
- resume após pause e resume inválido;
- skip e leave enquanto pausado;
- volume mínimo, máximo, default e valor inválido;
- progresso monotônico e limitado à duração;
- conclusão natural após resume;
- adição web e autojoin continuam funcionando;
- restart/desconexão não deixam estado `paused` órfão;
- nenhuma duplicidade de conclusão ou próximo item;
- nenhum secret nos logs.

## Gates

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
pnpm --filter bot exec node -e "import('@discordjs/voice').then(m => console.log(m.generateDependencyReport()))"
```

Não declare a Etapa 13 concluída sem smoke Discord real e validação visual conforme
`DESIGN.md` e `pencil.pen`.
