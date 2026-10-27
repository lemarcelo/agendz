#!/usr/bin/env bash
# Roda NA VPS, como agendz, em /opt/agendz. Cria uma loja de produção com o dono e uma SENHA TEMPORÁRIA FORTE gerada aqui.
# A senha aparece UMA vez, no terminal; não vai para arquivo, log, GitHub nem para o Claude. O dono troca no primeiro login (deve_trocar_senha).
#
# Uso:  bash provisionar-loja.sh <slug> "<Nome da loja>" <tipo> <login> "<Nome do dono>" [--logo-arquivo caminho] [--redefinir]
#   tipo: estetica_automotiva | barbearia
#   Sem --logo-arquivo, usa logos/<slug>.txt (ao lado deste script) se existir.
#   Repetir o comando com o dono já criado não muda nada; --redefinir gera outra senha temporária para ele.
# Exemplo:  bash provisionar-loja.sh dalforno "Barbearia Dalforno" barbearia alan "Alan"
set -euo pipefail
set +x
cd "$(dirname "$0")"

uso() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[ $# -ge 5 ] || uso
SLUG=$1; NOME=$2; TIPO=$3; LOGIN=$4; DONO=$5; shift 5
LOGO_ARQ=""; REDEFINIR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --logo-arquivo) LOGO_ARQ=${2:?falta o caminho}; shift 2 ;;
    --redefinir) REDEFINIR=1; shift ;;
    *) echo "Opção desconhecida: $1"; uso ;;
  esac
done

[[ $SLUG =~ ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$ ]] || { echo "slug inválido (minúsculas, números e hífen)."; exit 2; }
case "$TIPO" in estetica_automotiva|barbearia) ;; *) echo "tipo inválido: use estetica_automotiva ou barbearia."; exit 2 ;; esac
[[ $LOGIN =~ ^[a-z0-9._-]{2,60}$ ]] || { echo "login inválido (2 a 60: minúsculas, números, ponto, hífen, sublinhado)."; exit 2; }
[ -n "$NOME" ] && [ ${#NOME} -le 100 ] || { echo "nome da loja vazio ou grande demais."; exit 2; }
[ -n "$DONO" ] && [ ${#DONO} -le 80 ] || { echo "nome do dono vazio ou grande demais."; exit 2; }

[ -z "$LOGO_ARQ" ] && [ -f "logos/$SLUG.txt" ] && LOGO_ARQ="logos/$SLUG.txt"
LOGO=""
if [ -n "$LOGO_ARQ" ]; then
  LOGO=$(tr -d '\r\n' < "$LOGO_ARQ")
  printf '%s' "$LOGO" | grep -Eq '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' || { echo "logo inválida em $LOGO_ARQ (precisa ser data URL png/jpeg/webp)."; exit 2; }
  [ ${#LOGO} -le 140000 ] || { echo "logo grande demais (máx. 140000 caracteres)."; exit 2; }
fi

compose() { docker compose -f docker-compose.yml -f docker-compose.api.yml "$@"; }
# Valores curtos e públicos entram por -v (o psql põe aspas com :'nome'); senha e logo entram só pela entrada padrão.
psql_loja() { compose exec -T db psql -X -q -U agendz -d agendz -v ON_ERROR_STOP=1 -v slug="$SLUG" -v nome="$NOME" -v tipo="$TIPO" -v login="$LOGIN" -v dono="$DONO" "$@"; }

EXISTE=$(psql_loja -tA <<'SQL'
select count(*) from usuario u join loja l on l.id = u.loja_id where l.slug = :'slug' and u.identificador = :'login';
SQL
)
EXISTE=${EXISTE//[^0-9]/}
if [ "$EXISTE" != "0" ] && [ "$REDEFINIR" = "0" ]; then
  echo "O usuário '$LOGIN' já existe na loja '$SLUG'. Nada foi alterado. (Use --redefinir para gerar outra senha temporária.)"
  exit 0
fi
if [ "$EXISTE" = "0" ] && [ "$REDEFINIR" = "1" ]; then
  echo "O usuário '$LOGIN' não existe na loja '$SLUG': rode sem --redefinir."; exit 1
fi

# 24 caracteres de um alfabeto sem ambiguidades (sem 0 O 1 l I): cerca de 138 bits.
SENHA=$(LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' < /dev/urandom | head -c 24 || true)
[ ${#SENHA} -eq 24 ] || { echo "falha ao gerar a senha."; exit 1; }

if [ "$REDEFINIR" = "1" ]; then
psql_loja <<SQL
\set senha '$SENHA'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE usuario SET senha_hash = crypt(:'senha', gen_salt('bf', 10)), deve_trocar_senha = true, ativo = true
 WHERE identificador = :'login' AND loja_id = (SELECT id FROM loja WHERE slug = :'slug');
SQL
else
psql_loja <<SQL
\set senha '$SENHA'
\set logo '$LOGO'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
BEGIN;
INSERT INTO loja (slug, nome, tipo, logo) VALUES (:'slug', :'nome', :'tipo', nullif(:'logo', '')) ON CONFLICT (slug) DO NOTHING;
INSERT INTO usuario (loja_id, identificador, nome, papel, senha_hash, deve_trocar_senha)
  SELECT id, :'login', :'dono', 'dono', crypt(:'senha', gen_salt('bf', 10)), true FROM loja WHERE slug = :'slug';
INSERT INTO onboarding (loja_id) SELECT id FROM loja WHERE slug = :'slug' ON CONFLICT (loja_id) DO NOTHING;
COMMIT;
SQL
fi

echo
echo "================================================================"
echo " Loja:   $SLUG ($TIPO)"
echo " Login:  $LOGIN"
echo " Senha:  $SENHA"
echo " Esta senha NÃO será mostrada de novo. Entregue ao dono agora;"
echo " ele será obrigado a trocar no primeiro acesso."
echo "================================================================"
unset SENHA LOGO
