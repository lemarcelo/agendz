#!/usr/bin/env bash
# Roda NA VPS, como agendz, em /opt/agendz. Cria uma LOJA NOVA com um comando: banco + dono + senha temporária + verificação do endereço.
# Não precisa mexer em DNS (o registro curinga *.DOMINIO já aponta para a VPS) nem no Caddy (certificado sob demanda, liberado pela API).
#
# Uso:  bash nova-loja.sh <subdominio> "<Nome da loja>" <tipo> <login-do-dono> "<Nome do dono>" [--logo-arquivo caminho]
#   tipo: estetica_automotiva | barbearia
# Exemplo:  bash nova-loja.sh barbearia-x "Barbearia X" barbearia joao "João"
#   -> https://barbearia-x.agendz.io  (o dono entra com a senha temporária mostrada UMA vez e troca no primeiro acesso)
set -euo pipefail
cd "$(dirname "$0")"
[ $# -ge 5 ] || { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
SLUG=$1; TIPO=$3
[[ $SLUG =~ ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$ ]] || { echo "Subdomínio inválido: use minúsculas, números e hífen (ex.: barbearia-x)."; exit 2; }
case "$SLUG" in www|app|api|admin|painel|static|assets|mail|agendar|login|suporte|status) echo "Subdomínio reservado: $SLUG"; exit 2 ;; esac
case "$TIPO" in estetica_automotiva|barbearia) ;; *) echo "Tipo inválido: $TIPO (estetica_automotiva ou barbearia). O tipo não muda depois."; exit 2 ;; esac
DOMINIO=${DOMINIO:-$(grep -E '^DOMINIO=' .env | head -1 | cut -d= -f2-)}
[ -n "$DOMINIO" ] || { echo "DOMINIO não definido (.env)."; exit 2; }

bash provisionar-loja.sh "$@"

# A primeira visita faz o Caddy pedir o certificado (a API confirma que a loja existe). Tenta por até ~90 s.
echo; echo "Verificando https://$SLUG.$DOMINIO ..."
for i in $(seq 1 18); do
  corpo=$(curl -sS -m 15 "https://$SLUG.$DOMINIO/api/publico/loja" 2>/dev/null || true)
  if printf '%s' "$corpo" | grep -q "\"tipo\":\"$TIPO\""; then
    echo "OK: https://$SLUG.$DOMINIO está no ar (tipo $TIPO)."; exit 0
  fi
  sleep 5
done
echo "A loja foi criada no banco, mas o endereço ainda não respondeu. Confira: DNS curinga (*.$DOMINIO) e 'docker compose logs caddy'."
exit 1
