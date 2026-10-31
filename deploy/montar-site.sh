#!/usr/bin/env bash
# No seu computador (ou aqui comigo): gera o front para o seu domínio em deploy/site/index.html.
# Uso: deploy/montar-site.sh seudominio.com.br [--real]   (--real = site com login real na API)
set -euo pipefail
DOMINIO=${1:?informe o domínio, ex.: seudominio.com.br}
cd "$(dirname "$0")/.."
if [ "${2:-}" = "--real" ]; then  # site com login real (API Spring); sem o 2º argumento, a demonstração
  AGENDZ_DOMINIO="$DOMINIO" node build.mjs --real
  mkdir -p deploy/site && cp dist/index-real.html deploy/site/index.html && cp dist/sw.js dist/manifest.webmanifest dist/icone.svg deploy/site/
else
  AGENDZ_DOMINIO="$DOMINIO" node build.mjs
  mkdir -p deploy/site && cp dist/index.html deploy/site/index.html
fi  # index.html = página completa (doctype + viewport); agenda.html é só o fragmento do Artifact
echo "deploy/site/index.html pronto para $DOMINIO"
