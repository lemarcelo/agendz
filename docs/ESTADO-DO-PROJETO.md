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
2. Claude: demais endpoints (**feitos em 27/10: serviços, profissionais e agenda núcleo** — conflito por profissional, encaixe, intervalo, remarcar, status; faltam escala/expediente, box, vários dias, porte do veículo, mensagens/plano, cupom, estoque, comissão, cobrança/Pix, WhatsApp) seguindo `docs/MAPA-API-SPRING.md`; trocar a API simulada do front pela real (cliente HTTP com Bearer, tela de login real, bootstrap por `GET /api/publico/loja`, carregar só a pasta do tipo).
3. Gate 3 (e): arquivos por loja (`/dados/lojas/{lojaId}`) quando houver upload.
4. Criação de loja pela plataforma (`POST /plataforma/lojas`, domínio próprio com verificação por DNS).
5. Ligar cron do backup e testar `restaurar.sh`; snapshot antes de mudança grande.
6. Pendências do Marcelo: INPI/registro "Agendz", sobrenomes/e-mails reais (Davi, Pablo), logo da Apex em alta, dados reais da Offbox, `npm run autoria`.

## F2 por partes (27/10/2026, noite)
- Decisão do Marcelo: migrar o site real por partes (clientes → serviços → equipe → agenda). **Parte 2 (clientes) pronta, CI e deploy verdes (v81):** servidor com cifra de CPF/telefone/nascimento, busca, edição e veículos; tela `src/ui/real/Clientes.jsx`; casos compartilhados simulada × real. **Parte 3 (serviços) pronta no código (v82):** servidor com código, preço/duração por porte, combo, vários dias, intervalo, antecedência, comissão e desativar-ou-apagar; tela `src/ui/real/Servicos.jsx`; 36 casos compartilhados; `tests/e2e40.mjs`. **Parte 4 (equipe) pronta no código (v83):** quatro perfis e permissão por seção no servidor, cadastro cifrado, senha temporária gerada no servidor, tela `src/ui/real/Equipe.jsx`, 21 casos compartilhados, `tests/e2e41.mjs`. Próxima: parte 5 (agenda). Detalhes em `docs/F2-front-na-api-real.md`.
- A VPS gera `CIFRA_CHAVE` e `CIFRA_PEPPER` sozinha no deploy: o Marcelo precisa guardar uma cópia fora da VPS (ver `docs/PENDENTE-MARCELO.md`).
- **Próxima: parte 3, serviços** (CRUD já existe no servidor; falta tela, código por tipo, preço por porte, combo, vários dias e a equivalência). Depois equipe e agenda. As senhas dos donos só vão com a agenda real.
- 28/10 (v84): decisões do Marcelo aplicadas no simulador (remarcar concluído/cancelado, lançamento atrasado com motivo e comissão para o próximo pagamento, comissão cancelável); servidor tem a 5a (V13, histórico, automação por minuto). Pendente: portar v84 ao servidor (5d), telas reais da agenda (5b), Atender real (5c); senhas dos donos só depois.

- **28/10 (v87):** painel Admin no ar em `admin.agendz.io` com login real (repositório `agendz-admin`); o Caddy de `admin.<domínio>` repassa tudo à Admin API. Site real e Admin: sem internet a ação espera e segue ao voltar a conexão (`tests/e2e45.mjs`, `tests/api-real-offline.test.mjs`).

- **28/10 (v88):** agenda no site real (Horários, Calendário, status, remarcar, cancelar). Falta o Atender real (5c) para liberar os logins dos donos; depois produtos/comissão (5d) e link do cliente/WhatsApp/Pix (5e).

- **28/10 (v89):** Atender no site real para barbearia (agora, passado com motivo e futuro; cliente por telefone). Donos da barbearia (Alan, Kiko) já podem receber o login; Davi só depois de veículo/porte/box. Falta: produtos, pagamento e comissão (5d); link do cliente, WhatsApp e Pix (5e).

- **28/10 (v90):** chave de repetição (`Idempotency-Key`) no Atender e no agendamento: resposta perdida com internet ligada não duplica nada. Próxima: 5d.
- **28/10 (v92):** comissão em três níveis (serviço > funcionário > geral da loja) nos dois lados; servidor com produtos, comissão geral e reconfiguração com Desfazer (V17, V18); o assistente de início ganhou Produtos, Comissão e percentual por pessoa. Falta a 5d-4 (Atender real com produtos, pagamento e comissão congelada), depois 5e.
- **28/10 (v93):** 5d-4a no código (CI valida o servidor): produtos no Atender real (serviço + produto ou só produto), vendedor, baixa de estoque ao concluir com estorno e histórico de movimentos (V19). Falta 5d-4b (comissão congelada e relatório) e 5d-4c (forma de pagamento).
- **28/10 (v94):** 5d-4b: comissão congelada por serviço, relatório do dono, "Meus ganhos", pagar (registro), cancelar/restaurar e lançamento atrasado no servidor (V20, no ar) e telas Comissões/Meus ganhos no site real. Falta 5d-4c (pagamento do atendimento, campos obrigatórios, cupom).
- **28/10 (v95):** 5d-4c-1: forma de pagamento do atendimento feito (Pix/Dinheiro/Cartão, padrão da loja) e campos obrigatórios configuráveis do Atender (V21, `GET/PUT /api/estabelecimento/regras-atendimento`); cartão "Regras do atendimento" no Início do dono. Só registra a forma. Falta 5d-4c-2 (cupom).
- **28/10 (v96):** 5d-4c-2: cupom e vale no site real (V22, `/api/cupons`, aplicar/retirar no horário, `cupomChave` no Atender futuro; chave só do servidor; 5 erradas = 15 min; comissão sobre o valor com desconto). Menu Cupons, campo no Atender e ficha com desconto. A 5d está concluída; próxima: 5e.
- **28/10 (v97):** 5e-1: link do cliente no site real (V23; `GET/POST /api/publico/*` sem login; página `#agendar`; cartão do link no Início do dono). Pedido entra "a confirmar"; token por horário; cancelar com 24 h ou mais; cupom no pedido. Estética fora do ar no link. Faltam 5e-2/5e-3 (remarcar, código por telefone, lembretes, WhatsApp, Pix) e a estética.
- **28/10 (v98):** 5e-2: remarcar pelo link (24 h ou mais, mesmo profissional, volta a "a confirmar") e avisos do painel (V24: pedido, remarcou, cancelou). Falta a 5e-3 (código por telefone, lembretes, WhatsApp, Pix) e a estética.
- **28/10 (v99):** site real abre na Agenda (não no Início); primeiro acesso do dono (senha temporária → usuário e senha → assistente) conferido e coberto por teste no servidor.

- v100: primeiro acesso: a tela de entrada pede usuário + senha enviada e a redefinição pede só usuário novo + senha definitiva (a enviada fica em memória, `senhaEnviada`), depois entra sozinho no assistente (dono) ou na Agenda. **WhatsApp/Pix não serão configurados agora**: no futuro serão por cliente, via Admin, com as chaves da Meta de cada loja; 5e-3 adiado. Testes: `tests/e2e36.mjs`, `tests/e2e37.mjs`.
- **29/10 (v101):** nome `suporte` reservado ("Nome reservado.") e usuário `suporte` criado pelo Admin por rota interna com chave (`INTERNO_CHAVE`); escondido da equipe da loja. Estética no servidor escrita (V25, boxes, veículo, blocos), aguardando o CI; falta o front real da estética e o link do cliente. Veja o prompt v101.
- **29/10 (v102):** comissão por pessoa na Equipe do assistente (serviços e produtos; V26), estética no site real (Atender, Boxes). Dúvida: comissão geral sem tela. Em verificação/CI.
- **29/10 (v103):** aviso de agendamento novo no site real (faixa no topo, 3 bipes sutis, vibração, cartão pulsando, tocar na faixa abre o cartão) e **Meu perfil** (toque na foto/nome: dados próprios, foto, senha e escolhas de som/faixa/vibração no aparelho). Endereço e localização da loja, horários guardados no navegador do cliente. Planos de serviço seguem no backlog (B0): o Marcelo mandou parar antes deles.
- **29/10 (v104):** link de agendamento do Artifact: a loja do link (`#agendar@loja`) decide desde o carregamento e a base do link tem reserva fora de http(s). O erro "loja errada" não foi reproduzido em 3 lojas × usuários × loja salva; se voltar, o Marcelo precisa mandar o link que saiu errado. Próximo: Apex (link público da estética), Admin, Planos.
- **29/10 (v105):** link do cliente da estética (Apex) no site real: etapa Veículo (placa, modelo, porte) antes do serviço, preço/duração por porte, horário só com profissional e box livres (servidor `LinkPublicoService`, adaptador `publico.*` com `porte`/`veiculo`, `ui/real/AgendarPublico.jsx`); botão Link na Agenda da estética. Java ainda não compilado: depende do CI. Falta: auditoria visual da Apex (dono e profissional), Admin, Planos.

## 29/10 (manhã)
- Relatórios, Estoque e atualização automática da agenda/avisos no site real; cartão da agenda com data em negrito e hora grande; planos de serviço anotados (backlog B0). Falta: Estabelecimento real (endereço e localização, comissão geral, expediente, regras e link num lugar só), Financeiro, Admin A3 a A5, visual (#61).
