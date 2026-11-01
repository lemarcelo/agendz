# Prompt de continuação do Agendz (para um modelo mais simples, no VS Code, sem supervisão)

> Cole **o texto abaixo da linha** no início da conversa. Escrito em 01/11/2026. Antes de agir, confirme com `git log --oneline -5` e `docs/BACKLOG-FUTURO.md` se algo já foi feito.

---

Você continua o projeto **Agendz** (agenda multi-tenant; lojas: Apex = estética automotiva, Dalforno e Offbox = barbearia). Repositórios: `agendz` (este) e `agendz-admin` (irmão). O dono se chama Marcelo. Trabalhe **sozinho até acabar tudo que dá**, sem pedir confirmação, com respostas **curtas, simples, em português do Brasil**.

## 0. Leia primeiro (nesta ordem, sem pular)
1. `CLAUDE.md` (regras fixas e histórico v1 a v137) e `docs/ESTADO-DO-PROJETO.md`.
2. `docs/BACKLOG-FUTURO.md` (fila B0 a B11) e `docs/AGUARDA-CONFIRMACAO.md`.
3. `docs/DECISOES-E-DUVIDAS.md` (as últimas 40 linhas) e a seção do `prompt-agendz-regras.md` do assunto (fica ao lado da pasta do projeto, em `/home/claude/prompt-agendz-regras.md` ou na pasta acima).
4. Skills em `docs/skills/agendz-*.md` (manutenção e entrega, regras e segurança, backend).

## 1. Onde o trabalho está agora
- A **`main`** (commit `d386092`) tem tudo até a **v137 (B10 parte A)**, com CI, deploy e fumaça verdes. Não mexa na `main` sem o ritual da seção 5.
- A branch **`feat/b6`** tem, além da `main`, um commit **WIP** do **B10 parte B (reCAPTCHA)**, **não verificado e com um erro conhecido**: `src/services/api-real.js` chama `comProva(...)`, função que ainda **não existe** (o site real quebra). Comece dessa branch: `git checkout feat/b6`.
- O Artifact (demonstração) está atualizado na URL de `docs/ESTADO-DO-PROJETO.md`. Parte B e B11 mexem só no site real, então o Artifact não muda (exceto se você alterar `src/domain`, `src/services/api.js` ou telas do Artifact).

## 2. Regras que nunca se quebram (resumo; o resto está no `CLAUDE.md`)
- **Não faça** sem Marcelo confirmar por escrito: financeiro real, Pix, WhatsApp/Pix por cliente (isso é `docs/AGUARDA-CONFIRMACAO.md`). O reCAPTCHA **já foi confirmado** (31/10 13:36).
- Não use `alert/confirm/prompt`, `dangerouslySetInnerHTML`, `innerHTML`, `eval`. Texto de pessoa só como texto.
- `api-real.js` é o **único** arquivo com `fetch`; componentes de `src/ui/real/` e `src/ui/leve/` **não** importam `api.js`, `hooks.js` nem `common.jsx`. Classes de CSS do site real terminam em `-real`.
- Entrada nunca é confiável: valide no servidor (tamanho, tipo, faixa). Rota nova do servidor leva `@perm`/papel explícito (rota pública não leva login, mas leva freio em `LimitePublico`).
- Nunca grave dado pessoal no registro de barrados nem em log; só hash (`Cifra.hash`).
- Senha errada em ação sensível = **403**, nunca 401 (o front derruba a sessão em 401).
- Arquivo novo em `src/` e `tests/` leva o cabeçalho `/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */` na primeira linha.
- Texto visível nunca traz "dono" (use "proprietário") nem "esteticista" fixo (use `rot('profissional')`).
- Todo bug corrigido ganha um teste que **falha sem a correção**. Teste de navegador com data usa relógio fixo (`ctx.clock.setFixedTime`), senão quebra no fim do mês.

## 3. Lições que já custaram caro (evite)
- **Java só compila e testa no CI** (sem Maven aqui). Escreva Java com cuidado e releia antes de subir. Mudou a assinatura de um `record` ou construtor → `grep` em **todas** as chamadas (main e test).
- Teste de unidade que lê o `Date` precisa fixar o relógio. O selo do link usa **segundos** de época (10 dígitos), não milissegundos.
- Contadores de `LimitePublico` e `LimiteDeLogin` são em memória e compartilhados entre testes Java: cada teste usa IP/login próprio e chama `limitePublico.reiniciar()`.
- Nunca rode `npm run verificar` e `npm run testar:barbearia` ao mesmo tempo. Nunca edite `src/` enquanto o `verificar` roda.
- Leia o resultado dos e2e com `grep -E "^FALHOU" arquivo.log`.
- `gh workflow run` é bloqueado. Deploy com erro 255 de ssh: `gh run rerun <id> --failed`.
- Não use `git add -A` sem conferir (já entrou `node_modules` por engano). Adicione por pasta: `git add backend src tests docs deploy`.
- Migração nova: o próximo número livre é **V47** (V45 e V46 já existem). Nunca edite migração antiga.
- Cada passo abaixo termina com teste verde **antes** do próximo. Se um teste falhar duas vezes pelo mesmo motivo, leia o erro inteiro, corrija a causa e não afrouxe o teste.

## 4. Fila de trabalho (nesta ordem; só passe para o próximo quando o anterior estiver no ar)

### Tarefa 1: B11. Aviso de avaliação para o cliente (pedido de 01/11 09:16, vem **antes** do reCAPTCHA)
Pedido do Marcelo: no fim do agendamento pelo link, avisar na tela que depois do atendimento o cliente pode avaliar; e avisar/notificar o cliente quando o agendamento for concluído, **por consulta simples com os dados do próprio autoagendamento** (token guardado no aparelho), sem WhatsApp.
Desenho recomendado (registre em `DECISOES-E-DUVIDAS.md` como "decisão sem confirmação"):
1. **Tela final** (`src/ui/real/AgendarPublico.jsx`, bloco `pub-feito`): acrescente o texto `data-testid="pub-feito-avaliar"`: "Depois do atendimento você poderá avaliar por aqui, em Meus agendamentos."
2. **Consulta** (`Meus` no mesmo arquivo): enquanto a aba está visível, chame `publico.meus` a cada 60 s e ao voltar à aba (veja o padrão de `src/ui/real/atualizar.js`; falha de fundo não mostra erro). Quando um horário do aparelho aparece com status **concluído** e sem avaliação, mostre no cartão o aviso `data-testid="pub-avaliar-<id>"`: "Seu atendimento foi concluído. Conte como foi" com botão que abre a avaliação.
3. **Servidor** (`backend/.../avaliacao/`, rota nova **pública**): `POST /api/publico/agendamentos/{id}/avaliacao` com cabeçalho `X-Acesso` (token do agendamento, o mesmo do cancelar). Regras: token precisa ser **deste** agendamento; só se `status = concluido` e ainda **sem avaliação**; gera o token de avaliação reaproveitando a **mesma função** que `POST /api/agendamentos/{id}/avaliacao/pedido` usa (um token vivo por agendamento, só o hash guardado, 90 dias, uso único, nunca na URL); devolve `{ avaliarToken }`. Freio por IP em `LimitePublico` (ex.: 30 por 10 min). Qualquer falha de regra = 404 genérico (não revele de quem é). Libere a rota em `seguranca/SegurancaConfig.java` como as outras públicas.
4. **Front:** `api-real.js` `publico.avaliar(id, token)`; ao tocar no aviso, chame a rota e navegue para `#avaliar/<avaliarToken>` (o fragmento, nunca a busca).
5. Testes: `AvaliacoesTest` (ou `LinkPublicoTest`): sem token = 404, agendamento não concluído = 404, concluído = 200 e o token funciona em `/api/publico/avaliacoes`, segunda chamada troca o token (o antigo deixa de valer); `tests/api-real-publico.test.mjs` (cabeçalho, formato); `tests/e2e116.mjs` (servidor falso que devolve o horário como concluído na segunda consulta; relógio fixo; 390 px com fonte larga e desktop × claro/escuro). Mapa: `docs/MAPA-API-SPRING.md`. Histórico: `CLAUDE.md` v138 e `### v138` no prompt vivo.
6. Entregue pelo ritual da seção 5. Mande a Marcelo a mensagem de pronto (seção 6).

### Tarefa 2: B10 parte B. reCAPTCHA (login e autoatendimento)
Já escrito e **não testado** (veja `git show d98c243 --stat`): `auth/Recaptcha.java`, `LimiteDeLogin` (5 erros → exige captcha; bloqueio duro só no 12º), `AuthController` (campo `captcha`, 428), `LojaPublicaController` (`captchaChave`), `publico/CaptchaDoLink.java` + `LimitePublico.quantos` + `LinkPublicoController` (cabeçalho `X-Captcha`; limites suaves: agendar 6 por 10 min, meus 20 por min, cancelar e remarcar 8 por 10 min), migração `V46__link_barrado_captcha.sql`, `application.yml`, `deploy/docker-compose.api.yml`, `src/ui/real/Captcha.jsx` (`Captcha` e `useCaptcha`), parte de `api-real.js`, testes Java `CaptchaLoginTest` e três novos em `LinkPublicoTest`.
Falta, nesta ordem:
1. **Corrigir `api-real.js`:** logo abaixo de `const PUB = { publico: true };` crie  
   `const comProva = (opcoes, captcha) => (typeof captcha === 'string' && captcha && captcha.length <= 4096 ? { ...opcoes, cabecalhos: { ...(opcoes.cabecalhos || {}), 'X-Captcha': captcha } } : opcoes);`  
   (`PUB` e `comProva` precisam estar declarados antes do uso; confira com `node --check src/services/api-real.js` e `node --test tests/api-real-publico.test.mjs`).
2. **Login** (`src/ui/real/AppReal.jsx`, componente `Login`): `const cap = useCaptcha(loja.captchaChave);` chame `entrar({ identificador: id, senha, loginAutomatico: auto, captcha: cap.prova })`; depois do retorno: `cap.gasta();` e, se `!r.ok`, `cap.verificar(r);`. Renderize `{cap.widget}` acima do botão Entrar. Quando `status === 428` a mensagem do servidor aparece em `login-erro` e a caixa passa a aparecer.
3. **Link do cliente** (`src/ui/real/AgendarPublico.jsx`): em `enviar` use `const cap = useCaptcha(loja.captchaChave)` no componente principal, passe `captcha: cap.prova` em `publico.agendar`, chame `cap.gasta()` e `cap.verificar(r)` no retorno e renderize `{cap.widget}` antes do botão `pub-enviar`. No componente `Meus`: o mesmo `useCaptcha` para `publico.cancelar(a.id, token, cap.prova)` e `publico.remarcar(a.id, token, inicio, cap.prova)`, e para `publico.meus(tokens, cap.prova)` (se vier 428, guarde `pendenteMeus` e refaça a consulta quando `cap.prova` for preenchida).
4. **Tela do link** (`src/ui/real/LinkAgendamento.jsx`): na lista de motivos do texto `link-barrados` acrescente `['captcha', 'verificação não resolvida']`.
5. **Testes de unidade:** em `tests/api-real-publico.test.mjs` a contagem de barrados agora tem a chave `captcha: 0` (atualize os dois objetos esperados) e teste: `carregarLoja` devolve `captchaChave` só no formato `[A-Za-z0-9_-]{20,80}`; `entrar` manda `captcha` só se for texto não vazio; `agendar/meus/cancelar/remarcar` mandam o cabeçalho `X-Captcha` só com prova válida.
6. **Navegador:** `tests/e2e117.mjs` (ou o próximo número livre), com `subirServidor` de `tests/real-util.mjs`. O Google falso: `await ctx.route('https://www.google.com/recaptcha/api.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.grecaptcha={render:(el,o)=>{const b=document.createElement('button');b.type='button';b.textContent='Não sou um robô';b.setAttribute('data-testid','captcha-falso');b.onclick=()=>o.callback('prova-boa');el.appendChild(b)}};setTimeout(()=>window.agendzCaptchaPronto&&window.agendzCaptchaPronto(),0);" }))`. Cenários: (a) loja com `captchaChave` de 30 letras; login responde 401 nas 5 primeiras, 428 na 6ª sem `captcha`; a caixa aparece (`captcha`), clicar em `captcha-falso` e entrar manda `captcha: 'prova-boa'`; (b) loja **sem** `captchaChave`: nunca aparece caixa e o 428 só mostra a mensagem; (c) link do cliente: o servidor falso responde 428 ao pedir horário sem `X-Captcha` e 201 com ele; (d) 390 px com fonte larga (sem rolagem lateral, `nav.semRolagem`) e desktop × claro/escuro.
7. **Documentos:** `CLAUDE.md` (linha `v139`: reCAPTCHA; chaves `RECAPTCHA_CHAVE_SITE`/`RECAPTCHA_SEGREDO`; sem as chaves nada muda; falha de rede com o Google = recusa), `### v139` no prompt vivo, `DECISOES-E-DUVIDAS.md` (limites suaves; telefone não entra no limite suave; registro de barrados com motivo `captcha`), `docs/MAPA-API-SPRING.md` (login 428, `X-Captcha`, V46), `docs/BACKLOG-FUTURO.md` (B4 e B10 feitos), `docs/AGUARDA-CONFIRMACAO.md` (reCAPTCHA saiu da espera).
8. Ritual da seção 5.
9. **Avise Marcelo (pedido dele):** "Para ligar o reCAPTCHA: crie o site em google.com/recaptcha (tipo v2, caixa 'Não sou um robô', domínios `agendz.io` e as lojas), ponha `RECAPTCHA_CHAVE_SITE` e `RECAPTCHA_SEGREDO` em `/opt/agendz/.env` e reinicie a API. Sem as chaves nada muda." Nunca peça nem escreva as chaves em arquivo, log, commit ou conversa.

### Tarefa 3 em diante (veja o texto de cada uma em `docs/BACKLOG-FUTURO.md`; cada uma segue o mesmo ritual)
- **B9a** (campos do link no primeiro acesso e no Reconfigurar): confira primeiro o que já existe (`POST /api/onboarding/link`, V41, v131). Só faça o que faltar.
- **B1** modo homologação por cliente (mais invasivo; planeje a regra única de visibilidade no banco antes de mexer; trabalha nos dois repositórios).
- **B2** log de ações dos usuários no Admin (`log_acao`; aba Atividade).
- **B5** relatório de uso do link no Admin (funil, só contagens).
- **B3** troca de domínio (por último; há trabalho parcial no stash `b3-parcial` do `agendz-admin`).
- **Em espera, não faça:** financeiro real, Pix, WhatsApp/Pix por cliente, mensalidade por Pix.

## 5. Ritual de entrega (cada tarefa, nesta ordem; só pule o que não se aplica)
1. Escreva o código e os testes. Rode os testes pequenos do que mexeu (`node --test tests/<arquivo>.test.mjs`, `node tests/eNNN.mjs` depois de `node build.mjs --real`).
2. Atualize `CLAUDE.md` (linha nova `vNNN`), `### vNNN` no prompt vivo, `DECISOES-E-DUVIDAS.md`, `MAPA-API-SPRING.md`, `BACKLOG-FUTURO.md`.
3. `npm run verificar` inteiro (fundo, saída em arquivo; espere `FIM 0`). Se algo falhar: corrija a causa, rode de novo.
4. `git add backend src tests docs deploy` → commit com mensagem curta em português → `git push origin HEAD:main` e `git push origin <sua-branch>`.
5. Acompanhe o CI: `gh run list --limit 6 --json name,status,conclusion,headSha`. Esperado: `CI`, `Deploy da API` e `Fumaça no site real` com `success`. Se o CI falhar: baixe as anotações (`gh run view <id> --json jobs`, depois `gh api repos/lemarcelo/agendz/check-runs/<job>/annotations --jq '.[].message'`), corrija, suba de novo. Teste da barbearia que quebra por data = fixe o relógio no teste.
6. **Só depois de CI, deploy e fumaça verdes**, e **só se algo do Artifact mudou**: `node build.mjs` e republique o Artifact (mesma URL, sem `icon`).
7. Compare o que fez com as skills `agendz-*` (memória de Marcelo): se ficou obsoleta, proponha a atualização pelo mecanismo de skills (não edite os arquivos sincronizados).
8. Mande a mensagem de pronto (seção 6). Siga para a próxima tarefa sem esperar resposta.

## 6. Comunicação com Marcelo (economize tokens)
- **Só escreva para ele** quando uma função estiver **no ar** (CI, deploy e fumaça verdes) ou quando ele precisar decidir/fazer algo. Nada de aviso a cada passo.
- Máximo **10 linhas**, simples, em checklist: o que foi feito / o que falta / o que depende dele.
- Decisões tomadas sem confirmação vão em `DECISOES-E-DUVIDAS.md` **e** numa linha da mensagem.
- Se bater o limite de uso: espere redefinir e continue sozinho, sem pedir confirmação.
- Se um pedido dele for só pergunta, **responda sem mexer em código**.

## 7. Quando parar e perguntar (única exceção)
Ação que não se desfaz e pode ir para dois lados (apagar dado de loja, trocar chave de cifra `CIFRA_CHAVE`/`CIFRA_PEPPER`/VAPID com dados existentes, mexer em DNS ou na VPS). Faça o preparo, escreva a decisão em duas linhas e pare naquela tarefa; siga com as outras.
