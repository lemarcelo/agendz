#!/usr/bin/env bash
# Roda UMA vez na VPS (como agendz): instala o rclone, guarda as chaves do Cloudflare R2 em /opt/agendz/backup/r2.env (modo 600) e testa
# enviar, listar e apagar um arquivinho no bucket. As chaves são digitadas aqui (a secreta não aparece na tela) e nunca saem da VPS.
set -euo pipefail
PASTA=/opt/agendz/backup
mkdir -p "$PASTA"
command -v rclone >/dev/null || { sudo apt-get update -qq && sudo apt-get install -y -qq rclone; }
pedir() { # pedir VARIAVEL "pergunta" REGEX "dica" [secreto]
  local v
  while true; do
    if [ "${5:-}" = secreto ]; then read -r -s -p "$2" v; echo; else read -r -p "$2" v; fi
    v=$(printf '%s' "$v" | tr -d '[:space:]')
    if [[ "$v" =~ $3 ]]; then printf -v "$1" '%s' "$v"; return; fi
    echo "  Valor inválido: $4" >&2
  done
}
pedir ENDPOINT "Endpoint (cole o endereço https://<id>.r2.cloudflarestorage.com): " '^https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com$' "tem que ser https://<32 caracteres>.r2.cloudflarestorage.com, sem /bucket no final"
read -r -p "Nome do bucket [agendz-backups]: " BUCKET; BUCKET=${BUCKET:-agendz-backups}
pedir AK "Access Key ID (32 caracteres): " '^[0-9a-f]{32}$' "o Access Key ID tem exatamente 32 caracteres (o de 64 é a Secret)"
pedir SK "Secret Access Key (64 caracteres, não aparece): " '^[0-9a-f]{64}$' "a Secret tem exatamente 64 caracteres" secreto
(umask 077; cat > "$PASTA/r2.env" <<ENV
R2_ENDPOINT=$ENDPOINT
R2_BUCKET=$BUCKET
R2_ACCESS_KEY_ID=$AK
R2_SECRET_ACCESS_KEY=$SK
ENV
)
chmod 600 "$PASTA/r2.env"
. "$PASTA/r2-env.sh"
# O R2 não aceita envio em streaming (rclone rcat → "501 NotImplemented"): envia sempre de um arquivo local (copyto).
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
echo "ok $(date -Is)" > "$TMP"
T="teste/ola-$(date +%s).txt"
rclone copyto "$TMP" "r2:${R2_BUCKET}/${T}"
rclone ls "r2:${R2_BUCKET}/teste"
rclone deletefile "r2:${R2_BUCKET}/${T}"
echo "R2 configurado e testado (enviou, listou e apagou um arquivo de teste)."
