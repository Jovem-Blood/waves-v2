# Waves — Especificação do Sistema

Este documento é a porta de entrada para a construção do Waves, um sistema privado
para controlar a fila de músicas de um bot Discord por slash commands e por uma
interface web mobile-first.

## Identidade

- Nome do produto e do bot: **Waves**
- Nome técnico do monorepo: `discord-music-panel`
- Diretório do projeto: a raiz atual deste workspace
- Idioma inicial da interface: português

## Objetivo da fase 1

Entregar um sistema funcional em que:

1. O site busca músicas no Spotify e administra uma fila persistida.
2. O bot Discord usa slash commands para consultar e alterar essa mesma fila.
3. O Nuxt é o único proprietário da API, das regras de negócio e do banco.
4. O bot nunca acessa o banco diretamente.
5. Não existe reprodução real de áudio nesta fase.

**Status:** concluída em 19 de junho de 2026.

## Objetivo da fase 2

Evoluir o Waves para um player de voz real sem transferir ao bot a propriedade da
fila ou do estado persistido:

1. Conectar e desconectar o bot de canais de voz.
2. Resolver uma fonte reproduzível por meio de um adaptador explícito.
3. Reproduzir a fila persistida pelo Nuxt.
4. Sincronizar eventos de voz e reprodução pela API interna.
5. Adicionar pause, resume, volume e progresso em etapas posteriores.

A implementação começa pela Etapa 10, fundação de voz, sem áudio real.

Na Etapa 12, o runtime de playback foi implementado e validado inicialmente com
Audius. Após a cobertura insuficiente desse catálogo, YouTube Music via
`youtubei.js` 17.0.1 foi implementado como provedor primário, mantendo Audius como
fallback. O smoke de catálogo atingiu 10/10 candidatos corretos e streams abertos.

## Documentos

1. [Visão e escopo](docs/specs/01-visao-e-escopo.md)
2. [Arquitetura](docs/specs/02-arquitetura.md)
3. [Domínio e contratos](docs/specs/03-dominio-e-contratos.md)
4. [Banco de dados](docs/specs/04-banco-de-dados.md)
5. [API e serviços web](docs/specs/05-api-e-servicos-web.md)
6. [Bot Discord](docs/specs/06-bot-discord.md)
7. [Interface web](docs/specs/07-interface-web.md)
8. [Configuração, segurança e observabilidade](docs/specs/08-configuracao-seguranca-observabilidade.md)
9. [Qualidade e testes](docs/specs/09-qualidade-e-testes.md)
10. [Plano de implementação](docs/specs/10-plano-de-implementacao.md)
11. [Critérios de aceite](docs/specs/11-criterios-de-aceite.md)
12. [Decisões registradas](docs/specs/12-decisoes.md)

## Regra de trabalho

Cada etapa do plano deve ser implementada, validada e concluída antes da próxima.
Mudanças de escopo devem atualizar primeiro estes documentos e, quando relevante,
o registro de decisões.
