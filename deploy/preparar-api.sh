#!/usr/bin/env bash
# Roda UMA vez na VPS (como agendz), em /opt/agendz: gera POSTGRES_PASSWORD, JWT_SEGREDO, CIFRA_CHAVE, CIFRA_PEPPER e as chaves VAPID (aviso com o app fechado) aleatórios no .env (sem sobrescrever o que já existe)
# e sobe o banco e a API. Os valores não aparecem na tela nem vão para o GitHub.
set -euo pipefail
cd /opt/agendz
[ -f .env ] || { echo "Falta /opt/agendz/.env (DOMINIO e EMAIL_ACME)."; exit 1; }
gerar() { head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c 48; }
grep -q '^POSTGRES_PASSWORD=' .env || echo "POSTGRES_PASSWORD=$(gerar)" >> .env
grep -q '^JWT_SEGREDO=' .env || echo "JWT_SEGREDO=$(gerar)" >> .env
# Cifra dos dados pessoais (CPF, telefone, nascimento). NUNCA troque depois de ter clientes: o que foi cifrado com a chave antiga não abre mais.
grep -q '^CIFRA_CHAVE=' .env || echo "CIFRA_CHAVE=$(gerar)" >> .env
grep -q '^CIFRA_PEPPER=' .env || echo "CIFRA_PEPPER=$(gerar)" >> .env
grep -q '^INTERNO_CHAVE=' .env || echo "INTERNO_CHAVE=$(gerar)" >> .env
# Chaves VAPID do aviso com o app fechado (par P-256, base64url). NUNCA troque depois que alguém ativou: as inscrições deixam de valer (as pessoas ativam de novo).
if ! grep -q '^VAPID_PRIVADA=' .env && command -v openssl >/dev/null; then
  par=$(mktemp); openssl ecparam -name prime256v1 -genkey -noout -out "$par" 2>/dev/null
  b64u() { base64 -w0 | tr '+/' '-_' | tr -d '='; }
  priv=$(openssl ec -in "$par" -outform DER 2>/dev/null | tail -c +8 | head -c 32 | b64u)
  pub=$(openssl ec -in "$par" -pubout -outform DER 2>/dev/null | tail -c 65 | b64u)
  rm -f "$par"
  if [ ${#priv} -eq 43 ] && [ ${#pub} -eq 87 ]; then echo "VAPID_PRIVADA=$priv" >> .env; echo "VAPID_PUBLICA=$pub" >> .env; else echo "Não consegui gerar as chaves VAPID (aviso com o app fechado fica desligado)."; fi
fi
chmod 600 .env
echo "Segredos conferidos em .env (valores ocultos)."
docker compose -f docker-compose.yml -f docker-compose.api.yml pull api || echo "Imagem da API ainda não publicada (ghcr.io). Rode o workflow de deploy da API no GitHub."
docker compose -f docker-compose.yml -f docker-compose.api.yml up -d
docker compose -f docker-compose.yml -f docker-compose.api.yml ps
