#!/usr/bin/env bash
# Dump diário do PostgreSQL para FORA da VPS (Cloudflare R2, via rclone). Guarda 30 dias.
# Cron (como agendz):  0 3 * * * /opt/agendz/backup/backup-db.sh >> /opt/agendz/backup/backup.log 2>&1
# Pré-requisito: backup/configurar-r2.sh já rodado (cria r2.env).
set -euo pipefail
. /opt/agendz/backup/r2-env.sh
cd /opt/agendz
set -a; . ./.env; set +a
DATA=$(date +%F)
DESTINO="r2:${R2_BUCKET}/db/agendz-${DATA}.dump"
docker compose exec -T db pg_dump -U agendz -Fc agendz | rclone rcat "$DESTINO"
TAM=$(rclone size "$DESTINO" --json | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
[ "${TAM:-0}" -gt 1000 ] || { echo "$(date -Is) ERRO: dump ${DATA} vazio ou pequeno demais (${TAM:-0} bytes)" >&2; exit 1; }
rclone delete "r2:${R2_BUCKET}/db" --min-age 30d
echo "$(date -Is) dump ${DATA} enviado (${TAM} bytes)"
