#!/usr/bin/env bash
# Roda UMA vez na VPS (como agendz), em /opt/agendz: gera POSTGRES_PASSWORD, JWT_SEGREDO, CIFRA_CHAVE e CIFRA_PEPPER aleatórios no .env (sem sobrescrever o que já existe)
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
chmod 600 .env
echo "Segredos conferidos em .env (valores ocultos)."
docker compose -f docker-compose.yml -f docker-compose.api.yml pull api || echo "Imagem da API ainda não publicada (ghcr.io). Rode o workflow de deploy da API no GitHub."
docker compose -f docker-compose.yml -f docker-compose.api.yml up -d
docker compose -f docker-compose.yml -f docker-compose.api.yml ps
