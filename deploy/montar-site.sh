#!/usr/bin/env bash
# No seu computador (ou aqui comigo): gera o front para o seu domínio em deploy/site/index.html.
# Uso: deploy/montar-site.sh seudominio.com.br
set -euo pipefail
DOMINIO=${1:?informe o domínio, ex.: seudominio.com.br}
cd "$(dirname "$0")/.."
AGENDZ_DOMINIO="$DOMINIO" node build.mjs
mkdir -p deploy/site && cp dist/agenda.html deploy/site/index.html
echo "deploy/site/index.html pronto para $DOMINIO"
