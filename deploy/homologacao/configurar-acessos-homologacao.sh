#!/usr/bin/env bash
# Exibe senhas temporárias apenas no terminal interativo de quem executa.
set -euo pipefail
set +x
[ -t 0 ] && [ -t 1 ] || { echo 'Execute em um terminal interativo; não capture a saída em arquivo.' >&2; exit 1; }
cd /opt/agendz/homologacao/ambiente
[ "$(pwd -P)" = /opt/agendz/homologacao/ambiente ] || { echo 'Diretório inesperado.' >&2; exit 1; }
echo 'Anote as senhas temporárias exibidas abaixo; elas aparecem uma única vez.'
echo 'Não envie senhas pelo chat. Cada acesso pedirá uma nova senha no primeiro uso.'
bash provisionar-loja-homologacao.sh h-estetica 'Homologacao Estetica' estetica_automotiva homologacao 'Usuario Homologacao'
bash provisionar-loja-homologacao.sh h-barbearia 'Homologacao Barbearia' barbearia homologacao 'Usuario Homologacao'
echo 'Criando acesso administrativo de homologação...'
if saida=$(docker compose -p agendz-homologacao -f compose.yml run --rm -T --no-deps \
  -e ADMIN_CRIAR_EMAIL=admin@homologacao.invalid \
  -e 'ADMIN_CRIAR_NOME=Admin Homologacao' -e ADMIN_CRIAR_PAPEL=admin admin-api 2>&1); then
  printf '%s\n' "$saida" | sed -n '/^=====/,/^=====/p'
else
  printf '%s\n' "$saida" | sed -n '/^ERRO:/p' >&2
  unset saida
  echo 'Não foi possível criar o acesso administrativo; nenhum acesso existente foi redefinido.' >&2
  exit 1
fi
unset saida
