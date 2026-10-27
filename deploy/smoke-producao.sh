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
  if [ "$COD" = "200" ] && grep -q 'Agendz' <<<"$CORPO"; then ok "site responde 200 com o título Agendz"; else falha "site: código $COD"; fi
  if grep -qi '^strict-transport-security:' <<<"$CAB"; then ok "HSTS ligado"; else falha "sem Strict-Transport-Security"; fi

  pedido "$slug" GET /api/publico/loja
  case "$COD" in
    200)
      if grep -q "\"tipo\":\"$tipo\"" <<<"$CORPO" && grep -q "\"slug\":\"$slug\"" <<<"$CORPO"; then ok "loja existe com tipo $tipo"; else falha "loja com dados trocados: $CORPO"; fi ;;
    404)
      if grep -q 'Loja não encontrada' <<<"$CORPO"; then ok "API no ar; loja ainda não criada (esperado antes do provisionamento)"; else falha "404 sem a mensagem esperada: $CORPO"; fi ;;
    *) falha "API fora do ar ou com erro: código $COD" ;;
  esac
  CODIGO_LOJA=$COD
  CORPO_LOJA=$CORPO

  # cabeçalho forjado não pode trocar a loja
  pedido "$slug" GET /api/publico/loja -H "X-Forwarded-Host: dalforno.$DOMINIO" -H "Forwarded: host=offbox.$DOMINIO"
  if [ "$COD" = "$CODIGO_LOJA" ] && [ "$CORPO" = "$CORPO_LOJA" ]; then ok "X-Forwarded-Host forjado é ignorado"; else falha "cabeçalho forjado mudou a resposta ($COD)"; fi

  # rota protegida sem token: 401 se a loja existe; 404 se ainda não foi criada (o filtro do Host recusa antes de olhar o token). Nunca 200 nem 5xx.
  protegida() { # descrição método caminho [curl...]
    local desc=$1 metodo=$2 caminho=$3; shift 3
    local esperado=401; [ "$CODIGO_LOJA" = "404" ] && esperado=404
    pedido "$slug" "$metodo" "$caminho" "$@"
    [ "$COD" = "$esperado" ] && ok "$desc sem token: $COD" || falha "$desc sem token devolveu $COD (esperado $esperado)"
  }
  protegida "GET /api/clientes" GET /api/clientes
  protegida "POST /api/clientes" POST /api/clientes -H 'Content-Type: application/json' -d '{"nome":"x","telefone":"5553999999999"}'
  protegida "GET /api/agendamentos" GET /api/agendamentos

  pedido "$slug" GET "/interno/dominio-permitido?domain=$slug.$DOMINIO"
  [ "$COD" = "404" ] && ok "/interno não é público (404)" || falha "/interno/* de fora devolveu $COD (esperado 404)"

  # login com usuário que não existe: 401 se a loja existe, 404 se ainda não foi criada; nunca 200 nem 5xx
  pedido "$slug" POST /api/auth/login -H 'Content-Type: application/json' -d '{"identificador":"smoke-inexistente","senha":"senha-errada-123"}'
  if { [ "$CODIGO_LOJA" = "200" ] && [ "$COD" = "401" ]; } || { [ "$CODIGO_LOJA" = "404" ] && [ "$COD" = "404" ]; }; then ok "login falso recusado ($COD)"; else falha "login falso devolveu $COD"; fi

  protegida "PUT /api/usuarios/me/senha" PUT /api/usuarios/me/senha -H 'Content-Type: application/json' -d '{"senhaAtual":"x","nova":"y-12345678"}'
done

echo
if [ "$FALHAS" -eq 0 ]; then echo "SMOKE OK ($DOMINIO)"; else echo "SMOKE FALHOU: $FALHAS verificação(ões) ($DOMINIO)"; exit 1; fi
