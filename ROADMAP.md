# Waves — Roadmap de features

Este documento registra sugestões levantadas a partir do estado do projeto em
21 de junho de 2026.

As estimativas consideram uma pessoa desenvolvedora e incluem implementação,
testes e migrações aplicáveis.

## Estado atual

O Waves já possui:

- fila persistente;
- busca de metadados pelo Spotify;
- reprodução via YouTube Music com fallback para Audius;
- controles de pause, resume, volume, progresso e skip;
- integração com comandos Discord;
- reordenação da fila por botões e drag-and-drop;
- sincronização por polling;
- temas visuais;
- testes de contratos, serviços, repositories, API, bot e componentes.

O principal limite arquitetural é que o domínio mantém uma única fila global e
um único `player_state`. O bot possui sessões de runtime por `guildId`, mas a API
e o banco ainda não isolam estado por servidor ou sala.

## Prioridades

- **P0:** alto impacto ou fundação necessária.
- **P1:** melhoria relevante após as fundações.
- **P2:** evolução desejável, mas não bloqueante.

## Baixa complexidade

| Feature | Estimativa | Prioridade | Objetivo |
| --- | --- | --- | --- |
| Toasts para ações e erros | 0,5–1 dia | P0 | Dar retorno claro ao adicionar, remover, mover ou controlar o player |
| Desfazer remoção | 0,5–1 dia | P0 | Evitar perda acidental, especialmente no mobile |
| ETA de cada faixa | 1 dia | P0 | Mostrar em quanto tempo cada música deve tocar |
| Status real do bot, servidor e canal | 1–2 dias | P0 | Remover informações fixas e distinguir web, bot e conexão de voz |
| Player compacto fixo no mobile | 1–2 dias | P1 | Manter pause e skip acessíveis durante a navegação |
| Ação “Tocar em seguida” | 1–2 dias | P1 | Inserir uma faixa logo após a atual sem reordenação manual |
| Busca recente | 1–2 dias | P2 | Acelerar pedidos recorrentes |
| Álbum e link para Spotify | 1 dia | P2 | Aproveitar metadados já disponíveis |
| Bloqueio de faixas duplicadas | 1–2 dias | P1 | Impedir duplicação também no servidor |
| Estado offline e reconectando | 1–2 dias | P0 | Comunicar indisponibilidade e recuperação com precisão |

## Média complexidade

| Feature | Estimativa | Prioridade | Objetivo |
| --- | --- | --- | --- |
| Histórico de reprodução | 2–4 dias | P0 | Expor faixas `played`, `skipped` e `failed` já persistidas |
| Identidade temporária no painel | 2–4 dias | P0 | Associar nome e avatar local aos pedidos web |
| Atualização em tempo real com SSE | 3–5 dias | P0 | Substituir polling e reduzir conflitos de estado |
| Controle de conexão pelo painel | 3–5 dias | P1 | Selecionar canal, entrar, sair e reconectar pelo web |
| Limite de fila por usuário | 3–5 dias | P0 multiusuário | Evitar monopolização da fila |
| Alternância justa entre usuários | 4–6 dias | P0 multiusuário | Distribuir a reprodução entre participantes |
| Favoritos e recentes por usuário | 4–6 dias | P1 | Facilitar pedidos frequentes |
| Votação para skip | 4–7 dias | P1 multiusuário | Tornar o skip uma decisão coletiva |
| Preferências persistidas | 3–5 dias | P2 | Salvar tema, volume padrão e preferências por pessoa ou sala |
| Filtros no histórico | 3–5 dias | P2 | Filtrar por usuário, artista, período e resultado |
| Retry manual de faixa com falha | 2–4 dias | P1 | Permitir nova resolução e tentativa de playback |
| Autocomplete nos comandos Discord | 3–5 dias | P1 | Melhorar a escolha de resultados no `/play` |

## Alta complexidade

| Feature | Estimativa | Prioridade | Objetivo |
| --- | --- | --- | --- |
| Login com Discord | 5–8 dias | P0 multiusuário | Unificar identidade entre painel e Discord |
| Papéis e permissões | 4–7 dias após login | P0 multiusuário | Suportar administradores, DJs, membros e visitantes |
| Administração de usuários permitidos | 3–5 dias após login | P0 | Utilizar a tabela `allowed_users` existente |
| Auditoria de ações | 4–7 dias | P1 | Registrar quem removeu, pulou, reordenou ou alterou controles |
| Playlists compartilhadas | 7–12 dias | P1 | Salvar, reutilizar e colaborar em conjuntos de faixas |
| Presença de ouvintes | 5–8 dias | P1 | Mostrar participantes e apoiar regras de votação |
| Autoplay configurável | 7–12 dias | P2 | Continuar a reprodução com recomendações |
| Modos e regras da sala | 7–12 dias | P2 | Configurar horário silencioso, volume máximo e políticas |

## Muito alta complexidade

| Feature | Estimativa | Prioridade | Objetivo |
| --- | --- | --- | --- |
| Isolamento por servidor e sala | 2–4 semanas | P0 estratégico | Suportar múltiplas guilds sem compartilhar fila ou player |
| Convites e associação usuário–servidor | 1–2 semanas | P0 estratégico | Controlar a quais salas cada usuário tem acesso |
| Configuração independente por guild | 1–2 semanas | P0 estratégico | Definir canal, volume, permissões e regras por servidor |
| Dashboard administrativo multi-servidor | 1–2 semanas | P1 | Operar várias guilds em uma interface |
| Escalabilidade horizontal do bot | 2–4 semanas | P2 | Distribuir sessões quando houver volume relevante |

## Sequência recomendada

1. Toasts, desfazer remoção, ETA e status real do bot.
2. Histórico de reprodução.
3. Sincronização em tempo real com SSE.
4. Login com Discord usando `allowed_users`.
5. Papéis `admin`, `DJ` e `member`.
6. Limites por usuário e alternância justa.
7. Votação para skip e presença de ouvintes.
8. Isolamento por guild e sala.
9. Favoritos e playlists compartilhadas.

## Fundação para múltiplos usuários

Antes de oferecer suporte real a vários servidores, adicionar `guildId` ou
`roomId` a:

- `queue_items`;
- `player_state`;
- `resolved_sources`, direta ou indiretamente;
- contratos compartilhados;
- services e repositories;
- rotas públicas e internas;
- chamadas do bot.

As restrições únicas de posição e item em reprodução também precisam passar a
ser compostas pelo identificador da sala.

Sem esse isolamento, diferentes guilds compartilhariam fila, estado do player e
transições de playback.

## Critério de escolha

Ao selecionar a próxima feature, considerar nesta ordem:

1. impacto na usabilidade diária;
2. redução de erros ou ambiguidade;
3. preparação para identidade e colaboração;
4. dependências arquiteturais;
5. custo de implementação e manutenção.
