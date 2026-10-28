# Backlog futuro (ideias pedidas pelo Marcelo, para fazer depois)

Regra de uso: toda funcionalidade nova pedida "para outro momento" entra aqui com **o que é**, **onde mexe** (só Admin, só Agendz, ou os dois) e **dúvidas**. Não implementar antes de a fila principal (`docs/PROMPT-CONTINUACAO.md`) chegar nela, salvo se o Marcelo pedir.

## B1. Modo homologação por cliente (pedido de 28/10)
**Para que serve:** testar o sistema numa loja de verdade sem sujar os dados. O Admin liga e desliga o modo por cliente (loja); vale para qualquer tipo (barbearia, estética, futuros).
**Já existe algo parecido?** Não. Existe só histórico por agendamento (`agendamento_evento`) e o Reconfigurar reversível (serviços/equipe/expediente do assistente). Nenhum dos dois cobre lançamentos de teste.
**Como seria:**
- Admin liga o modo (com motivo, entra no log). Tudo que a loja **lançar** enquanto o modo está ligado (agendamentos, atendimentos, clientes criados pelo atendimento, estoque, financeiro, mensagens) ganha a marca `teste` e o número da sessão de teste. **Configurações** (estabelecimento, serviços, equipe, expediente) não levam a marca.
- Ao ligar, o servidor guarda uma **foto das configurações** (JSON). Ao desligar, o Admin escolhe: **(a) manter as configurações** e esconder os lançamentos de teste; **(b) manter os lançamentos** (viram reais) ; ou os dois; se não mantiver as configurações, volta a foto.
- Lançamentos de teste **não são apagados**: ficam salvos e **invisíveis** para a loja com o modo desligado. O Admin vê a lista deles e pode **reverter** (devolver a visibilidade) um a um ou por período. (Dúvida D1 abaixo.)
- No modo teste nada sai de verdade: sem WhatsApp, sem cobrança Pix, sem e-mail; faixa visível "Modo de teste" para quem usa a loja.
**Onde mexe: os dois.**
- Agendz (servidor): coluna `teste` em toda tabela de lançamento, filtro em **toda** consulta (hoje cada rota consulta direto; precisa de uma regra única no banco, p. ex. política RLS ou visão), conflito de horário e unicidade (telefone+nome) que **ignoram** linhas de teste escondidas, bloqueio dos envios, faixa na tela, rota interna `/interno/plataforma/**` para ligar/desligar/listar/reverter.
- Admin: botão e assistente de desligar (as duas escolhas), tela da lista de testes com reverter, eventos na linha do tempo.
- Depende de: **A3** (rotas internas entre Admin e Agendz).
**Cuidado:** é a mudança mais invasiva do backlog (toca todas as consultas). Fazer cedo é mais barato que tarde: cada módulo novo (5d financeiro/estoque, 5e mensagens) já deveria nascer com a coluna `teste`.
**Dúvidas:** D1 "reverter" = tornar o lançamento real de novo (visível)? Ou desfazer/apagar? Estou assumindo "tornar visível"; apagar definitivo nunca. D2 Pix/WhatsApp reais ficam sempre desligados no modo teste (assumido).

## B2. Log de ações dos usuários no Admin (pedido de 28/10)
**Para que serve:** o Admin ver, por cliente, quem fez o quê e quando.
**Já existe algo parecido?** Em parte: cada agendamento tem histórico (quem, quando, campo, de, para) e o Admin tem a linha do tempo das ações **do próprio Admin**. Não existe registro de ações dos usuários da loja em geral (login, cadastro de serviço, troca de equipe, cancelamentos...).
**Como seria:** tabela `log_acao` no Agendz (loja, usuário, papel, ação, tipo e id do objeto, resumo sem dado pessoal, hora, origem normal/teste) gravada na mesma transação da ação; o Admin lê por rota interna. Retenção sugerida: 12 meses.
**Onde fica no Admin (decisão minha):** dentro da ficha do cliente, aba **Atividade** (filtro por usuário, ação e período), mais uma tela **Auditoria** global para o administrador filtrar por cliente. **Suporte** vê ação, usuário e hora, nunca valores nem contrato.
**Regra de privacidade:** o painel nunca mostra dados dos clientes finais (CPF, telefone). O resumo grava só nome/apelido (que já podem ir para log) e ids; valores financeiros só para o administrador.
**Onde mexe: os dois.** Agendz grava (um ponto único, para nenhuma rota esquecer), Admin lê. Depende de A3.

## B3. Poder trocar o domínio (DNS) do Agendz depois (pedido de 28/10)
**Situação hoje (verificada):** o domínio já é **uma variável** (`DOMINIO`, `AGENDZ_DOMINIOS_BASE`, `AGENDZ_DOMINIO` no build); o Caddy usa `{$DOMINIO}`; as lojas vêm do endereço (Host), não de texto fixo; o token fica em memória (sem cookie por domínio). Os únicos lugares com `agendz.io` escrito são **valores padrão**: `ci.yml`, `deploy-api.yml` e `deploy-admin.yml` (`vars.DOMINIO || 'agendz.io'`), `application.yml` (`agendz.io,localhost`) e a constante de demonstração `DOMINIO` do Admin (`src/api-demo.js`). Nenhum texto de tela, e-mail ou regra depende dele.
**Para ficar à prova de erro (tarefa pequena, a fazer junto da A3):** (1) teste estático nos dois repositórios que **falha** se `agendz.io` aparecer fora desses padrões; (2) todo link montado (e-mail, WhatsApp, link de agendamento) sai de uma função única que lê `DOMINIO`; (3) roteiro de troca em `docs/TROCA-DE-DOMINIO.md`: criar os registros DNS (curinga das lojas e `admin`), mudar a variável `DOMINIO` nos três repositórios, redeploy, conferir `deploy/smoke-producao.sh`; lojas com domínio próprio não mudam; slugs continuam iguais.
**Onde mexe: os dois**, mas só em configuração e testes, sem regra de negócio.

## B4. reCAPTCHA no login (pedido de 28/10, adiado pelo Marcelo)
**O que é:** a partir da 7ª tentativa errada seguida, o login pede a caixa "Não sou um robô" (Google reCAPTCHA v2).
**Rascunho pronto:** `docs/backlog/B4-recaptcha.patch` (servidor: `Recaptcha`, `LimiteDeLogin.exigeCaptcha/bloqueadoNoLogin`, `AuthController` com campo `captcha` e resposta **428**, `captchaChave` em `/api/publico/loja`, `application.yml`, compose, `CaptchaLoginTest`). Não compilado (Java só compila no CI). Falta: tela do site real (carregar o script do Google só quando vier o 428 ou a chave), simulação no Artifact (caixa "Não sou um robô" sem rede), teste e2e, `docs/MAPA-API-SPRING.md`, prompt vivo e CLAUDE.md.
**Decisões já tomadas:** sem as chaves nada muda (bloqueio em 5 erros); com as chaves, captcha do 6º erro em diante e bloqueio duro só no 12º; a recusa do captcha não conta como senha errada; falha de rede com o Google = recusa (nunca libera).
**Depende do Marcelo:** criar o site no Google reCAPTCHA (v2 caixa), pôr `RECAPTCHA_CHAVE_SITE` e `RECAPTCHA_SEGREDO` no `/opt/agendz/.env` da VPS (segredo nunca no repositório).
**Onde mexe:** Agendz (servidor e telas). O Admin tem login próprio com TOTP: decidir depois se também leva.
**Configurar pelo Admin (pergunta de 28/10: sim, dá):** tela **Segurança do login** no Admin com chave do site, segredo (cifrado no banco do Admin, nunca mostrado de novo, só "trocar") e liga/desliga; o Agendz lê pela rota interna da A3 (cache curto) e cai nas variáveis de ambiente se o Admin estiver fora do ar. Pré-configurado = vem desligado, com o passo a passo na própria tela. Depende da A3. Onde mexe: os dois.


## B5. Relatório de uso do link de agendamento no Admin (pedido de 28/10)
**Para que serve:** o Admin ver, por cliente (loja), quantos links foram enviados e como foi o caminho até o agendamento, para melhorar o processo.
**O que mostrar (só contagens, por loja e por período):**
- links enviados (cada vez que o proprietário ou a equipe usa "Link de agendamento": copiar ou abrir o WhatsApp);
- agendamentos feitos pelo link (origem `link`, já existe) e a taxa sobre os links enviados;
- cancelamentos pelo cliente;
- **abandonos no meio do agendamento e em que etapa** (funil: abriu o link → identificou-se → escolheu serviço → [veículo e porte, só estética] → escolheu data e horário → confirmou). A etapa é a última alcançada antes de sair.
- consulta por cliente (loja) e total da plataforma, com filtro de período e tipo de estabelecimento.
**Como seria:** tabela de eventos `evento_funil` no Agendz (loja, tipo do evento, etapa, código anônimo da visita, hora), gravada pelas rotas públicas e pelo botão do link; **nunca** nome, telefone nem CPF do cliente final (regra do painel: o Admin só vê contagens). Código da visita aleatório, sem ligar a pessoa. Retenção sugerida: 12 meses. O Admin lê por rota interna agregada (`/interno/plataforma/**`); tela **Relatórios** no Admin (suporte vê contagens, nunca valores).
**Dúvidas decididas por mim (avisar):** abandono = visita que passou da abertura e não confirmou em 30 min; "link enviado" conta o uso do botão, não a mensagem entregue.
**Onde mexe: os dois.** Agendz grava (junto da 5e, link do cliente real) e expõe o agregado; Admin mostra. Depende de **A3** e da **5e**; módulos novos já devem nascer gravando evento (junto do log B2).
