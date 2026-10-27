# Deploy do Agendz na VPS (Hostinger, Ubuntu 24.04)

Hoje sobe o **front (protótipo)**; a API Spring e o PostgreSQL entram na F1 (blocos comentados no `docker-compose.yml`).
Cada loja é um subdomínio: `apex.SEUDOMINIO`, `dalforno.SEUDOMINIO`. O endereço escolhe a loja, o tipo e a marca (`docs/F1-lojas-por-dns.md`).

## 1. DNS (hPanel > Domínios > DNS / Zona DNS)
Crie (apague registros A antigos do mesmo nome):
| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | IP da VPS |
| A | `*` | IP da VPS |

Confira depois de alguns minutos: `ping apex.SEUDOMINIO` deve mostrar o IP da VPS.

## 2. Preparar o servidor (uma vez)
No seu computador (Windows: PowerShell; precisa do `ssh` e `scp`, já vêm no Windows 10+):
```
scp preparar-servidor.sh root@IP_DA_VPS:/root/
ssh root@IP_DA_VPS "bash /root/preparar-servidor.sh"
```
O script cria o usuário `agendz`, desliga login por senha e por root (só se achar sua chave SSH), liga firewall (22, 80, 443), fail2ban e instala o Docker.
**Antes de fechar a janela**, teste em outra: `ssh agendz@IP_DA_VPS`.

## 3. Subir o site
1. Gere o front para o seu domínio (eu faço isso aqui e te mando a pasta pronta; ou rode `deploy/montar-site.sh SEUDOMINIO` no projeto).
2. Copie a pasta `deploy/` para o servidor:
```
scp -r deploy/* agendz@IP_DA_VPS:/opt/agendz/
```
3. No servidor:
```
ssh agendz@IP_DA_VPS
cd /opt/agendz
cp .env.example .env && nano .env      # DOMINIO e EMAIL_ACME
docker compose up -d
docker compose logs -f caddy           # espera "certificate obtained" para cada host (Ctrl+C sai)
```
4. Abra `https://apex.SEUDOMINIO` (estética) e `https://dalforno.SEUDOMINIO` (barbearia).

## 4. Loja nova no protótipo
Acrescente o nome no `Caddyfile` (linha dos hosts), rode `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`. Na F1 isso some: o Caddy emite certificado sob demanda e pergunta à API se o host existe.

## 5. Atualizar o site
Gere o novo `index.html`, copie para `/opt/agendz/site/` (`scp deploy/site/index.html agendz@IP:/opt/agendz/site/`). Não precisa reiniciar.

## 6. Backup (decisão: sem o diário pago da Hostinger)
- Grátis da Hostinger: backup semanal + snapshot manual (faça um **antes de cada mudança grande**, em hPanel > VPS > Snapshots).
- F1: `backup/backup-db.sh` (cron às 3h) envia `pg_dump` para R2/B2 com rclone e guarda 30 dias; `backup/restaurar.sh DATA` prova a restauração em banco de teste. **Teste a restauração uma vez antes do primeiro cliente real.**

## Segurança (resumo)
- Nunca publique a porta do PostgreSQL (o Docker ignora o ufw para portas publicadas).
- `.env` só no servidor, fora do GitHub.
- Só o Caddy fala com a internet; a API fica sem `ports:`.
- Este deploy é do **protótipo** (dados de exemplo, estado no navegador): não coloque cliente real até a F1.

## Não validado aqui
O ambiente do Claude não tem Docker nem Caddy: os scripts passaram só em verificação de sintaxe. Na primeira vez, rode passo a passo e me mande qualquer erro.
