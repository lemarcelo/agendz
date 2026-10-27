#!/usr/bin/env bash
# F1: dump diário do PostgreSQL para FORA da VPS (Cloudflare R2 ou Backblaze B2, via rclone). Guarda 30 dias.
# Cron (como agendz):  0 3 * * * /opt/agendz/backup/backup-db.sh >> /opt/agendz/backup/backup.log 2>&1
# Pré-requisitos: `rclone config` com um remote chamado `backup` e um bucket (RCLONE_BUCKET no .env).
set -euo pipefail
cd /opt/agendz
set -a; . ./.env; set +a
DATA=$(date +%F)
docker compose exec -T db pg_dump -U agendz -Fc agendz | rclone rcat "backup:${RCLONE_BUCKET}/db/agendz-${DATA}.dump"
rclone delete "backup:${RCLONE_BUCKET}/db" --min-age 30d
echo "$(date -Is) dump ${DATA} enviado"
