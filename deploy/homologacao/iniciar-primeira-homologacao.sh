#!/usr/bin/env bash
# Inicia uma primeira instalação privada. Não altera o Caddy público nem a produção.
set -euo pipefail
umask 077
raiz=/opt/agendz/homologacao

if [ "$#" -ne 2 ] || [[ ! "$1" =~ ^[0-9a-f]{40}$ ]] || [[ ! "$2" =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Uso: bash iniciar-primeira-homologacao.sh <commit-agendz> <commit-admin>' >&2
  exit 2
fi
agendz="$raiz/candidatos/agendz/$1"
admin="$raiz/candidatos/admin/$2"
ambiente="$raiz/ambiente"
[ -f "$agendz/pronto" ] && [ -f "$admin/pronto" ] || { echo 'Candidatos incompletos.' >&2; exit 1; }
for candidato in "$agendz" "$admin"; do
  [ -f "$candidato/image-id" ] && [ -f "$candidato/migracoes.sha256" ] || { echo 'Identificação do candidato incompleta.' >&2; exit 1; }
  grep -Eq '^sha256:[0-9a-f]{64}$' "$candidato/image-id" && grep -Eq '^[0-9a-f]{64}$' "$candidato/migracoes.sha256" || { echo 'Identificação do candidato inválida.' >&2; exit 1; }
done
[ ! -e "$ambiente" ] || { echo 'O ambiente já existe; nenhuma alteração foi feita.' >&2; exit 1; }
for volume in agendz-homologacao_db_homologacao agendz-homologacao_admin_db_homologacao; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then echo "Volume existente: $volume; revise antes de continuar." >&2; exit 1; fi
done
if [ -n "$(docker ps -aq --filter label=com.docker.compose.project=agendz-homologacao)" ]; then
  echo 'Já existem contêineres deste ambiente; revise antes de continuar.' >&2
  exit 1
fi
imagem_agendz="agendz-homologacao-api:$1"
imagem_admin="agendz-homologacao-admin:$2"
docker image inspect "$imagem_agendz" "$imagem_admin" >/dev/null
[ "$(docker image inspect "$imagem_agendz" --format '{{.Id}}')" = "$(cat "$agendz/image-id")" ] || { echo 'Imagem do Agendz divergente.' >&2; exit 1; }
[ "$(docker image inspect "$imagem_admin" --format '{{.Id}}')" = "$(cat "$admin/image-id")" ] || { echo 'Imagem do painel divergente.' >&2; exit 1; }
for arquivo in compose.yml Caddyfile preparar-homologacao.sh; do
  [ -f "$agendz/deploy/homologacao/$arquivo" ] || { echo "Arquivo ausente: $arquivo" >&2; exit 1; }
done
for arquivo in index-real.html sw.js manifest.webmanifest icone.svg; do
  [ -f "$agendz/$arquivo" ] || { echo "Arquivo do site ausente: $arquivo" >&2; exit 1; }
done
mkdir -m 700 "$ambiente"
cd "$ambiente"
install -m 600 "$agendz/deploy/homologacao/compose.yml" compose.yml
install -m 600 "$agendz/deploy/homologacao/Caddyfile" Caddyfile
install -m 700 "$agendz/deploy/homologacao/preparar-homologacao.sh" preparar-homologacao.sh
install -m 600 "$agendz/migracoes.sha256" migracoes-agendz.sha256
install -m 600 "$admin/migracoes.sha256" migracoes-admin.sha256
mkdir -m 755 site
install -m 644 "$agendz/index-real.html" site/index.html
for arquivo in sw.js manifest.webmanifest icone.svg; do install -m 644 "$agendz/$arquivo" "site/$arquivo"; done
bash preparar-homologacao.sh "$imagem_agendz" "$imagem_admin"
docker compose -p agendz-homologacao config --quiet
docker compose -p agendz-homologacao up -d
echo 'Ambiente privado iniciado. Ainda não há encaminhamento público nem lojas cadastradas.'
