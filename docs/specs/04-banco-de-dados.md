# 04 — Banco de dados

## Tecnologia

- SQLite local.
- Drizzle ORM.
- URL inicial: `file:./dev.db`.
- Migrações versionadas no repositório.

## `queue_items`

Campos:

- `id`: text, chave primária.
- `track_id`: text, obrigatório; preserva a identidade normalizada de `TrackMetadata`.
- `provider`: text, obrigatório.
- `provider_track_id`: text, obrigatório.
- `title`: text, obrigatório.
- `artists_json`: text JSON, obrigatório.
- `album_name`: text, opcional.
- `duration_ms`: integer, obrigatório.
- `cover_url`: text, opcional.
- `external_url`: text, opcional.
- `isrc`: text, opcional.
- `requested_by_discord_user_id`: text, opcional.
- `requested_by_display_name`: text, opcional.
- `status`: text, obrigatório.
- `position`: integer, obrigatório.
- `created_at`: text, obrigatório.
- `updated_at`: text, obrigatório.

Índices:

- índice por `status`.
- índice por `position`.
- índice por `created_at`.

## `player_state`

Tabela singleton:

- `id`: integer, chave primária, valor fixo `1`.
- `status`: text, obrigatório.
- `current_queue_item_id`: text, opcional.
- `voice_channel_id`: text, opcional.
- `guild_id`: text, opcional.
- `updated_at`: text, obrigatório.

Se não existir registro, o repositório retorna e persiste estado inicial `idle`.

## `resolved_sources`

Usada a partir da Etapa 11 para cache de resoluções temporárias:

- `id`
- `queue_item_id`
- `source_provider`
- `source_identifier`
- `stream_url`
- `expires_at`: expiração conservadora da URL de stream.
- `created_at`
- `updated_at`

Uma resolução válida e não expirada pode ser reutilizada. Resoluções ausentes ou
expiradas são substituídas atomicamente por uma nova linha para o item. A Etapa 11
reutiliza o schema inicial e não cria migração adicional.

## `allowed_users`

Criada para fase futura:

- `id`
- `discord_user_id`
- `display_name`
- `enabled`
- `created_at`
- `updated_at`

Não deve controlar acesso na fase 1.

## Invariantes

- Não podem existir posições duplicadas entre itens ativos.
- Após remoção ou movimento, posições devem ser recalculadas.
- Um único item pode estar com status `playing`.
- O `current_queue_item_id`, quando definido, deve apontar para item existente.
- Alterações de fila e player relacionadas devem ser atômicas.

## Política de histórico

Na fase 1, itens pulados podem permanecer no banco com status `skipped`, mas a fila
visível retorna apenas itens ativos (`queued` e `playing`). Essa decisão preserva
histórico mínimo sem poluir a interface.
