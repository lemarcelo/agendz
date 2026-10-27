# Agendz: estado do projeto (resumo para retomar em qualquer conversa)

Atualizado em 2026-10-26. Leia este arquivo primeiro; depois `CLAUDE.md` (regras fixas) e `/home/claude/prompt-agendz-regras.md` (regras de negócio + histórico v1–v72).

## 1. O que é
Agendz: plataforma multi-tenant de agendamento (dono: Marcelo). Cada **loja** tem um **tipo** (definido na criação, nunca muda): `estetica_automotiva` (Apex, cliente real) e `barbearia`. Academia fica adiada. O código é um só; o que muda por tipo está em `src/tipos/<tipo>/` (definição com capacidades, rótulos, frases, visual; seed; mensagens de WhatsApp; tema CSS) e na tabela "O que muda por tipo" de `docs/EQUIVALENCIA-BARBEARIA.md`.

## 2. Stack e estado do código
- **Hoje:** protótipo React 19 + esbuild, API simulada em memória (`src/services/api.js`), domínio puro em `src/domain`. Build único HTML (`node build.mjs` → `dist/agenda.html` = Artifact; `dist/index.html` = testes).
- **Destino (F1+):** Java 21, Spring Boot 3, PostgreSQL 16, Flyway, JWT, Docker Compose + Caddy na VPS.
- **Testes:** `npm run verificar` (estética: 445 unidade + 33 navegador) e `npm run verificar-tudo` (+ suíte da barbearia v64: 381 + 29, `npm run testar:barbearia`). Portão 1 e 2 verdes; **Gate 3 (isolamento entre lojas) bloqueado até a F1**.
- **Ids neutros (v71):** `profissionalId`, `papel: 'profissional'`; "esteticista"/"barbeiro" só como rótulo do tipo.
- **Loja pelo endereço (v70):** `src/domain/tenant.js` (`resolverLoja`: domínio próprio > subdomínio > `/agendar/{slug}` > `?loja=` só demo), `src/services/lojas-demo.js` (lojas `apex` estética, `dalforno` e `offbox` barbearias; offbox = dados fictícios da Dalforno com nome trocado). Endereço desconhecido = "Loja não encontrada". Marca sem logo = ícone do tipo. Detalhe e desenho do backend: `docs/F1-lojas-por-dns.md`.
- **Skills:** 3 conjuntos `agendz-*` (manutenção/entrega, regras/segurança, backend/integrações); cópias em `docs/skills/`.
- **Docs:** `MAPA-API-SPRING.md` (api.js → endpoints), `MAPA-DADOS-PESSOAIS.md` (LGPD), `F0-tipos-de-estabelecimento.md`, `F1-lojas-por-dns.md`, `EQUIVALENCIA-BARBEARIA.md`, `backend-esqueleto/` (testes JUnit não compilados), `barbearia-v64/` (histórico arquivado).
- **Artifact:** `https://claude.ai/artifact/JVXrYoWFyrxi3nAEfo28QQ` (sempre `dist/agenda.html`, sem `icon` na republicação).

## 3. Implantação na VPS (feita em 2026-10-26)
- **Hospedagem:** Hostinger VPS KVM 2 (2 vCPU, 8 GB, 100 GB), contrato de 12 meses, Brasil, Ubuntu 24.04 puro, sem painel nem apps; Monarx (malware) ligado; Gerenciador Docker desligado. **Sem backup diário pago** (decisão): vale o semanal grátis + snapshot manual antes de mudança grande + `pg_dump` diário para fora (F1).
- **IP:** `179.197.84.7`. **Acesso:** `ssh agendz@179.197.84.7` (só chave; senha e root desligados; usuário com sudo e Docker). Chave criada com `ssh-keygen -t ed25519` no PC do Marcelo (Windows, PowerShell).
- **Domínio:** `agendz.io` (grátis por 1 ano na compra; renovação do `.io` costuma ser cara: decidir antes de vencer). DNS no hPanel (TTL 300): A `@`, A `apex`, A `dalforno`, A `offbox` → IP da VPS; CNAME `www` → `agendz.io`. (Sem registro `*`: cada loja nova hoje exige um A + uma linha no Caddyfile; na F1 vira `*` + certificado sob demanda.)
- **Pilha no ar:** Docker Compose em `/opt/agendz` com **Caddy** (HTTPS Let's Encrypt, e-mail da conta) servindo `site/index.html` (build com `AGENDZ_DOMINIO=agendz.io`). Certificados obtidos para `agendz.io`, `www`, `apex`, `dalforno`, `offbox`. URLs: `https://apex.agendz.io` (estética), `https://dalforno.agendz.io`, `https://offbox.agendz.io` (barbearias), `https://agendz.io` (seletor da demo).
- **Arquivos:** `deploy/` (compose, Caddyfile, `.env.example`, `preparar-servidor.sh`, `montar-site.sh`, `backup/backup-db.sh` e `restaurar.sh` para a F1, README). No servidor: `.env` com `DOMINIO` e `EMAIL_ACME` (nunca vai ao GitHub).
- **Atualizar o site hoje (PowerShell):** gerar `bash deploy/montar-site.sh agendz.io` (aqui, comigo), baixar o zip, `scp deploy\site\index.html agendz@179.197.84.7:/opt/agendz/site/` (não precisa reiniciar). Caddyfile novo: copiar e `docker compose restart caddy`.
- **Aviso:** o ar é do **protótipo** (dados de exemplo, estado no navegador). Sem cliente real até a F1.

- **Pasta local do Marcelo:** `C:\git\agendz` (Windows), criada por `git clone` do repositório privado `agendz` (nada de zip). Claude envia para o GitHub; Marcelo traz com `git pull`; não editar lá em paralelo sem avisar.

## 4. Limites deste ambiente (Claude)
- Sem SSH para fora; sem Maven Central nem Docker/Caddy/PostgreSQL locais → o Spring **não compila aqui**. Por isso a F1 usa **GitHub Actions** para compilar e testar (`mvn verify` com PostgreSQL), e eu leio o resultado com `gh`.
- `gh` aqui está com token inválido e **nenhum GitHub está ligado** à conta: precisa ligar em claude.ai (Configurações > Conectores > GitHub) e depois eu anexo o repositório com `add_repo` (acesso de escrita).
- Segredos (chave SSH, tokens, senhas) **nunca no chat**: vão em GitHub Secrets / `.env` no servidor / configuração do conector.

## 5. Decisões já tomadas
Tipo imutável; loja pelo endereço; um código só com pastas por tipo; capacidades (não `if`); regras da barbearia v64 intactas (só ids/texto mudam); preço por porte só na estética; Gate 3 só na F1; sem backup diário pago; Ubuntu puro sem painel; cupom Hostinger usado; domínio `agendz.io`.

## 6. Em aberto
- INPI e registro do nome "Agendz" (o domínio `.io` não resolve isso); custo da renovação do `.io`.
- Sobrenomes/e-mails reais de Davi e Pablo; logo da Apex em alta resolução; horário por dia da semana; dados reais da Offbox (hoje fictícios).
- Domínio próprio de loja só em plano pago? (regra comercial).
- `npm run autoria` com a chave do Marcelo (arquivos novos têm `ref:0000000000`).
- Apagar as skills antigas (`apex-*`, `estetica-automotiva-*`, `barbearia-*`); apagar o Artifact antigo da barbearia só se ele pedir.
- Itens herdados da v64: push real do navegador, WhatsApp real (Meta), trava de horário no banco sob concorrência, mensagem ao cliente quando o dono confirma, estado em memória (vira banco).

## 7. Próximos passos (ordem)
1. **GitHub:** Marcelo liga o GitHub ao Claude, cria o repositório **privado** `agendz` e eu anexo (`add_repo`, escrita). Enviar o projeto (sem `node_modules`, `dist`, `shots`, `.env`, chaves).
2. **CI (GitHub Actions):** front (`npm run verificar-tudo`) e, depois, backend (`mvn verify` + PostgreSQL de serviço). Eu leio os logs com `gh`.
3. **Backend F1 em `backend/`:** esqueleto Spring Boot + Flyway (`tipo_estabelecimento`, `loja`, `loja_dominio`, `loja_id` em tudo) → `LojaFilter` pelo `Host` → JWT com claim `loja` → RLS (`SET LOCAL app.loja_id`) → endpoints um a um a partir de `MAPA-API-SPRING.md` → `GET /api/publico/loja` → front trocando `api.js` por HTTP.
4. **Gate 3:** testes de isolamento por rota (casos a–f de `F1-lojas-por-dns.md`) no CI.
5. **Deploy automático:** imagens da API/front no GHCR; Actions entra na VPS com chave só de deploy (GitHub Secret) e roda `docker compose pull && up -d`; Postgres no compose **sem `ports:`**; certificado sob demanda com `ask` na API; registro `*` no DNS.
6. **Backup:** `pg_dump` diário (cron 3h) para Cloudflare R2/Backblaze B2 com rclone, 30 dias; **testar `restaurar.sh` antes do primeiro cliente real**.
7. **Depois:** dados reais da Apex e da Offbox, WhatsApp (Meta), push, Pix real, academia.


## Repositório e backend (26/10/2026)
- GitHub: `lemarcelo/agendz` (privado, branch `main`); Claude envia, Marcelo faz `git pull` em `C:\git\agendz`. CI em `.github/workflows/ci.yml` (front: `npm test`, build, e2e, suíte da barbearia; `backend`: `mvn verify`; auditoria npm).
- `backend/` (Spring Boot 3.5, Java 21, Flyway, PostgreSQL 16, Testcontainers): `TenantResolver` + `LojaFilter` (loja pelo Host, 404 sem loja), `GET /api/publico/loja`, `GET /interno/dominio-permitido?domain=` (Caddy `ask`), V1 lojas/domínios, V2 `cliente` com RLS, seed só dev/test. **SQL validado em PostgreSQL 16 real; Java não compilado aqui (sem Maven Central): o primeiro `mvn verify` é o do CI.** Falta: JWT com claim `loja` (403 se diferente), Hibernate filter, `SET LOCAL app.loja_id` por transação, endpoints de negócio, Caddy `on_demand_tls`.
- Site na VPS: `deploy/montar-site.sh` copia `dist/index.html` (página completa com viewport). Antes copiava o fragmento do Artifact (sem `<meta viewport>`), e no celular a página ficava minúscula (corrigido em 26/10/2026).
- Pessoas de exemplo por subdomínio (site publicado, build com `AGENDZ_DOMINIO`; `src/services/pessoas-demo.js`): Apex e Offbox = Proprietário + Colaborador 1, 2, 3; Dalforno = só Alan (proprietário). Artifact e builds de teste mantêm Davi/Pablo/Marcelo e Alan/Kiko/Tailuan (as suítes dependem disso). Os dados reais de cada loja entram na F1.
- CI: `TZ=America/Sao_Paulo` no workflow (um teste de crédito dependia do fuso; o runner é UTC). Logs do Actions não são acessíveis daqui (blob bloqueado); anotações e status sim, via `gh api`.
- Backup: conta Cloudflare criada, bucket `agendz-backups` e token de conta (Object Read & Write, só esse bucket) em 27/10/2026. Scripts prontos em `deploy/backup/` (`configurar-r2.sh`, `backup-db.sh`, `restaurar.sh`); falta rodar `configurar-r2.sh` na VPS e ligar o cron quando o PostgreSQL subir. Chaves só na VPS.
- Backup R2 testado na VPS em 27/10/2026 (envio, listagem e exclusão ok; chaves em `/opt/agendz/backup/r2.env`, modo 600). O R2 não aceita `rclone rcat` (501): os scripts enviam de arquivo temporário com `copyto`. A Secret foi exposta no chat; Marcelo decidiu mantê-la (token restrito ao bucket `agendz-backups`). Falta ligar o cron do `backup-db.sh` quando o PostgreSQL subir e testar `restaurar.sh` antes do primeiro cliente real.
- Acesso: SSH só por chave com o usuário `agendz` (atalho `vps1` no PowerShell; WinSCP com `agendz.ppk`). `root` não entra por SSH; senha do root só no Web Console do hPanel. Scripts `.sh` precisam de LF (`.gitattributes` força).

## Onde paramos (27/10/2026, madrugada)
**Pronto e testado (CI verde: front 449 testes + e2e + barbearia 381; backend com PostgreSQL real):**
- Site no ar: apex/dalforno/offbox.agendz.io (nomes por loja, logos, celular ok). Repositório `lemarcelo/agendz` com CI.
- Backend `backend/`: loja pelo Host (404 sem loja, X-Forwarded-Host ignorado), `GET /api/publico/loja`, Caddy `ask`, login (`POST /api/auth/login`, BCrypt, 5 erros/15 min = 429), JWT HS256 com claim `loja` (403 se a loja do token != Host), clientes (`/api/clientes`, 404 para outra loja, 409 telefone repetido), RLS por transação (`LojaJdbc`: `SET LOCAL ROLE agendz_app` + `app.loja_id`), testes do Gate 3 (a), (b), (c), (d), (f) + token adulterado/expirado/alg none/outro segredo. Decisão: JDBC + RLS no lugar do Hibernate filter (uma só porta de acesso, `LojaJdbc`).
- Deploy preparado, **desligado**: job `deploy` do CI (site) pula sem segredos; `deploy-api.yml` (GHCR + VPS) só com `DEPLOY_API=true`; `deploy/docker-compose.api.yml` (PostgreSQL sem porta, API), `deploy/preparar-api.sh`, Caddy com `/api/*` e `/interno/*` bloqueado (ainda não copiado para a VPS).
- Backup no R2 testado (cron do `pg_dump` falta ligar com o PostgreSQL).

**Falta (ordem):**
1. Marcelo: segredos do GitHub (VPS_HOST, VPS_SSH_KEY [chave só de deploy], opcional VPS_KNOWN_HOSTS) e, para a API, variável `DEPLOY_API=true`, pacote `agendz-api` público, `deploy/preparar-api.sh` uma vez na VPS; registro DNS `*`.
2. Claude: demais endpoints (serviços, profissionais, agenda com `validarHorario`/conflitos, cobrança/Pix, WhatsApp) seguindo `docs/MAPA-API-SPRING.md`; trocar a API simulada do front pela real (cliente HTTP com Bearer, tela de login real, bootstrap por `GET /api/publico/loja`, carregar só a pasta do tipo).
3. Gate 3 (e): arquivos por loja (`/dados/lojas/{lojaId}`) quando houver upload.
4. Criação de loja pela plataforma (`POST /plataforma/lojas`, domínio próprio com verificação por DNS).
5. Ligar cron do backup e testar `restaurar.sh`; snapshot antes de mudança grande.
6. Pendências do Marcelo: INPI/registro "Agendz", sobrenomes/e-mails reais (Davi, Pablo), logo da Apex em alta, dados reais da Offbox, `npm run autoria`.
