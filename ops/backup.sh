#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

docker compose \
  --project-name waves \
  --env-file .env \
  -f docker-compose.yml \
  exec -T web node apps/web/backup-database.mjs /backups
