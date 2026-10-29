#!/usr/bin/env bash
# Usuário de FUMAÇA (teste automático no site real). Roda na VPS (como agendz), em /opt/agendz; a chave interna NUNCA sai daqui (lida do .env).
#   bash fumaca.sh criar <slug>             → imprime {"usuario":"fumaca-xxxxxxxx","senha":"…"} (a senha só aparece agora)
#   bash fumaca.sh apagar <slug> <usuario>  → apaga o usuário de fumaça (só login `fumaca-` + 8 hexadecimais)
# Chama a rota interna pela rede do Docker (o Caddy não publica /interno); o wget do Caddy basta.
set -euo pipefail
cd "$(dirname "$0")"
acao="${1:-}"; slug="${2:-}"; usuario="${3:-}"
[[ "$slug" =~ ^[a-z0-9-]{1,40}$ ]] || { echo "slug inválido" >&2; exit 2; }
[ -f .env ] || { echo "falta .env" >&2; exit 2; }
chave="$(grep '^INTERNO_CHAVE=' .env | head -1 | cut -d= -f2-)"
[ "${#chave}" -ge 16 ] || { echo "INTERNO_CHAVE ausente ou curta (rode preparar-api.sh)" >&2; exit 2; }
dc=(docker compose -f docker-compose.yml -f docker-compose.api.yml)
chamar() { "${dc[@]}" exec -T caddy wget -qO- --header="X-Interno-Chave: $chave" --post-data='' "http://api:8080/interno/plataforma/lojas/$slug/$1"; }
case "$acao" in
  criar) chamar fumaca ;;
  apagar) [[ "$usuario" =~ ^fumaca-[0-9a-f]{8}$ ]] || { echo "usuário inválido" >&2; exit 2; }; chamar "fumaca/$usuario/apagar" && echo "apagado" ;;
  *) echo "uso: fumaca.sh criar <slug> | apagar <slug> <usuario>" >&2; exit 2 ;;
esac
