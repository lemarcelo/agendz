#!/usr/bin/env bash
# F1: restaura um dump em um banco de TESTE (agendz_teste) para provar que o backup funciona. Não mexe no banco de verdade.
# Uso: backup/restaurar.sh 2026-11-01
set -euo pipefail
cd /opt/agendz
set -a; . ./.env; set +a
DATA=${1:?informe a data, ex.: 2026-11-01}
docker compose exec -T db psql -U agendz -d postgres -c "DROP DATABASE IF EXISTS agendz_teste" -c "CREATE DATABASE agendz_teste"
rclone cat "backup:${RCLONE_BUCKET}/db/agendz-${DATA}.dump" | docker compose exec -T db pg_restore -U agendz -d agendz_teste --no-owner
docker compose exec -T db psql -U agendz -d agendz_teste -c "\dt" | head -20
echo "Restauração de teste ok. Apague com: docker compose exec -T db psql -U agendz -d postgres -c 'DROP DATABASE agendz_teste'"
