# Roteiro de Troca de Domínio (DNS) da Plataforma Agendz (B3)

Este documento estabelece o passo a passo completo para migrar ou alterar o domínio base do Agendz (por exemplo, de `agendz.io` para um novo domínio como `agendz.com.br` ou similar) sem downtime nem interrupção nas operações das lojas.

---

## 1. Princípios de Arquitetura (Por que é seguro)
- O front do site real resolve a loja a partir do cabeçalho `Host` enviado pelo navegador.
- Os tokens de autenticação ficam armazenados exclusivamente em memória na sessão, sem dependência de cookies amarrados a um domínio específico.
- Lojas com domínio próprio (ex.: `loja.com.br`) possuem registros de DNS próprios e verificação por TXT independente, não sofrendo alteração com a mudança do domínio base.
- Slugs das lojas (`dalforno`, `apex`, etc.) permanecem exatamente os mesmos.

---

## 2. Passo a Passo da Migração

### Passo 2.1 — Configuração na Zona de DNS do Novo Domínio
No registrador ou gerenciador de DNS do novo domínio (ex: Cloudflare, Route53, Registro.br):
1. **Entrada A ou CNAME raiz e curinga para as lojas:**
   - Tipo: `A` (ou `CNAME`)
   - Nome: `*` (ou `*.novodominio.com`)
   - Destino: IP da VPS onde o Caddy e os serviços rodam.
2. **Entrada para o Admin:**
   - Tipo: `A` (ou `CNAME`)
   - Nome: `admin` (ex.: `admin.novodominio.com`)
   - Destino: IP da VPS.
3. **Entrada para a API:**
   - Tipo: `A` (ou `CNAME`)
   - Nome: `api` (ex.: `api.novodominio.com`)
   - Destino: IP da VPS.

### Passo 2.2 — Atualização no Caddy da VPS (`/etc/caddy/Caddyfile` ou compose)
Atualizar a variável de ambiente `DOMINIO` ou o bloco no Caddyfile:
```caddyfile
(comum) {
    encode gzip zstd
}

admin.{$DOMINIO} {
    import comum
    reverse_proxy admin:80
}

api.{$DOMINIO} {
    import comum
    reverse_proxy api:8080
}

*.{$DOMINIO} {
    import comum
    reverse_proxy app:80
}
```
Executar:
```bash
caddy reload
```

### Passo 2.3 — Atualização das Variáveis de Ambiente
1. **No arquivo `.env` da VPS (`/opt/agendz/.env`):**
   ```env
   DOMINIO=novodominio.com
   AGENDZ_DOMINIOS_BASE=novodominio.com,agendz.io,localhost
   VAPID_CONTATO=mailto:suporte@novodominio.com
   ```
   > **Nota:** Manter o domínio antigo temporariamente em `AGENDZ_DOMINIOS_BASE` durante o período de propagação de DNS permite convivência mútua de ambos os domínios.

2. **Nos repositórios GitHub (Settings > Secrets and variables > Actions):**
   - Atualizar a variável `DOMINIO` nos 3 repositórios (`agendz`, `agendz-admin`, `agendz-infra`).

### Passo 2.4 — Redeploy e Verificação
1. Executar os workflows de deploy ou o script de deploy na VPS.
2. Executar a suíte de fumaça:
   ```bash
   DOMINIO=novodominio.com bash deploy/smoke-producao.sh
   ```
3. Testar os endpoints e acesso via navegador no novo endereço.
