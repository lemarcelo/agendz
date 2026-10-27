#!/usr/bin/env bash
# Roda no CI quando o `mvn verify` falha: transforma os erros do Maven e dos testes em anotações do GitHub (legíveis pela API),
# já que o texto completo do log não é acessível fora do navegador. Uso: tools/anotar-falha-maven.sh backend/mvn.log backend/target
LOG=${1:-backend/mvn.log}; ALVO=${2:-backend/target}
codificar() { sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}'; }
if [ -f "$LOG" ]; then
  msg=$(grep -E '^\[ERROR\]|COMPILATION ERROR|BUILD FAILURE' "$LOG" | head -40 | cut -c1-300 | codificar)
  [ -n "$msg" ] && echo "::error title=Maven (erros do log)::${msg:0:3500}"
fi
for f in "$ALVO"/surefire-reports/*.txt; do
  [ -f "$f" ] || continue
  if grep -qE 'FAILURE|ERROR' "$f"; then
    msg=$(grep -vE '^\s+at (org\.junit|java\.base|org\.springframework\.test|jdk\.internal)' "$f" | head -30 | cut -c1-300 | codificar)
    echo "::error title=Teste: $(basename "$f" .txt)::${msg:0:3500}"
  fi
done
