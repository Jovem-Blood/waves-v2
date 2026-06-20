# 02 — Arquitetura

## Visão geral

```text
Navegador
   │ API pública /api/*
   ▼
Nuxt 4 + Nitro ───────────────► Spotify Web API
   │
   ├── services
   ├── repositories
   └── Drizzle ORM ───────────► SQLite
   ▲
   │ API interna /api/internal/bot/*
   │ Bearer token
Bot discord.js
   ▲
   ├── Discord Gateway + Application Commands
   └── @discordjs/voice ───────────────► Discord Voice
```

## Monorepo

```text
apps/
  web/       Nuxt 4, Nitro, regras de negócio e banco
  bot/       discord.js, comandos e cliente HTTP
packages/
  shared/    schemas Zod e tipos compartilhados
```

## Responsabilidades

### `apps/web`

- Renderizar a interface.
- Expor rotas públicas e internas.
- Integrar com Spotify.
- Aplicar regras da fila e do player.
- Persistir dados.
- Validar autorização interna.

### `apps/bot`

- Conectar ao Discord.
- Registrar slash commands.
- Converter interações do Discord em chamadas HTTP.
- Formatar respostas amigáveis.
- Não duplicar regras de negócio.
- Manter conexões e players de áudio somente em memória.
- Publicar transições observáveis para a API interna.

### `packages/shared`

- Definir contratos independentes de runtime.
- Exportar schemas Zod e tipos inferidos.
- Evitar divergência entre bot, frontend e servidor.

## Camadas do web

```text
server route
  → valida entrada e autenticação
service
  → executa regra de negócio
repository
  → lê e grava dados
database
```

Rotas não devem conter SQL nem regras complexas. Repositórios não devem conhecer
HTTP. Serviços não devem depender de componentes Vue.

## Fonte da verdade

O banco controlado pelo Nuxt é a fonte da verdade para fila e player. Estado local
do bot e estado exibido no navegador são apenas projeções temporárias.

Na fase 2, `VoiceConnection`, `AudioPlayer`, subscriptions e streams são recursos
efêmeros e pertencem ao processo do bot. `guildId`, `voiceChannelId`, item atual e
status observável continuam pertencendo ao Nuxt e são atualizados por eventos
internos validados.

## Concorrência

Operações que alteram ordem devem executar em transação:

1. Ler itens relevantes.
2. Aplicar a alteração.
3. Recalcular posições contíguas iniciando em zero.
4. Persistir todas as mudanças.
5. Retornar a fila já ordenada.

## Estratégia de evolução

A fase 2 adiciona duas fronteiras distintas:

```text
VoiceManager
  ├── VoiceAdapter (@discordjs/voice)
  └── AudioPlayerManager
          │
          ▼
    AudioSourceResolver
          │
          ▼
    fonte reproduzível temporária
```

- `VoiceManager` gerencia no máximo uma sessão por guild e não conhece SQLite.
- `AudioSourceResolver` recebe metadados normalizados e retorna uma fonte
  reproduzível temporária.
- Spotify continua responsável somente por busca e metadados.
- O provedor de áudio será escolhido e registrado antes da etapa de resolução.
- Falhas de voz ou fonte são traduzidas em eventos; não alteram o banco diretamente.
