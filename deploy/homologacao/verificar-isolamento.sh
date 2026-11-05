#!/usr/bin/env bash
# Confere que o gateway resolve apenas as APIs de homologação.
set -euo pipefail
for item in api admin-api; do
  container="agendz-homologacao-$item-1"
  alias="agendz-homologacao-$item"
  esperado=$(docker inspect "$container" --format '{{(index .NetworkSettings.Networks "agendz-homologacao_default").IPAddress}}')
  recebido=$(docker exec agendz-homologacao-gateway-1 getent hosts "$alias" | awk 'NR==1 {print $1}')
  [ -n "$esperado" ] && [ "$recebido" = "$esperado" ] || { echo "Falha no isolamento de $item" >&2; exit 1; }
  echo "$item: gateway resolve para a API de homologação correta."
done
exit 0
