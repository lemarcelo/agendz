#!/usr/bin/env bash
# Confere que o gateway resolve apenas as APIs de homologação.
set -euo pipefail
[ "$(docker network inspect agendz-homologacao_default --format '{{.Internal}}')" = true ] || { echo 'Rede de homologação não é interna.' >&2; exit 1; }
for item in api admin-api; do
  container="agendz-homologacao-$item-1"
  alias="agendz-homologacao-$item"
  esperado=$(docker inspect "$container" --format '{{(index .NetworkSettings.Networks "agendz-homologacao_default").IPAddress}}')
  recebido=$(docker exec agendz-homologacao-gateway-1 getent hosts "$alias" | awk 'NR==1 {print $1}')
  [ -n "$esperado" ] && [ "$recebido" = "$esperado" ] || { echo "Falha no isolamento de $item" >&2; exit 1; }
  echo "$item: gateway resolve para a API de homologação correta."
  redes=$(docker inspect "$container" --format '{{range $n, $v := .NetworkSettings.Networks}}{{$n}} {{end}}')
  [ "$redes" = 'agendz-homologacao_default ' ] || { echo "Rede inesperada em $item." >&2; exit 1; }
done
[ "$(docker network inspect agendz-homologacao_saida_push --format '{{range .Containers}}{{.Name}} {{end}}')" = 'agendz-homologacao-push-egress-1 ' ] || { echo 'Rede de saída de push tem membros inesperados.' >&2; exit 1; }
echo 'Somente o proxy de push participa da rede de saída.'
exit 0
