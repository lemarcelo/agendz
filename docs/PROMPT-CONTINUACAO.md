# Prompt de continuação do Claude (Agendz)

Cole no início de uma sessão nova, ou diga "siga o `docs/PROMPT-CONTINUACAO.md`".

---
Você trabalha no Agendz (repositório `lemarcelo/agendz`, pasta `agendz`). Leia antes: `CLAUDE.md`, `docs/ESTADO-DO-PROJETO.md`, `docs/CHECKLIST-MARCELO.md` (o que o Marcelo já fez), `docs/PENDENTE-MARCELO.md` (se existir) e `docs/F3-primeiro-acesso.md`.

## Contrato de autonomia
- Trabalhe a fila inteira, em ordem, **sem parar para perguntar e sem mensagens de progresso**. O widget de tarefas mostra o andamento. Só escreva ao Marcelo no fim (relato) ou se travar de verdade.
- Dúvida de bom senso: decida, registre no histórico dos docs e siga. Os itens de "Decisões já tomadas" abaixo **não se perguntam de novo**.
- Item que depende do Marcelo (conta, segredo, DNS, senha, dado real, dinheiro): adiante tudo que não depende dele, **anote em `docs/PENDENTE-MARCELO.md`** (o quê, por quê, comando pronto) e passe ao próximo item. Nunca espere.
- Pare e pergunte **só** se: a decisão é irreversível ou custa dinheiro; exige mudar regra fixa do `CLAUDE.md`; ou a fila acabou e tudo que resta está bloqueado.
- Ao terminar um item: testes → CI verde → docs → commit e push → próximo. Se o CI falhar, corrija e repita até ficar verde (anotações: `tools/anotar-falha-maven.sh`).

## Decisões já tomadas (não perguntar)
- Artifact continua **simulado e sem rede**; o site publicado (`*.agendz.io`) vira API real por partes (`docs/F2-front-na-api-real.md`): auth + bootstrap primeiro.
- Donos de produção: **Kiko** (Offbox, login `kiko`), **Alan** (Dalforno, `alan`), **Davi** (Apex, `davi`). Senha forte gerada **no servidor**, troca obrigatória no primeiro login, nova senha com 8+ caracteres.
- Primeiro acesso (onboarding): especificação em `docs/F3-primeiro-acesso.md`. Passos puláveis e retomáveis; só pergunta o que faz sentido para o tipo.
- Domínio e INPI: o Marcelo decide depois de domingo (1/11). Não mexa.
- Token do R2: segue o atual até antes do primeiro cliente real.
- Deploy do site é automático (ativo). Deploy da API só depois que o Marcelo ligar `DEPLOY_API`.
- Remover serviço/profissional = desativar. Texto de tela usa `rot/voc` (nunca "esteticista" fixo). Toda tabela nova: `loja_id` + RLS + FK composta + teste de isolamento.

## Fila (nesta ordem)
0. **Correções de interface da Agenda (pedido do Marcelo em 27/10). FEITO em 27/10: a, b e c (v72: `SeletorProfissionais` único, link com `?loja=` na demo, `Cache-Control: no-cache` no Caddy, `tests/e2e34.mjs`). FALTA: d (experimento só no Artifact).**
   a. **Botão "Link Agenda" só funciona na Dalforno, na Offbox não.** Reproduza com e2e para as **três** lojas (apex, dalforno, offbox) no site real e no build local: botão habilitado, abre `https://wa.me/?text=` com o link da **própria** loja (`<slug>.<dominio>/#agendar`), nome da loja certo na mensagem, sem texto de outra loja. Hipóteses a checar, nesta ordem: estado salvo da Offbox no navegador sem `estabelecimento.linkAgendamento` (estado antigo, falta migração que preencha o padrão); `trocarTextos` da Offbox em `src/services/lojas-demo.js` mexendo no link; link desligado por regra. Corrija a causa (migração do estado salvo, não remendo por loja) e deixe o teste cobrindo as lojas pela lista de `lojas-demo.js`, para loja nova entrar sozinha.
   b. **Nomes dos profissionais se sobrepondo** na barra da Agenda (`SeletorProfissionais`, `LIMITE_CARTOES`): troque os cartões lado a lado por **um seletor único e compacto**, sempre, em qualquer quantidade de profissionais e em 390 px:
      - Mostra só a seleção atual (avatar + nome, ou "Todos"), com **seta (chevron) à direita** que expande a lista (com busca quando passar de ~6).
      - **Escolher um item recolhe a lista de volta** (clique escolhe um; várias seleções continuam só por gesto, como na v61: segurar, Ctrl/Shift, X pequeno em cada marcador; nesse caso a lista pode ficar aberta até Esc ou clique fora).
      - **Seleção inicial:** se o usuário que entrou **atende** (`usuario.atende`/profissional), vem **selecionado ele**; se **não atende** (dono ou atendente de balcão), vem **"Todos"** (nada marcado = todos). O profissional comum continua vendo só a própria agenda (sem seletor de outros).
      - Respeitar a chave `agenda-esteticistas:${user.id}` (preferência salva por usuário), mas só para quem o usuário ainda pode ver; saneada com `sanearOrdem`/`aplicarOrdem`.
      - Nome longo nunca se sobrepõe: `text-overflow: ellipsis` com `title`; alvos de toque ≥ 44 px; teclado (Enter/Esc/setas) e `aria-expanded`.
   d. **Experimento SÓ no Artifact (não vai para o site nem para o projeto real; pedido do Marcelo em 27/10):** uma variante de visualização da Agenda para ele avaliar, ligada por flag de build (`AGENDZ_EXPERIMENTO=cards`) que **só vale para `dist/agenda.html`** (o Artifact); `dist/index.html`, `dist/*-barbearia.html` e o site publicado pelo CI **nunca** recebem a flag (teste estático: o código do experimento não aparece no `index.html`). Padrão do Artifact fica como está até ele aprovar; publicar o experimento como **Artifact separado** (outra URL) para ele comparar com o atual.
      - Barra de cima: **Atender à direita, Link Agenda à esquerda** (celular e computador), sem a troca Dia/Semana/Mês.
      - Abaixo, dois modos, como abas (nome a escolher pelo bom senso: **Horários** e **Calendário**; se ficar melhor, "Agenda"): **Horários** = **cartões** do dia em lista (hora, cliente, serviços, profissional, status; um toque abre o agendamento), com navegação de dia (Hoje, anterior, próximo) e sem a grade de dia/semana; **Calendário** = só a visão de **mês** (o grid de dia/semana deixa de existir nesta variante). Os marcadores de status (legenda) continuam como hoje.
      - **Posição salva** (só nesta variante): o modo escolhido, o dia e a rolagem da página voltam como o usuário deixou ao reabrir (localStorage por usuário e loja, com try/catch; valor lido sempre saneado; se vier inválido, volta ao padrão). O preview do Artifact pode não guardar `localStorage`: nesse caso guarda em memória e a tela funciona igual.
      - Mesmos dados e mesmas regras (nada muda na API simulada); e2e próprio da variante em `tests/e2eN.mjs` rodando com a flag, 390 px e 1440 px, sem rolagem horizontal; os e2e normais continuam rodando **sem** a flag.
   c. Testes: e2e novo (nome longo e 8+ profissionais em 390 px e 1440 px sem sobreposição medida por `boundingBox`; seleção inicial de quem atende vs. quem não atende; recolhe ao escolher; Esc fecha), e2e do botão de link nas três lojas, e atualização dos e2e antigos que dependiam dos cartões (`tests/` e `tests-barbearia/` ficam equivalentes; se um teste importado da barbearia depender do layout antigo, registre a exceção em `docs/EQUIVALENCIA-BARBEARIA.md`). **Fonte do CI é mais larga que a local (DejaVu Sans vs Inter): meça os dois** (injete `*{font-family:"DejaVu Sans" !important}` no teste de largura).
0b. **Experimento visual só no Artifact (pedido do Marcelo em 27/10; NÃO entra no site nem no projeto real):** variante de visualização da Agenda em **cartões** no lugar da grade Dia/Semana ("parece meio inútil"): lista de cartões dos atendimentos do período (horário, cliente, serviços, profissional, status com a cor do status), agrupados por dia; o **calendário em grade só aparece quando a visão é Mês**. A **posição de rolagem** da Agenda fica salva (por usuário e visão) e volta ao reabrir, **somente nesta variante**.
   - Isolamento: só existe quando `AGENDZ_EXPERIMENTO=cartoes` no build (`node build.mjs`); o build padrão, o do site e os testes **não mudam** e continuam passando sem ela. O único arquivo gerado com a variante é o `dist/agenda.html` publicado no Artifact (publicar como **outra** URL ou na mesma só se o Marcelo pedir; por padrão, **outra URL**, para não trocar a versão de referência). Nada de deploy, nada de commit da variante como padrão: o código fica atrás do flag e com teste estático que garante que o flag desligado não inclui nada dela no bundle.
   - Preferência salva só em `localStorage` do navegador do Artifact (com try/catch, o app funciona sem ele).
   - Meta: o Marcelo olha, opina e decide se vira padrão; só depois entra no site pelo fluxo normal (prompt vivo + testes).
1. **Base de produção para o primeiro acesso:** migração (`usuario.deve_trocar_senha`, tabela `onboarding` com RLS), `PUT /api/usuarios/me/senha`, claim `trocar` no JWT (enquanto verdadeira, a API só aceita trocar a senha), `deploy/provisionar-loja.sh` (cria loja + dono com senha forte gerada na VPS, mostrada **uma vez**, nunca em arquivo/log/CI) e as logos de produção em `deploy/logos/` (geradas das constantes do front, com teste de igualdade).
2. **Teste no servidor real:** job `smoke-producao` no `deploy-api.yml`, depois do deploy, só com endpoints públicos (sem credencial): `GET /api/publico/loja` de cada loja devolve tipo e nome certos; `/api/clientes` sem token = 401; `/interno/*` de fora = 404; `X-Forwarded-Host` forjado ignorado; login errado = 401; o site responde 200. Falha do smoke deixa o CI vermelho.
3. **F2 parte 1:** dois builds (simulado sem rede para Artifact/testes; real para o site publicado), `src/services/api-real.js` com cliente HTTP (token só em memória), login real e `GET /api/publico/loja`. O teste estático passa a vigiar que `dist/agenda.html` não tem `fetch`.
4. **Primeiro acesso:** endpoints de onboarding + catálogo por tipo (derivado dos seeds, com teste de igualdade) + tela `ui/PrimeiroAcesso.jsx` + `api.onboarding` simulada + e2e. Detalhes em `docs/F3-primeiro-acesso.md`.
5. `POST /plataforma/lojas` (criar loja pela API) e verificação de domínio próprio por DNS. Base pronta: `deploy/nova-loja.sh` + TLS sob demanda no Caddy (`docs/F4-nova-loja-por-subdominio.md`).
6. Estabelecimento (configuração), escala/expediente e exceções; a agenda valida "o profissional atende nesse horário"; passo "Expediente" entra no primeiro acesso.
7. Estética: box, veículo e porte, serviço de vários dias (passo "Boxes" no primeiro acesso).
8. Tick automático (`@Scheduled` + `Clock`), plano de mensagens, status manual.
9. Cupom, estoque/material, comissão (`docs/MAPA-API-SPRING.md`).
10. Financeiro e Pix, WhatsApp (formato Meta): interface + simulador; provedor real só quando o Marcelo escolher.
11. F2 partes seguintes (clientes, serviços, equipe, agenda no front real), cada uma só quando o servidor tem **toda** a regra daquele recurso e o teste de equivalência passa.
12. Gate 3 (e): arquivos por loja, quando existir upload.

## Segredos e senhas (inegociável)
Nunca escreva senha, token ou chave em chat, arquivo, commit, log ou saída do CI. Senha de usuário real nasce no servidor e só o Marcelo a vê, uma vez. O que o CI usa de produção são só endpoints públicos.

## Pronto significa
Teste novo que falha sem a correção; teste de isolamento entre lojas (Gate 3) em todo recurso novo; `npm run verificar` quando mexer no front; CI verde; `MAPA-API-SPRING.md`, `ESTADO-DO-PROJETO.md` e `prompt-agendz-regras.md` atualizados; commit e push com a atribuição; Artifact republicado se o front mudou.

## Limites do ambiente
Sem SSH de saída (não toco na VPS; "testar no servidor real" = job do CI com endpoints públicos). Sem Maven Central nem Docker aqui: o CI compila e testa o back-end (acompanhe com `gh api repos/lemarcelo/agendz/actions/runs/...`). Para SQL, use um PostgreSQL 16 local descartável.

## Relato final (≤ 10 linhas)
Feito · decisões tomadas sem confirmação · o que depende do Marcelo (com o comando pronto, vindo de `PENDENTE-MARCELO.md`) · próximo passo.
