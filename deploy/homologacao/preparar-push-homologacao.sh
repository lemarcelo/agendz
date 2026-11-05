#!/usr/bin/env bash
# Cria chaves de teste apenas se o par ainda não existe. Nunca revela valores.
set -euo pipefail
set +x
umask 077
cd /opt/agendz/homologacao/ambiente
[ "$(pwd -P)" = /opt/agendz/homologacao/ambiente ] && [ -f .env ] || { echo 'Ambiente inválido.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'OpenSSL indisponível.' >&2; exit 1; }
tmp=$(mktemp .push-env.XXXXXXXX); par=$(mktemp .push-chave.XXXXXXXX)
trap 'rm -f -- "$tmp" "$par"' EXIT
cp -p .env "$tmp"; chmod 600 "$tmp"
printf '\n' >> "$tmp"
b64u() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
for prefixo in H_VAPID H_ADMIN_VAPID; do
  publica=$(grep -c "^${prefixo}_PUBLICA=" "$tmp" || true)
  privada=$(grep -c "^${prefixo}_PRIVADA=" "$tmp" || true)
  if [ "$publica" = 1 ] && [ "$privada" = 1 ]; then
    grep -q "^${prefixo}_PUBLICA=." "$tmp" && grep -q "^${prefixo}_PRIVADA=." "$tmp" || { echo 'Par existente incompleto; revisão necessária.' >&2; exit 1; }
    continue
  fi
  [ "$publica" = 0 ] && [ "$privada" = 0 ] || { echo 'Par existente incompleto ou duplicado; revisão necessária.' >&2; exit 1; }
  openssl ecparam -name prime256v1 -genkey -noout -out "$par" 2>/dev/null
  priv=$(openssl ec -in "$par" -outform DER 2>/dev/null | tail -c +8 | head -c 32 | b64u)
  pub=$(openssl ec -in "$par" -pubout -outform DER 2>/dev/null | tail -c 65 | b64u)
  [ ${#priv} -eq 43 ] && [ ${#pub} -eq 87 ] || { echo 'Não foi possível gerar as chaves.' >&2; exit 1; }
  printf '%s_PUBLICA=%s\n%s_PRIVADA=%s\n' "$prefixo" "$pub" "$prefixo" "$priv" >> "$tmp"
  unset priv pub
done
mv -f "$tmp" .env
echo 'Chaves de homologação conferidas; valores não exibidos.'
