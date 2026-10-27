#!/usr/bin/env bash
# Restaura um dump em um banco de TESTE (agendz_teste) para provar que o backup funciona. Não mexe no banco de verdade.
# Uso: backup/restaurar.sh 2026-11-01      (sem argumento, lista os dumps disponíveis)
set -euo pipefail
. /opt/agendz/backup/r2-env.sh
cd /opt/agendz
set -a; . ./.env; set +a
if [ -z "${1:-}" ]; then echo "Dumps disponíveis:"; rclone lsf "r2:${R2_BUCKET}/db"; exit 0; fi
DATA=$1
docker compose exec -T db psql -U agendz -d postgres -c "DROP DATABASE IF EXISTS agendz_teste" -c "CREATE DATABASE agendz_teste"
rclone cat "r2:${R2_BUCKET}/db/agendz-${DATA}.dump" | docker compose exec -T db pg_restore -U agendz -d agendz_teste --no-owner
docker compose exec -T db psql -U agendz -d agendz_teste -c "select slug, tipo from loja order by slug"
echo "Restauração de teste ok. Apague com: docker compose exec -T db psql -U agendz -d postgres -c 'DROP DATABASE agendz_teste'"
