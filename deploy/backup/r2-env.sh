# Carregado pelos outros scripts: lê /opt/agendz/backup/r2.env (chaves do Cloudflare R2, só na VPS, modo 600) e define o remote `r2` do rclone por variáveis
# (sem `rclone config` interativo). Não coloque chaves no GitHub nem no chat.
ARQ_ENV="${ARQ_ENV:-/opt/agendz/backup/r2.env}"
[ -r "$ARQ_ENV" ] || { echo "Falta $ARQ_ENV: rode backup/configurar-r2.sh primeiro." >&2; exit 1; }
set -a; . "$ARQ_ENV"; set +a
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true   # o token vale só para o bucket: não tenta criá-lo
