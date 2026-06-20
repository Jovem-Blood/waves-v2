# 01 — Visão e escopo

## Problema

Usuários autorizados precisam controlar, pelo Discord ou por uma interface web, a
fila de músicas associada ao bot Waves. A fila deve ser única, consistente e
persistente, independentemente da origem da ação.

## Usuários

- Membro de um servidor Discord usando slash commands.
- Operador do painel web privado.
- Desenvolvedor configurando e executando o sistema localmente.

Não haverá autenticação web na primeira entrega da fase 2. O painel continua
privado por ambiente e rede. Discord OAuth e allowlist permanecem adiados.

## Capacidades incluídas

- Buscar faixas no Spotify.
- Visualizar metadados de uma faixa.
- Adicionar uma faixa à fila.
- Visualizar a fila ordenada.
- Reordenar e remover itens.
- Consultar o estado lógico do player.
- Pular o item atual ou o primeiro item elegível.
- Usar `/play`, `/queue`, `/skip`, `/join` e `/leave`.
- Persistir fila e estado em SQLite.
- Atualizar a interface por polling.

## Fora do escopo

- Reprodução, download ou conversão de áudio.
- Entrada real do bot em canal de voz.
- YouTube, yt-dlp, play-dl, Lavalink ou FFmpeg.
- Pausar, retomar, volume, seek ou repeat reais.
- Autenticação web, Discord OAuth e autorização por allowlist.
- Filas independentes por guild.
- WebSocket, Server-Sent Events ou sincronização em tempo real.
- Aplicativos nativos.

## Restrições

- Nuxt 4 fullstack deve fornecer frontend e API Nitro.
- O bot deve ser um processo separado.
- O bot se comunica somente por HTTP com endpoints internos.
- Spotify Client Credentials deve ocorrer exclusivamente no servidor.
- TypeScript deve usar modo strict.
- Payloads, variáveis de ambiente e eventos devem ser validados com Zod.

## Resultado esperado

Ao final da fase 1, o Waves será um controlador de fila completo e demonstrável,
mas ainda não um reprodutor de áudio. Essa separação reduz risco e estabiliza
contratos antes da implementação de voz.

## Fase 2

### Capacidades planejadas

- Entrada e saída real do canal de voz.
- Uma conexão e um player de áudio por guild suportada.
- Resolução de fonte desacoplada dos metadados Spotify.
- Reprodução sequencial da fila persistida.
- Skip real coordenado com o skip de domínio.
- Pause, resume, volume e progresso.
- Recuperação controlada após desconexão ou falha da fonte.

### Fora do escopo inicial

- Filas independentes por guild.
- Recepção ou gravação de áudio dos usuários.
- Busca de músicas diretamente no provedor de áudio.
- Download permanente ou biblioteca local de mídia.
- Autenticação web e exposição pública do painel.

### Restrição de implementação

A Etapa 10 entrega somente a fundação de voz. Fonte de áudio, FFmpeg e reprodução
entram apenas após a conexão estar isolada, testada e sincronizada com a API.
