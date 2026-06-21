# Etapa 14 — End-to-end de voz

## Pré-requisito

Etapa 13 concluída em 20 de junho de 2026.

## Estado recebido

- Nuxt permanece fonte da verdade da fila e do player;
- pause, resume, volume e progresso estão persistidos e sincronizados;
- controles web e comandos Discord foram validados;
- playback, avanço, skip, leave, autojoin e retomada continuam funcionais;
- YouTube Music permanece fonte primária e Audius fallback.

## Objetivo

Validar o fluxo completo Discord → voz → fonte → API → SQLite → painel, revisar
reconexão, shutdown, falhas, bundle, logs, setup e troubleshooting e concluir os
critérios de aceite da Fase 2.

## Restrição

Não ampliar funcionalidades ou alterar provedor, arquitetura ou linguagem visual
sem nova decisão registrada.
