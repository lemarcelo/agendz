# Checklist do Marcelo (ordem sugerida)

Marque `[x]` e faça `git commit` quando concluir; eu leio este arquivo no começo de cada sessão. Tudo que está aqui só você pode fazer (contas, senhas, decisões). O resto é comigo (`docs/PROMPT-CONTINUACAO.md`).

## 1. Hoje (≈15 min): deploy automático do site
Depois disso, todo push no `main` com testes verdes publica o site sozinho (já está no `ci.yml`).
- [x] **Chave só de deploy** (PowerShell no seu PC):
  ```
  ssh-keygen -t ed25519 -f "$HOME\.ssh\agendz_deploy" -N '""' -C "github-deploy"
  Get-Content "$HOME\.ssh\agendz_deploy.pub" | ssh agendz@179.197.84.7 "cat >> ~/.ssh/authorized_keys"
  ssh -i "$HOME\.ssh\agendz_deploy" -o IdentitiesOnly=yes agendz@179.197.84.7 "echo ok"
  ```
  (se pedir senha da chave, Enter duas vezes; a última linha deve responder `ok`)
- [x] **Impressão digital do servidor:** `ssh-keyscan -t ed25519 179.197.84.7` → copie a linha que **não** começa com `#`.
- [x] **Chave privada para a área de transferência:** `Get-Content "$HOME\.ssh\agendz_deploy" -Raw | Set-Clipboard`
- [x] GitHub > repositório `agendz` > Settings > Secrets and variables > Actions > **New repository secret**:
  - `VPS_HOST` = `179.197.84.7`
  - `VPS_SSH_KEY` = cole a chave privada (com as linhas BEGIN/END)
  - `VPS_KNOWN_HOSTS` = a linha do `ssh-keyscan`
  - (opcional) `AUTORIA_SEGREDO` = conteúdo do `segredo-autoria.txt`, para o site publicado sair com assinatura de autoria
- [x] Actions > último **CI** > *Re-run all jobs* (ou me avise que eu subo um commit). O job `deploy` deve ficar verde e o site atualiza (logo nova da Dalforno aparece em `dalforno.agendz.io`).

## 2. Hoje: decisões que destravam meu trabalho
- [x] **Front na API real** (`docs/F2-front-na-api-real.md`): confirmado em 27/10: Artifact continua simulado e sem rede; site publicado vira real por partes, começando pelo login.
- [ ] Domínio: manter `agendz.io` (grátis só no 1º ano; a renovação do `.io` é cara) ou trocar antes de ter cliente. **Marcelo decide depois de domingo (1/11).**

## 2b. Ligar a produção (necessário para as senhas dos donos)
O deploy da API gera os segredos na VPS e entra no GitHub Packages sozinho. Sobra um passo seu:
- [ ] GitHub > Settings > Secrets and variables > Actions > aba **Variables** > New repository variable: `DEPLOY_API` = `true`. Depois, Actions > último **CI** > *Re-run all jobs*; quando ele terminar, o workflow **Deploy da API** roda sozinho. Me avise se ficar vermelho.
- [ ] Depois que eu entregar o `provisionar-loja.sh` (fila 1): rodar na VPS uma vez para **Kiko, Alan e Davi** e guardar cada senha (aparece uma única vez). Só entregar aos donos **depois que o F2 parte 1 (login real) estiver no ar**.

## 3. Esta semana, em paralelo (têm prazo de terceiros; comece cedo)
- [ ] **WhatsApp (Meta):** criar conta WhatsApp Business Platform, verificar a empresa e separar um número que **não** esteja no WhatsApp comum. A verificação pode levar dias.
- [ ] **Pix/banco:** escolher o provedor (cobrança Pix via API e conciliação). Me diga qual e eu preparo a integração sobre a interface que já existe; enquanto isso uso simulador.
- [ ] **INPI:** registro da marca "Agendz" (Marcelo faz no domingo, 1/11, no fim da tarde).
- [ ] Rotacionar o token do R2 (a secret foi exposta no chat) e atualizar `/opt/agendz/backup/r2.env` na VPS. *(Você decidiu manter; fica aqui como lembrete antes de cliente real.)*

## 4. Antes do primeiro cliente real
- [ ] Dados reais: sobrenome e e-mail do Davi e do Pablo (Apex), logo da Apex em alta resolução, dados reais da Offbox e da Dalforno.
- [ ] **Ligar a API na VPS** (uma vez; só vale a pena quando o F2 estiver andando):
  - GitHub > Settings > Variables > `DEPLOY_API` = `true`
  - GitHub > Packages > `agendz-api` > deixar **público** (depois do primeiro build)
  - VPS: `cd /opt/agendz && bash deploy/preparar-api.sh` (gera senha do banco e segredo do JWT sozinho)
  - Depois disso cada push publica a API também (o banco migra sozinho ao subir).
- [ ] **Backup:** ligar o cron do `backup-db.sh` (3h) e rodar `restaurar.sh` uma vez para provar que restaura. Fazer **snapshot** no hPanel antes da primeira entrada de cliente real.
- [ ] Quando houver cliente real: no GitHub, criar o ambiente `producao` com aprovação sua para o deploy da API (deploy do site pode seguir automático).
- [ ] `npm run autoria` com a chave (no seu PC) e apagar as skills antigas.

## Parado de propósito
- Academia (tipo adiado). Domínio próprio pago por loja (decidir quando houver o 1º pedido).
