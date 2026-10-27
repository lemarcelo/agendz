# Prompt executável: painel administrativo da plataforma (Agendz Admin), suporte e chamados

> Pedido do Marcelo em 27/10 (15:39). **Pronto para executar direto**: cada dúvida abaixo já tem uma decisão. Só pare e pergunte se uma delas bater em algo que não dê para desfazer. Regras fixas do projeto (`CLAUDE.md`) valem; este prompt **substitui** a seção "Painel da plataforma" de `docs/PROMPT-PLATAFORMA-COBRANCA.md` (que fica como base de cobrança, fases P2 a P5) e usa `docs/PROMPT-COBRANCA-ESTABELECIMENTO.md` quando chegar na cobrança por agenda.

## 1. O que o Marcelo pediu
1. Um **acesso de administrador** para criar clientes e subdomínios (Dalforno, Offbox, Apex e os próximos), acompanhar e **controlar os usuários dos clientes**, as **regras de cadastro**, as **mensagens** etc.
2. Isso é um **artefato/painel separado**, em **outro repositório** e rodando **separado** (tem recursos administrativos que o sistema dos clientes não pode ter).
3. Mais tarde entra uma pessoa de **suporte**, com **login diferente** (menos poder que o administrador).
4. **Chamados dentro do sistema, em formato de conversa**, sempre **vinculados a uma empresa (cliente) e a um usuário dessa empresa**.

## 2. Arquitetura (decidida)
- **Repositório novo `agendz-admin`** (privado). Se o `gh` deste ambiente não puder criá-lo (`gh repo create lemarcelo/agendz-admin --private`), peça ao Marcelo **uma linha**: criar o repositório vazio; depois `add_repo`. Estrutura: `web/` (React 19 + esbuild, mesmo estilo do Agendz: tokens de tema claro e escuro, 390 px sem rolagem lateral, sem `dangerouslySetInnerHTML`), `api/` (Spring Boot 3.5, Java 21, mesmo padrão de erros `{mensagem}`), `deploy/`, `docs/`, `CLAUDE.md` próprio, CI próprio.
- **Dois serviços, dois bancos, conversa só por HTTP interno:**
  - **Admin API** (nova) tem o **seu** PostgreSQL (`agendz_admin`, papel próprio): usuários da plataforma, contratos, licenças, faturas, **chamados**, auditoria. **Nunca** acessa as tabelas das lojas.
  - **API do Agendz** (atual) ganha **rotas internas** `/interno/plataforma/**` (criar loja, listar lojas/usuários, redefinir senha, ativar/desativar usuário, regras, suspensão, contagens). O Caddy **não** roteia `/interno` para fora (já é assim); só a rede interna do Docker chega lá. Autenticação serviço a serviço: segredo forte gerado na VPS (`preparar-api.sh`), JWT de 60 s assinado pelo Admin API (`aud: agendz-api`, `sub` = quem pediu), comparação em tempo constante. Sem o segredo: 401. Teste: rota pública nunca chega em `/interno`.
  - **Painel** em `admin.<domínio>` (hoje `admin.agendz.io`; o curinga `*.agendz.io` já aponta para a VPS e `admin` é slug reservado no banco). Domínio definitivo só depois da decisão pós-INPI: trocar é só DNS e uma variável.
- **O sistema dos clientes** (repo `agendz`) ganha: tela **Suporte** (seção 6) e as rotas internas acima; o resto não muda.
- **Dados pessoais:** o painel **nunca** mostra dados dos clientes finais das lojas (nome, CPF, telefone de quem agenda): só contagens. Usuários da equipe da loja aparecem com nome, login, papel e situação; nada além. Telefone/CPF mascarados quando inevitável (`cpfMascarado`).
- **Segredos:** nunca em arquivo, log, CI nem conversa. Senhas temporárias e TOTP aparecem **uma vez** na tela. Primeiro administrador criado por script na VPS (`deploy/criar-admin.sh`, senha temporária mostrada uma vez no terminal), igual ao `provisionar-loja.sh`.

## 3. Perfis e permissões do painel
| Ação | Administrador (Marcelo) | Suporte |
|---|---|---|
| Ver lista de clientes, status, tipo, contagens | sim | sim |
| Criar cliente/subdomínio, mudar logo/tema/nome | sim | não |
| Suspender/reativar/encerrar cliente | sim | não |
| Ver contrato, preço, faturas, pagamentos | sim | **não** |
| Ver usuários da equipe de um cliente | sim | sim |
| Redefinir senha temporária de um usuário do cliente | sim | sim (motivo obrigatório, auditado) |
| Ativar/desativar usuário do cliente | sim | não |
| Ver e mudar regras do cliente (seção 5) | sim | só ver |
| Chamados: ver, responder, nota interna, atribuir, mudar status | sim | sim |
| Criar/desativar usuários da plataforma (suporte) | sim | não |
| Linha do tempo/auditoria | tudo | só o que ele fez + chamados |
- Login próprio (`plataforma_usuario`: e-mail, nome, papel `admin|suporte`, senha com hash forte, TOTP **obrigatório**, ativo). Token com `aud: agendz-admin`; **nenhum token de loja serve aqui e vice-versa** (teste). Limite de tentativas e bloqueio temporário; troca de senha no primeiro acesso; sessão curta (8 h) com renovação; token só em memória no front (como o site real).
- Toda ação de escrita confere o papel **no servidor** (o botão escondido não basta). Toda ação grava `evento_plataforma` (quem, quando, cliente, ação, motivo, IP): não se apaga.
- **Sem "entrar como o cliente"** (decidido: não). Suporte pede o que precisa dentro do chamado.

## 4. Clientes e subdomínios (o que o Marcelo mais quer)
- **Lista de clientes** (`<Tabela id="clientes">`, ordem personalizável): nome, slug/endereço, tipo, status (`em_teste|ativo|em_atraso|suspenso|encerrado`), nº de agendas (box na estética; profissional que atende na barbearia), nº de usuários, último acesso, chamados abertos. As lojas que já existem (Apex, Dalforno, Offbox) **aparecem sozinhas** (a lista vem da API do Agendz) e entram como `ativo`, sem fatura até uma data que o Marcelo definir.
- **Criar cliente (formulário):** nome, slug (`^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$`, fora os reservados do banco), tipo (`estetica_automotiva|barbearia`, **não muda depois**), logo (PNG/JPEG/WebP ≤ 100 KB), nome e login do dono. O Admin API chama `POST /interno/plataforma/lojas`, que cria loja + dono (`deve_trocar_senha`) + linha de onboarding numa transação, devolve a **senha temporária uma vez**; o painel a mostra uma vez com aviso e botão copiar. O endereço `slug.<domínio>` funciona pelo certificado sob demanda do Caddy (`/interno/dominio-permitido`). Depois da criação o painel confere `https://slug.<domínio>/api/publico/loja` e mostra verde ou vermelho. `deploy/nova-loja.sh` e `provisionar-loja.sh` ficam como plano B.
- **Domínio próprio do cliente:** campo com verificação por TXT no DNS antes de liberar o `ask` (fase A5).
- **Ficha do cliente (abas):** Visão geral · Usuários · Regras · Chamados · Linha do tempo · (admin) Contrato e faturas (placeholder até a cobrança).

## 5. Usuários, regras de cadastro e mensagens do cliente
- **Usuários (da equipe da loja):** lista com nome, login, papel, atende?, ativo, último acesso. Ações: redefinir senha temporária (nova senha mostrada **uma vez**, `deve_trocar_senha = true`, derruba as sessões); ativar/desativar (admin; dono nunca pode ficar sem dono ativo: recusa). Nunca editar senha direto, nunca ver senha ou hash. É também o caminho do "Esqueci minha senha" enquanto a loja não tem e-mail/WhatsApp (a tela do primeiro acesso e do login manda pedir ao suporte); o usuário que a pessoa escolheu no primeiro acesso é mantido, só a senha volta a ser temporária e ela a troca de novo (v80).
- **Regras do cliente** (`loja_regra_plataforma`, na base do Agendz, mexida só pela rota interna): `limiteAgendas` (do contrato; aviso quando passar, nunca derruba em silêncio), `limiteUsuarios`, `mensagensAtivas` (liga/desliga todo envio do cliente), `limiteMensagensMes`, `cadastroObrigatorios` (quais campos do cadastro de cliente final são obrigatórios: telefone sempre; CPF e nascimento opcionais ligáveis), `ddds` liberados padrão. Cada mudança com **motivo** e auditoria. A loja lê essas regras na API e **aplica no servidor** (teste: recusa o que passar do limite).
- **Mensagens:** v1 só os controles acima (liga/desliga e limite mensal) e um **resumo** de envios por cliente (contagem, sem texto). **Editar os modelos padrão por tipo** (`src/tipos/*/templates.js`) vira fase A6, quando existir envio real de WhatsApp.
- **Suspensão:** campo `loja.suspensa_em`; a API do Agendz devolve 402 "Sistema suspenso por falta de pagamento" (menos login, tela de pagamento e Suporte). Quem aciona é o admin, ou a cobrança (fase P3).

## 6. Chamados em formato de conversa
**Modelo (no banco do Admin API):** `chamado (id, loja_id, loja_nome, usuario_id, usuario_nome, usuario_papel, assunto ≤ 120, categoria duvida|problema|sugestao|cobranca|outro, prioridade baixa|normal|alta|urgente, status aberto|em_atendimento|aguardando_cliente|resolvido|fechado, atribuido_a, criado_em, atualizado_em, nao_lidas_cliente, nao_lidas_suporte)` e `chamado_msg (id, chamado_id, autor_tipo cliente|suporte|sistema, autor_id, autor_nome, texto ≤ 4000, interna boolean, anexo_id, criado_em)`. Mensagem nunca é editada nem apagada; só se acrescenta.
**Vínculo:** empresa e usuário vêm **do token do cliente na API do Agendz** (a API chama o Admin API pela rota interna e injeta `loja_id`/`usuario_id`); **nunca** do corpo da requisição (IDOR). Nome e papel ficam como foto no chamado.
**No sistema do cliente:** item de menu **Suporte** (qualquer usuário logado; fica fora do 402): lista "Meus chamados" (o **dono vê todos os chamados da loja**; os demais só os que abriram), botão **Novo chamado** (assunto, categoria, primeira mensagem), tela de conversa com balões (cliente à direita, suporte à esquerda), campo de resposta, status visível, selo de não lidas no menu. Atualização por consulta a cada 15 s enquanto a tela está aberta (SSE só depois). Cliente pode **reabrir** um chamado resolvido por 7 dias; depois disso abre outro.
**No painel:** caixa de entrada (filtros: status, cliente, prioridade, atribuído a mim, sem resposta), conversa com o contexto do cliente ao lado (nome, tipo, status, usuário que abriu), **nota interna** (marcada, invisível ao cliente), atribuir, mudar status/prioridade, respostas prontas (texto simples). Resolvido há 7 dias sem resposta → `fechado` automático (relógio injetável).
**Regras:** texto sempre como texto; limite de 5 chamados novos por hora por usuário e 20 mensagens por hora por chamado; anexo v1 = **uma imagem por mensagem** (PNG/JPEG/WebP, ≤ 1 MB, assinatura conferida, guardada no banco do Admin API), baixada só por quem enxerga o chamado; nada de HTML. Aviso por e-mail fica para depois (v1: selo na tela e no painel). Meta de primeira resposta (padrão 4 h úteis) só **aparece** (não bloqueia).

## 7. Artefato (protótipo) e build real
- **Um Artifact só**, separado do Agendz, "Agendz Admin": mesma ideia do protótipo do sistema (API simulada em memória, nada de rede, dados fictícios; login de demonstração com um administrador e um suporte; tema claro/escuro; 390 px). Telas: Clientes (lista e criar cliente simulado com senha mostrada uma vez), Ficha do cliente (abas da seção 4), Usuários do cliente (redefinir senha simulada), Regras, Chamados (caixa de entrada + conversa), Equipe da plataforma (admin cria suporte), Linha do tempo. Publicar com a skill de Artifact e atualizar na mesma URL a cada fase.
- **Build real** (`web` contra o Admin API) em `admin.<domínio>`, só depois da fase A2. Mesma regra do Agendz: um único arquivo com `fetch`, token só em memória.
- No sistema dos clientes, o **protótipo** do Suporte entra também na API simulada do Agendz (`api.js`: `suporte.*`, com chamados fictícios e uma resposta automática do "suporte" na demonstração), e o real usa `api-real.js`.

## 8. Fases (cada uma com testes e CI verde antes da próxima; pare só se algo não puder ser desfeito)
- **A0 Repositório e base:** criar/receber `agendz-admin`, esqueleto web/api/deploy, CI (build, testes, auditoria de dependências), `CLAUDE.md` próprio, Docker e bloco do Caddy para `admin.<domínio>` (marcado como não aplicado até o Marcelo rodar), `deploy/criar-admin.sh`.
- **A1 Artifact do painel** (seção 7) com a API simulada e testes e2e (computador e 390 px com fonte larga).
- **A2 Admin API:** usuários da plataforma, login com TOTP, papéis, auditoria, chamados (modelo e rotas), testes de autorização (admin ≠ suporte ≠ token de loja ≠ sem token), de limite e de IDOR.
- **A3 API do Agendz:** `/interno/plataforma/**` (criar loja transacional, listar, usuários, redefinir senha, ativar/desativar, regras, suspensão), migrações `V10+`, filtro 402, teste de que `/interno` não é alcançável de fora, `docs/MAPA-API-SPRING.md` atualizado.
- **A4 Chamados ponta a ponta:** tela Suporte no sistema dos clientes (simulada e real) + painel real; selo de não lidas; teste do vínculo empresa/usuário e da visão do dono.
- **A5 Domínio próprio do cliente por TXT**, e ligação com a cobrança por agenda (`PROMPT-PLATAFORMA-COBRANCA.md` P2 a P5).
- **A6 Modelos de mensagem por tipo editáveis** e resumo de envios (quando houver WhatsApp real).

## 9. Testes e segurança obrigatórios
Autorização por papel em **todas** as rotas (matriz da seção 3 virando teste); token de loja não entra no Admin API e o contrário; segredo serviço a serviço errado ou vencido = 401; `/interno` inacessível pelo endereço público; slug inválido/reservado e tipo desconhecido recusados; senha temporária só na resposta de criação/redefinição (nunca em log, evento nem GET depois); chamado sempre com `loja_id` e `usuario_id` do token (corpo ignorado); usuário comum não lê chamado de outro usuário nem de outra loja; dono lê todos da própria loja; nota interna nunca no DTO do cliente; anexo com assinatura falsa recusado; limites de taxa; auditoria gravada em toda escrita; painel sem dado de cliente final; textos só como texto; relógio injetável para fechamento automático. Documentar no `docs/` do repo novo e atualizar `prompt-agendz-regras.md` + `docs/MAPA-API-SPRING.md` do Agendz a cada fase.

## 10. O que depende do Marcelo (nada disto impede começar pela A1)
1. Aceitar criar o repositório vazio `agendz-admin` se o `gh` daqui não conseguir.
2. Na VPS (sem mandar segredo para cá): rodar `preparar-api.sh` (gera o segredo serviço a serviço) e depois `criar-admin.sh` quando a A0/A2 estiverem prontas; anotar a senha temporária e o QR do TOTP na hora.
3. Decidir o domínio definitivo depois do domingo (INPI). Até lá o painel usa `admin.agendz.io`.
4. Quando contratar o suporte: criar o login dele pelo painel (admin) e entregar a senha temporária pessoalmente.
5. Respostas já assumidas (diga se discorda): suporte **não** vê cobrança; **sem** "entrar como o cliente"; anexo só imagem de até 1 MB; aviso por e-mail fica para depois.
