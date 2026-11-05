#!/usr/bin/env bash
# Atualiza apenas o site da homologação a partir de um candidato completo.
set -euo pipefail
umask 077
raiz=/opt/agendz/homologacao
if [ "$#" -ne 1 ] || [[ ! "$1" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Uso: bash atualizar-site-homologacao.sh <commit-agendz>' >&2; exit 2
fi
candidato="$raiz/candidatos/agendz/$1"
site="$raiz/ambiente/site"
[ -f "$candidato/pronto" ] && [ -d "$site" ] && [ ! -L "$site" ] || { echo 'Candidato ou site indisponível.' >&2; exit 1; }
for f in index-real.html sw.js manifest.webmanifest icone.svg; do
  [ -s "$candidato/$f" ] || { echo "Arquivo do candidato ausente: $f" >&2; exit 1; }
done
grep -q 'faixa-homologacao' "$candidato/index-real.html" || { echo 'Site sem identificação de homologação.' >&2; exit 1; }
mkdir -p "$raiz/backups-site"
backup=$(mktemp "$raiz/backups-site/index.XXXXXXXX")
cp -p "$site/index.html" "$backup"
for f in sw.js manifest.webmanifest icone.svg; do
  temp=$(mktemp "$site/.atualizacao.XXXXXXXX")
  install -m 644 "$candidato/$f" "$temp"
  mv -f "$temp" "$site/$f"
done
temp=$(mktemp "$site/.index.XXXXXXXX")
install -m 644 "$candidato/index-real.html" "$temp"
mv -f "$temp" "$site/index.html"
echo 'Site de homologação atualizado; APIs e bancos não foram alterados.'
