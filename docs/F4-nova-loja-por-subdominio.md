# F4: loja nova só com um subdomínio

## Como fica (pronto na infraestrutura)
1. **DNS:** o registro curinga `*.agendz.io` já aponta para a VPS (**confirmado pelo Marcelo em 31/10**). Nada a fazer por loja.
2. **Certificado:** o Caddy emite sob demanda na primeira visita, **só se** a API responder 200 em `/interno/dominio-permitido?domain=` (loja existe ou domínio próprio verificado). Nome desconhecido não gasta o limite do Let's Encrypt (50 certificados/semana por domínio).
3. **Banco:** um comando na VPS cria a loja, o dono e a senha temporária forte (mostrada uma vez) e confere o endereço:
   `bash nova-loja.sh barbearia-x "Barbearia X" barbearia joao "João"`
4. **Primeiro acesso:** o dono entra, troca a senha e cai no modo de inicialização (F3: escolher serviços de exemplo do tipo e cadastrar a equipe de forma simples).

## Cliente novo pelo Admin (botão "Novo cliente"), de ponta a ponta
`Admin (Clientes.jsx)` → `POST /api/clientes` (só administrador, motivo) → `AgendzInterno` → `POST /interno/plataforma/lojas` (chave `X-Interno-Chave`) → `PlataformaService.criar`: valida slug (minúsculas/números/hífen, 1 a 40, sem hífen nas pontas, reservados), tipo, dono e logo; grava `loja`, dono (`deve_trocar_senha`) e `onboarding` numa transação; cria o `suporte`; devolve as duas senhas **uma vez**. Depois: DNS curinga `*.agendz.io` → VPS; Caddy (`https://` com `on_demand`) pergunta `GET /interno/dominio-permitido` (200 só se a loja existe); a primeira visita emite o certificado; `GET /api/publico/loja` resolve pelo Host; o dono entra com a temporária (token só troca a senha), escolhe usuário + senha, cai no assistente (serviços do catálogo do tipo, produtos, equipe, expediente) e depois na Agenda. Status `suspenso`/`encerrado` = 402; reativar volta.

Pontos frágeis conferidos (v118):
- **Linhas que outras telas assumem** (`configuracao_loja`, escala, regras da plataforma, link, comissão, marca): nenhuma é criada; todas as leituras tratam "sem linha" como padrão de fábrica e gravam por upsert. Coberto em `NovaLojaPontaAPontaTest` (GET de cada uma numa loja recém-criada).
- **Regras do Admin no assistente (corrigido):** `/api/onboarding/equipe` inseria pessoas direto, sem `limiteUsuarios`, e `concluir` criava um box por profissional sem `limiteAgendas`. Agora chamam `RegrasDaLoja` (409 com o motivo; boxes limitados ao que cabe, mínimo 1).
- **Slug:** Admin, backend e `nova-loja.sh` usam a mesma regex e a mesma lista de reservados (`TenantResolver.RESERVADOS`); maiúsculas viram minúsculas; repetido = 409. `www.` e `admin.` têm bloco próprio no Caddy, por isso são reservados.
- **Dono igual em duas lojas** é permitido (login único por loja); a senha de uma não abre a outra.
- **Front:** só o site **real** (`SITE_REAL=true` no CI) lê a loja pela API; o site de demonstração só conhece `lojas-demo.js` e mostraria "Loja não encontrada" para loja nova. Endereço desconhecido nunca vira loja padrão (404 na API e na tela).
- **Admin (corrigido):** depois de criar, a tela mostra o endereço `https://<slug>.agendz.io` como link e botão de copiar, com o aviso do certificado na primeira visita (`nc-endereco`); as senhas continuam aparecendo uma vez.
- **Não coberto aqui (só produção):** DNS curinga, certificado Let's Encrypt e o Caddy. Confira com `deploy/nova-loja.sh` (que espera o endereço responder) ou abrindo o link.

## Falta
- Domínio próprio do cliente: já existe (TXT, F4/A5); o cadastro está no Admin.
- Apagar loja de teste: não há rota (de propósito). Uma loja `fumaca-*` criada pelo smoke ficaria na lista do Admin; por isso o workflow só cria **usuário** de fumaça, nunca loja.

## Prompt para criar um cliente novo (use depois da F2 parte 1)
> Crie a loja `<subdominio>` ("<Nome>", tipo `<tipo>`, dono `<login>`/"<Nome do dono>") em produção: rode `nova-loja.sh` na VPS, confirme o endereço com `deploy/smoke-producao.sh` (`SMOKE_LOJAS="<subdominio>:<tipo>"`), confira que o tipo e a marca (logo em `deploy/logos/<subdominio>.txt` ou ícone do tipo) estão certos e me entregue a senha temporária só no terminal. Não toque em outras lojas. Registre a loja em `docs/ESTADO-DO-PROJETO.md`.

## Testes
`NovaLojaPontaAPontaTest` (backend, CI: loja nova pela rota interna → Host → login → troca → assistente → Agenda, barbearia e estética, slugs recusados, 402, `ask`, regras do Admin); `agendz-admin/tests/e2e9.mjs` (formulário Novo cliente). `tests/nova-loja.test.mjs` (Caddy com `ask`, `/interno` escondido, reservados iguais aos do banco, entradas inválidas recusadas); `LojaPorEnderecoTest` (backend: `ask` só libera loja existente/domínio verificado). Caddy e Docker não rodam neste ambiente: o teste real é `nova-loja.sh` na VPS + `smoke-producao.sh`.
