#!/usr/bin/env bash
# Cria credenciais novas e exclusivas no diretório atual. Não inicia serviços.
set -euo pipefail
umask 077

if [ "$#" -ne 2 ]; then
  echo 'Uso: bash preparar-homologacao.sh <imagem-agendz> <imagem-admin>' >&2
  exit 2
fi

imagem_valida() {
  [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:-]*(@sha256:[0-9a-f]{64}|:[0-9a-f]{40})$ ]]
}
imagem_valida "$1" && imagem_valida "$2" || {
  echo 'Use imagens fixadas por digest SHA-256 ou por um identificador completo de commit.' >&2
  exit 2
}
[ ! -e .env ] || { echo '.env já existe; nenhuma credencial foi alterada.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'OpenSSL não encontrado.' >&2; exit 1; }
subrede=$(docker network inspect agendz_default --format '{{range .IPAM.Config}}{{println .Subnet}}{{end}}' | grep -E '^[0-9]+(\.[0-9]+){3}/[0-9]+$' | head -n 1)
[ -n "$subrede" ] || { echo 'Sub-rede IPv4 do proxy não encontrada.' >&2; exit 1; }

arquivo=$(mktemp .env.homologacao.XXXXXXXX)
trap 'rm -f -- "$arquivo"' EXIT
gerar() { openssl rand -hex 32; }
{
  printf 'H_AGENDZ_IMAGE=%s\nH_ADMIN_IMAGE=%s\n' "$1" "$2"
  for nome in H_DB_PASSWORD H_ADMIN_DB_PASSWORD H_JWT_SEGREDO H_CIFRA_CHAVE H_CIFRA_PEPPER H_ADMIN_JWT_SEGREDO H_ADMIN_CIFRA_CHAVE H_INTERNO_CHAVE; do
    printf '%s=%s\n' "$nome" "$(gerar)"
  done
  printf 'H_PROXY_CIDR=%s\n' "$subrede"
} > "$arquivo"
chmod 600 "$arquivo"
# Um link rígido falha se .env surgir simultaneamente; nunca sobrescreve segredos existentes.
ln -- "$arquivo" .env
echo 'Credenciais de homologação criadas com acesso restrito; nenhum serviço foi iniciado.'
