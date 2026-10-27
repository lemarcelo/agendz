#!/usr/bin/env bash
# Roda UMA vez na VPS (como agendz): instala o rclone, guarda as chaves do Cloudflare R2 em /opt/agendz/backup/r2.env (modo 600) e testa
# enviar, listar e apagar um arquivinho no bucket. As chaves são digitadas aqui (a secreta não aparece na tela) e nunca saem da VPS.
set -euo pipefail
PASTA=/opt/agendz/backup
mkdir -p "$PASTA"
command -v rclone >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq rclone; }
read -r -p "Endpoint (https://<id>.r2.cloudflarestorage.com): " ENDPOINT
read -r -p "Nome do bucket [agendz-backups]: " BUCKET; BUCKET=${BUCKET:-agendz-backups}
read -r -p "Access Key ID: " AK
read -r -s -p "Secret Access Key (não aparece): " SK; echo
(umask 077; cat > "$PASTA/r2.env" <<ENV
R2_ENDPOINT=$ENDPOINT
R2_BUCKET=$BUCKET
R2_ACCESS_KEY_ID=$AK
R2_SECRET_ACCESS_KEY=$SK
ENV
)
chmod 600 "$PASTA/r2.env"
. "$PASTA/r2-env.sh"
T="teste/ola-$(date +%s).txt"
echo "ok $(date -Is)" | rclone rcat "r2:${R2_BUCKET}/${T}"
rclone ls "r2:${R2_BUCKET}/teste"
rclone deletefile "r2:${R2_BUCKET}/${T}"
echo "R2 configurado e testado (enviou, listou e apagou um arquivo de teste)."
