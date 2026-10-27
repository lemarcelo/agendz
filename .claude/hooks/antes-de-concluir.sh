#!/usr/bin/env bash
# Gancho "Stop" do Claude Code: antes de encerrar o trabalho, roda os testes de unidade e estáticos (cerca de 3 s).
# Se falharem, bloqueia o encerramento e devolve o resultado para o Claude corrigir.
entrada="$(cat)"
# Evita laço: se o Claude já foi reaberto por este gancho nesta rodada, deixa terminar.
if echo "$entrada" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then exit 0; fi
cd "$(dirname "$0")/../.." || exit 0
[ -d node_modules ] || exit 0           # sem dependências instaladas, não há o que rodar
[ -f package.json ] || exit 0
saida="$(npm test --silent 2>&1)"
if [ $? -ne 0 ]; then
  {
    echo "Os testes falharam. Corrija antes de concluir (veja as regras em CLAUDE.md)."
    echo "$saida" | grep -E "^not ok|# (tests|pass|fail)|error:|expected|actual" | head -30
  } >&2
  exit 2
fi
exit 0
