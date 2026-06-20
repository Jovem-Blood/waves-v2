# Etapa 13 — Controles e interface

## Pré-requisito

Não iniciar antes de concluir o smoke manual e encerrar a Etapa 12.

## Objetivo

Adicionar pause, resume, volume e progresso observável, refletindo esses estados no
painel Queue Social sem transferir ao bot a propriedade persistida do player.

## Escopo previsto

- contratos e eventos de pause/resume;
- volume controlado no runtime e projetado pelo Nuxt;
- progresso periódico com frequência limitada;
- endpoints internos e públicos necessários;
- controles acessíveis no painel mobile-first;
- estados loading, disabled e erro;
- validação mobile, intermediária e desktop conforme `DESIGN.md` e `pencil.pen`.

## Fora do escopo

- novo provedor de áudio;
- seek arbitrário sem decisão específica;
- filas independentes por guild;
- autenticação web.
