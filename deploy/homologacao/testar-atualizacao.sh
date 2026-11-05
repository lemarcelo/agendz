set -euo pipefail
origem=$(cd "$(dirname "$0")" && pwd)
base=$(mktemp -d /tmp/agendz-atualizacao-test.XXXXXXXX)
case "$base" in /tmp/agendz-atualizacao-test.*) ;; *) echo 'Diretório temporário inválido.' >&2; exit 1;; esac
trap 'rm -rf -- "$base"' EXIT
cp "$origem/atualizar-ambiente-homologacao.sh" "$base/"
raiz="$base/simulacao"
old=0123456789012345678901234567890123456789
new=1234567890123456789012345678901234567890
mkdir -p "$base/bin" "$raiz/ambiente/site" "$raiz/candidatos/agendz/$new/deploy/homologacao" "$raiz/candidatos/admin/$new"
printf 'H_AGENDZ_IMAGE=agendz-homologacao-api:%s\nH_ADMIN_IMAGE=agendz-homologacao-admin:%s\nSEGREDO=valor-ficticio\n' "$old" "$old" > "$raiz/ambiente/.env"
printf 'compose' > "$raiz/ambiente/compose.yml"
printf 'caddy' > "$raiz/ambiente/Caddyfile"
cp "$raiz/ambiente/compose.yml" "$raiz/candidatos/agendz/$new/deploy/homologacao/compose.yml"
cp "$raiz/ambiente/Caddyfile" "$raiz/candidatos/agendz/$new/deploy/homologacao/Caddyfile"
printf '#!/usr/bin/env bash\nexit 0\n' > "$raiz/ambiente/verificar-isolamento.sh"
for f in index.html sw.js manifest.webmanifest icone.svg; do printf 'anterior' > "$raiz/ambiente/site/$f"; done
printf 'faixa-homologacao nova' > "$raiz/candidatos/agendz/$new/index-real.html"
for f in sw.js manifest.webmanifest icone.svg; do printf 'novo' > "$raiz/candidatos/agendz/$new/$f"; done
for tipo in agendz admin; do
  touch "$raiz/candidatos/$tipo/$new/pronto"
  printf 'sha256:%064d\n' 0 > "$raiz/candidatos/$tipo/$new/image-id"
done
cat > "$base/bin/docker" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = image ] && [ "$2" = inspect ]; then
  case " $* " in *' --format '*) printf 'sha256:%064d\n' 0;; esac
  exit 0
fi
if [ "$1" = compose ]; then
  if [[ " $* " == *' up '* ]] && [ "${TESTE_FALHAR_SEMPRE:-0}" = 1 ]; then exit 1; fi
  if [[ " $* " == *' up '* ]] && [ -n "${TESTE_FALHAR_UMA_VEZ:-}" ] && [ ! -f "$TESTE_FALHAR_UMA_VEZ" ]; then touch "$TESTE_FALHAR_UMA_VEZ"; exit 1; fi
  exit 0
fi
if [ "$1" = exec ]; then
  case "$*" in
    *h-barbearia*) printf '{"slug":"h-barbearia","emHomologacao":true}\n' ;;
    *) printf '{"slug":"h-estetica","emHomologacao":true}\n' ;;
  esac
  exit 0
fi
echo 'Docker fictício recebeu comando inesperado.' >&2; exit 1
EOF
chmod 700 "$base/bin/docker"
cat > "$base/bin/install" <<'EOF'
#!/usr/bin/env bash
if [[ " $* " == *'/index-real.html '* ]] && [ -n "${TESTE_FALHAR_INSTALL:-}" ] && [ ! -f "$TESTE_FALHAR_INSTALL" ]; then touch "$TESTE_FALHAR_INSTALL"; exit 1; fi
exec /usr/bin/install "$@"
EOF
chmod 700 "$base/bin/install"
export PATH="$base/bin:$PATH"
[ "$(command -v docker)" = "$base/bin/docker" ] || { echo 'Docker fictício indisponível.' >&2; exit 1; }
sed "s|^raiz=/opt/agendz/homologacao$|raiz=$raiz|" "$base/atualizar-ambiente-homologacao.sh" > "$base/atualizar-teste.sh"
bash "$base/atualizar-teste.sh" agendz "$new"
grep -q "^H_AGENDZ_IMAGE=agendz-homologacao-api:$new$" "$raiz/ambiente/.env"
grep -q '^SEGREDO=valor-ficticio$' "$raiz/ambiente/.env"
grep -q 'faixa-homologacao nova' "$raiz/ambiente/site/index.html"
antes=$(sha256sum "$raiz/ambiente/.env" | cut -d ' ' -f 1)
if TESTE_FALHAR_UMA_VEZ="$base/falhou" bash "$base/atualizar-teste.sh" admin "$new" >/dev/null 2>&1; then
  echo 'A falha simulada deveria interromper a atualização.' >&2; exit 1
fi
depois=$(sha256sum "$raiz/ambiente/.env" | cut -d ' ' -f 1)
test "$antes" = "$depois"
new2=2345678901234567890123456789012345678901
cp -a "$raiz/candidatos/agendz/$new" "$raiz/candidatos/agendz/$new2"
printf 'outro-service-worker' > "$raiz/candidatos/agendz/$new2/sw.js"
site_antes=$(sha256sum "$raiz/ambiente/site/index.html" | cut -d ' ' -f 1)
sw_antes=$(sha256sum "$raiz/ambiente/site/sw.js" | cut -d ' ' -f 1)
if TESTE_FALHAR_INSTALL="$base/falhou-site" bash "$base/atualizar-teste.sh" agendz "$new2" >/dev/null 2>&1; then
  echo 'A falha no site deveria interromper a atualização.' >&2; exit 1
fi
test "$antes" = "$(sha256sum "$raiz/ambiente/.env" | cut -d ' ' -f 1)"
test "$site_antes" = "$(sha256sum "$raiz/ambiente/site/index.html" | cut -d ' ' -f 1)"
test "$sw_antes" = "$(sha256sum "$raiz/ambiente/site/sw.js" | cut -d ' ' -f 1)"
if TESTE_FALHAR_SEMPRE=1 bash "$base/atualizar-teste.sh" admin "$new" >/dev/null 2>&1; then
  echo 'A falha persistente deveria interromper a atualização.' >&2; exit 1
fi
test -n "$(find "$raiz" -maxdepth 1 -type d -name '.atualizacao.*' -print -quit)"
echo 'Atualização isolada e restauração após falha verificadas.'
