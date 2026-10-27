#!/usr/bin/env bash
# Teste de fumaça do ambiente REAL (roda no CI depois do deploy da API; também serve a mão: `bash deploy/smoke-producao.sh agendz.io`).
# Só usa endpoints PÚBLICOS: nenhuma senha, nenhum token. Falha (exit 1) se algo estiver fora do esperado.
# Duas situações são aceitas para cada loja: já criada (200 com o tipo certo) ou ainda não criada (404 "Loja não encontrada").
# Variáveis: SMOKE_ESQUEMA (padrão https; os testes locais usam http), SMOKE_LOJAS (padrão "apex:estetica_automotiva dalforno:barbearia offbox:barbearia").
set -uo pipefail
DOMINIO=${1:?uso: smoke-producao.sh <dominio>}
ESQUEMA=${SMOKE_ESQUEMA:-https}
LOJAS=${SMOKE_LOJAS:-"apex:estetica_automotiva dalforno:barbearia offbox:barbearia"}
FALHAS=0
url() { printf '%s://%s.%s%s' "$ESQUEMA" "$1" "$DOMINIO" "$2"; }
falha() { echo "  FALHOU: $*"; FALHAS=$((FALHAS + 1)); [ -z "${GITHUB_ACTIONS:-}" ] || echo "::error title=smoke::$*"; } # no CI, a anotação deixa o motivo legível pela API do GitHub
ok() { echo "  ok: $*"; }
# pedido SLUG METODO CAMINHO [curl...] -> CODIGO em $COD, corpo em $CORPO, cabeçalhos em $CAB
pedido() {
  local slug=$1 metodo=$2 caminho=$3; shift 3
  local saida
  saida=$(curl -sS -m 20 -D - -X "$metodo" "$@" "$(url "$slug" "$caminho")" 2>&1) || { COD=000; CORPO="$saida"; CAB=""; return; }
  COD=$(printf '%s' "$saida" | tr -d '\r' | awk '/^HTTP/{c=$2} END{print c}')
  CAB=$(printf '%s' "$saida" | tr -d '\r' | awk 'BEGIN{h=1} /^$/{if(h){h=0; next}} h{print}')
  CORPO=$(printf '%s' "$saida" | tr -d '\r' | awk 'BEGIN{h=1} h&&/^$/{h=0; next} !h{print}')
}

for par in $LOJAS; do
  slug=${par%%:*}; tipo=${par##*:}
  echo "== $slug ($tipo)"

  pedido "$slug" GET /
  if [ "$COD" = "200" ] && printf '%s' "$CORPO" | grep -q 'Agendz'; then ok "site responde 200 com o título Agendz"; else falha "site: código $COD"; fi
  if printf '%s' "$CAB" | grep -qi '^strict-transport-security:'; then ok "HSTS ligado"; else falha "sem Strict-Transport-Security"; fi

  pedido "$slug" GET /api/publico/loja
  case "$COD" in
    200)
      if printf '%s' "$CORPO" | grep -q "\"tipo\":\"$tipo\"" && printf '%s' "$CORPO" | grep -q "\"slug\":\"$slug\""; then ok "loja existe com tipo $tipo"; else falha "loja com dados trocados: $CORPO"; fi ;;
    404)
      if printf '%s' "$CORPO" | grep -q 'Loja não encontrada'; then ok "API no ar; loja ainda não criada (esperado antes do provisionamento)"; else falha "404 sem a mensagem esperada: $CORPO"; fi ;;
    *) falha "API fora do ar ou com erro: código $COD" ;;
  esac
  CODIGO_LOJA=$COD
  CORPO_LOJA=$CORPO

  # cabeçalho forjado não pode trocar a loja
  pedido "$slug" GET /api/publico/loja -H "X-Forwarded-Host: dalforno.$DOMINIO" -H "Forwarded: host=offbox.$DOMINIO"
  if [ "$COD" = "$CODIGO_LOJA" ] && [ "$CORPO" = "$CORPO_LOJA" ]; then ok "X-Forwarded-Host forjado é ignorado"; else falha "cabeçalho forjado mudou a resposta ($COD)"; fi

  pedido "$slug" GET /api/clientes
  [ "$COD" = "401" ] && ok "sem token: 401" || falha "/api/clientes sem token devolveu $COD (esperado 401)"
  pedido "$slug" POST /api/clientes -H 'Content-Type: application/json' -d '{"nome":"x","telefone":"5553999999999"}'
  [ "$COD" = "401" ] && ok "criar cliente sem token: 401" || falha "POST /api/clientes sem token devolveu $COD (esperado 401)"
  pedido "$slug" GET /api/agendamentos
  [ "$COD" = "401" ] && ok "agenda sem token: 401" || falha "/api/agendamentos sem token devolveu $COD (esperado 401)"

  pedido "$slug" GET "/interno/dominio-permitido?domain=$slug.$DOMINIO"
  [ "$COD" = "404" ] && ok "/interno não é público (404)" || falha "/interno/* de fora devolveu $COD (esperado 404)"

  # login com usuário que não existe: 401 se a loja existe, 404 se ainda não foi criada; nunca 200 nem 5xx
  pedido "$slug" POST /api/auth/login -H 'Content-Type: application/json' -d '{"identificador":"smoke-inexistente","senha":"senha-errada-123"}'
  if { [ "$CODIGO_LOJA" = "200" ] && [ "$COD" = "401" ]; } || { [ "$CODIGO_LOJA" = "404" ] && [ "$COD" = "404" ]; }; then ok "login falso recusado ($COD)"; else falha "login falso devolveu $COD"; fi

  pedido "$slug" PUT /api/usuarios/me/senha -H 'Content-Type: application/json' -d '{"senhaAtual":"x","nova":"y-12345678"}'
  [ "$COD" = "401" ] && ok "trocar senha sem token: 401" || falha "PUT /api/usuarios/me/senha sem token devolveu $COD (esperado 401)"
done

echo
if [ "$FALHAS" -eq 0 ]; then echo "SMOKE OK ($DOMINIO)"; else echo "SMOKE FALHOU: $FALHAS verificação(ões) ($DOMINIO)"; exit 1; fi
