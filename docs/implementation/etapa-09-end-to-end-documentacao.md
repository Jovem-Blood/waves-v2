# Próxima etapa — End-to-end e documentação

## Objetivo

Validar a fase 1 completa em ambiente local configurado e consolidar a
documentação operacional.

## Pré-condições

- Etapas 0 a 8 concluídas.
- Migração SQLite aplicada no banco local.
- Credenciais Spotify válidas.
- Bot Discord configurado e comandos registrados no guild de teste.

## Escopo

- executar smoke test navegador → API → SQLite;
- validar busca Spotify real, adição, movimento, remoção e skip;
- validar Discord → bot → API interna → SQLite;
- revisar logs e bundle para ausência de secrets;
- atualizar README com setup reproduzível e troubleshooting;
- registrar limitações da fase 1;
- marcar somente critérios de aceite verificados manualmente.

## Evidências da etapa 8

- [`design-qa.md`](../../design-qa.md) com `final result: passed`;
- capturas em `artifacts/`;
- 72 testes web, 15 testes do bot e 8 testes compartilhados;
- lint, typecheck, build e format check aprovados.

## Gates

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm format:check
```

## Definição de pronto

- todos os critérios de aceite aplicáveis marcados;
- setup local reproduzido do zero;
- fluxos web e Discord validados contra o mesmo banco;
- nenhum secret presente no cliente ou nos logs;
- documentação final consistente com a implementação.

## Execução em 19 de junho de 2026

### Verificado

- `.env` raiz contém todas as variáveis exigidas por web e bot;
- migração Drizzle aplicada em `apps/web/dev.db`;
- Nuxt carrega explicitamente `../../.env` em desenvolvimento;
- H3 alinhado à versão estável compatível com o Nuxt;
- Spotify Client Credentials validado e busca real retornou 10 faixas;
- navegador adicionou três faixas, moveu, removeu e executou skip;
- fila persistiu após reinício do Nuxt;
- API interna rejeitou bearer ausente com 401;
- cliente real do bot executou queue, play e skip contra o mesmo SQLite;
- cinco comandos foram registrados no guild configurado;
- bot conectou e emitiu `Waves bot ready`;
- bundle público e logs foram comparados com os secrets configurados, sem matches;
- bot permanece sem imports de SQLite, Drizzle ou repositories.
- suíte final passou com 95 testes: 72 web, 15 bot e 8 shared;
- lint, typecheck, build e format check finais passaram.

### Correções encontradas durante o E2E

- `apps/web/package.json`: `dev` usa `nuxt dev --dotenv ../../.env`;
- dependência `h3` saiu de `2.0.1-rc.22` para a linha estável `1.15`;
- erros públicos agora registram somente rota sem query, nome e código do erro.

### Validação manual no Discord

Validado em 19 de junho de 2026, como usuário do guild:

1. `/play` adicionou a faixa e retornou confirmação;
2. `/queue` exibiu a fila compartilhada;
3. `/skip` concluiu o skip lógico e esvaziou a fila;
4. novo `/play` voltou a adicionar a faixa;
5. o painel web exibiu a mesma fila alterada pelo Discord.

A evidência visual mostra Discord e painel web lado a lado, com `No One Noticed` na
mesma fila e uma segunda faixa adicionada pelo painel.

O rerun final de `pnpm test` após o alinhamento do H3 passou com 95 testes. A
tentativa de controlar o Discord diretamente nesta execução falhou antes de acessar
o aplicativo, porque o helper de automação do Windows não pôde ser iniciado
(`CreateProcessAsUserW` retornou acesso negado). A validação foi posteriormente
executada pelo usuário e comprovada por captura de tela.

## Resultado

Etapa 9 e fase 1 concluídas em 19 de junho de 2026.
