#!/usr/bin/env bash
# Atualiza um serviço de homologação usando candidatos já aprovados pelo CI.
set -Eeuo pipefail
umask 077
raiz=/opt/agendz/homologacao
if [ "$#" -ne 2 ] || [[ ! "$2" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Uso: bash atualizar-ambiente-homologacao.sh <agendz|admin> <commit>' >&2; exit 2
fi
case "$1" in
  agendz) servico=api; chave=H_AGENDZ_IMAGE; imagem="agendz-homologacao-api:$2" ;;
  admin) servico=admin-api; chave=H_ADMIN_IMAGE; imagem="agendz-homologacao-admin:$2" ;;
  *) echo 'Serviço inválido.' >&2; exit 2 ;;
esac
ambiente="$raiz/ambiente"
candidato="$raiz/candidatos/$1/$2"
[ -d "$ambiente" ] && [ -f "$ambiente/.env" ] && [ -f "$candidato/pronto" ] && [ -f "$candidato/image-id" ] || { echo 'Ambiente ou candidato incompleto.' >&2; exit 1; }
exec 9>"$raiz/atualizacao.lock"
flock -w 180 9 || { echo 'Outra atualização está em andamento.' >&2; exit 1; }
cd "$ambiente"
[ "$(pwd -P)" = "$raiz/ambiente" ] || { echo 'Diretório de homologação inválido.' >&2; exit 1; }
[ -f "migracoes-$1.sha256" ] && [ -f "$candidato/migracoes.sha256" ] || { echo 'Identificação das migrações ausente; revisão necessária.' >&2; exit 1; }
grep -Eq '^[0-9a-f]{64}$' "migracoes-$1.sha256" && grep -Eq '^[0-9a-f]{64}$' "$candidato/migracoes.sha256" || { echo 'Identificação das migrações inválida.' >&2; exit 1; }
cmp -s "migracoes-$1.sha256" "$candidato/migracoes.sha256" || { echo 'Há migrações novas; atualização automática bloqueada para revisão e backup.' >&2; exit 1; }
docker image inspect "$imagem" >/dev/null
esperado=$(cat "$candidato/image-id")
[[ "$esperado" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'Identificador de imagem inválido.' >&2; exit 1; }
[ "$(docker image inspect "$imagem" --format '{{.Id}}')" = "$esperado" ] || { echo 'A imagem não corresponde ao candidato.' >&2; exit 1; }
bash verificar-isolamento.sh
if [ "$1" = agendz ]; then
  cmp -s compose.yml "$candidato/deploy/homologacao/compose.yml" && cmp -s Caddyfile "$candidato/deploy/homologacao/Caddyfile" || { echo 'A configuração de infraestrutura mudou; revisão necessária antes da atualização.' >&2; exit 1; }
  for f in index-real.html sw.js manifest.webmanifest icone.svg; do [ -s "$candidato/$f" ] || { echo "Arquivo ausente: $f" >&2; exit 1; }; done
  grep -q 'faixa-homologacao' "$candidato/index-real.html" || { echo 'Identificação de homologação ausente.' >&2; exit 1; }
  [ -d site ] && [ ! -L site ] || { echo 'Diretório do site inválido.' >&2; exit 1; }
fi
[ "$(grep -c "^$chave=" .env)" = 1 ] || { echo 'Configuração de imagem inválida.' >&2; exit 1; }
atual=$(grep "^$chave=" .env | cut -d= -f2-)
case "$chave:$atual" in
  H_AGENDZ_IMAGE:agendz-homologacao-api:*) [[ "$atual" =~ ^agendz-homologacao-api:[0-9a-f]{40}$ ]] ;;
  H_ADMIN_IMAGE:agendz-homologacao-admin:*) [[ "$atual" =~ ^agendz-homologacao-admin:[0-9a-f]{40}$ ]] ;;
  *) echo 'A imagem atual não é exclusiva da homologação.' >&2; exit 1 ;;
esac
backup=$(mktemp -d "$raiz/.atualizacao.XXXXXXXX")
temporarios=()
preservar_backup=0
limpar() {
  for arquivo in "${temporarios[@]}"; do rm -f -- "$arquivo"; done
  if [ "$preservar_backup" = 1 ]; then echo "Cópia de recuperação preservada em $backup" >&2; return; fi
  rm -f "$backup/env" "$backup/env-novo" "$backup/index.html" "$backup/sw.js" "$backup/manifest.webmanifest" "$backup/icone.svg"
  rmdir "$backup" 2>/dev/null || true
}
trap limpar EXIT
cp -p .env "$backup/env"
if [ "$1" = agendz ]; then
  for f in index.html sw.js manifest.webmanifest icone.svg; do [ -f "site/$f" ] || { echo "Arquivo atual ausente: $f" >&2; exit 1; }; cp -p "site/$f" "$backup/$f"; done
fi
alterado=0
reverter() {
  if [ "$alterado" = 1 ]; then
    set +e
    falhou=0
    cp -p "$backup/env" .env || falhou=1
    if [ "$1" = agendz ]; then for f in index.html sw.js manifest.webmanifest icone.svg; do cp -p "$backup/$f" "site/$f" || falhou=1; done; fi
    docker compose -p agendz-homologacao up -d --no-deps "$servico" >/dev/null 2>&1 || falhou=1
    if [ "$falhou" = 0 ]; then
      echo 'Atualização falhou; configuração anterior restaurada. Confira os serviços de homologação.' >&2
    else
      preservar_backup=1
      echo 'Atualização falhou e a restauração ficou incompleta; intervenção necessária.' >&2
    fi
  fi
}
trap 'codigo=$?; trap - ERR; reverter "$1"; exit "$codigo"' ERR
CHAVE="$chave" IMAGEM="$imagem" awk 'BEGIN { n=0 } index($0, ENVIRON["CHAVE"] "=")==1 { print ENVIRON["CHAVE"] "=" ENVIRON["IMAGEM"]; n++; next } {print} END {if (n != 1) exit 1}' .env > "$backup/env-novo"
chmod 600 "$backup/env-novo"
mv -f "$backup/env-novo" .env
alterado=1
docker compose -p agendz-homologacao config --quiet
docker compose -p agendz-homologacao up -d --no-deps "$servico"
disponivel=0
for tentativa in $(seq 1 40); do
  if [ "$1" = agendz ]; then
    estetica=$(docker exec agendz-homologacao-gateway-1 wget -qO- --header='Host: h-estetica.agendz.io' http://127.0.0.1/api/publico/loja 2>/dev/null || true)
    barbearia=$(docker exec agendz-homologacao-gateway-1 wget -qO- --header='Host: h-barbearia.agendz.io' http://127.0.0.1/api/publico/loja 2>/dev/null || true)
    if [[ "$estetica" == *'"slug":"h-estetica"'*'"emHomologacao":true'* ]] && [[ "$barbearia" == *'"slug":"h-barbearia"'*'"emHomologacao":true'* ]]; then disponivel=1; break; fi
  else
    if docker exec agendz-homologacao-gateway-1 wget -qO /dev/null --header='Host: h-admin.agendz.io' http://127.0.0.1/ 2>/dev/null; then disponivel=1; break; fi
  fi
  sleep 3
done
[ "$disponivel" = 1 ] || { echo 'Serviço de homologação não respondeu.' >&2; false; }
bash verificar-isolamento.sh
if [ "$1" = agendz ]; then
  for f in sw.js manifest.webmanifest icone.svg; do
    temp=$(mktemp site/.novo.XXXXXXXX); temporarios+=("$temp")
    install -m 644 "$candidato/$f" "$temp"; mv -f "$temp" "site/$f"
  done
  temp=$(mktemp site/.novo.XXXXXXXX); temporarios+=("$temp")
  install -m 644 "$candidato/index-real.html" "$temp"
  mv -f "$temp" site/index.html
fi
trap - ERR
echo "Homologação atualizada: $1 $2"
