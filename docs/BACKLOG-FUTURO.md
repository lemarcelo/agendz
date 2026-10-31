# Backlog futuro (ideias pedidas pelo Marcelo, para fazer depois)

Regra de uso: toda funcionalidade nova pedida "para outro momento" entra aqui com **o que é**, **onde mexe** (só Admin, só Agendz, ou os dois) e **dúvidas**. Não implementar antes de a fila principal (`docs/PROMPT-CONTINUACAO.md`) chegar nela, salvo se o Marcelo pedir.

## B0. Planos de serviços (pedido de 29/10 — topo da fila)
**Para que serve:** vender um plano recorrente a um cliente (ex.: lavagem mensal, corte quinzenal): menu **Planos**, onde o proprietário escolhe o **cliente**, o **serviço**, a **recorrência** e o **valor** do plano. **Decisões do Marcelo (29/10, 09:56):** a **cobrança é por mês**; cada mês gera um **valor a receber** pelo pacote (cliente + plano + mês, em aberto até pagar); o pagamento fica informado como **"plano"** (nova forma de pagamento, ao lado de Pix/dinheiro/cartão), e os atendimentos do plano não geram cobrança avulsa.
**Já existe algo parecido?** Não. Existe cupom (desconto por agendamento) e serviço com preço fixo/por porte; nada que repita agendamento nem cobre valor combinado por período.
**Como seria (rascunho):**
- Menu **Planos** (permissão própria; liberável pelo dono). Lista de planos por situação (ativo, pausado, encerrado) e busca por cliente.
- Novo plano: cliente (picker existente) + serviço(s) + recorrência (semanal, quinzenal, mensal, dia/horário preferido e profissional) + **valor do plano** (fixo por ciclo, independente do preço de tabela) + início e término opcional.
- Cada ciclo gera os agendamentos pelo mesmo caminho de hoje (`validarHorario`/`acharConflitos`: horário nunca duplica); o valor do plano entra como `desconto` por `itensDoAgendamento` ou como cobrança do ciclo (decidir), com a comissão sobre o valor realmente cobrado.
- Pausar, retomar, encerrar e remarcar uma ocorrência sem quebrar o plano; histórico do plano.
**Onde mexe:** Agendz (servidor + site real + Artifact). Admin só se virar item de cobrança da plataforma (não é o caso).
**Exemplos de planos do Marcelo (29/10 10:42; cobrança mensal):**
- ✂️ **Plano Degradê em Dia — R$ 75/mês:** 2 cortes degradê + 1 pezinho.
- 💎 **Plano Navalhado Premium — R$ 85/mês:** 2 degradês navalhados + 1 sobrancelha.
- 🧔 **Plano Visual Completo — R$ 125/mês:** 2 cortes degradê + 2 barbas + 1 sobrancelha.
- 👑 **Plano Barbeiro VIP — R$ 165/mês:** 2 degradês navalhados + 2 barbas + 1 pomada de 80 g + prioridade no agendamento.
**Regras pedidas além do cadastro:** (1) o menu **Planos** tem a opção de **mandar o link de planos** para o cliente escolher (página pública com os planos e o valor mensal; pedido entra "a confirmar"); (2) os **horários do plano já ocupam a agenda e têm prioridade** (reservados antes do agendamento avulso; o link comum nunca oferece o horário reservado); (3) **agendamento pelo link com o telefone de um cliente que tem plano ativo conta como corte realizado do plano e reduz o saldo de atendimentos do mês** (cada serviço do plano tem sua cota por mês; ao zerar, cai no preço normal ou avisa); (4) o plano é um **catálogo** (nome, itens com quantidade por mês, valor mensal, produto incluso baixa estoque) e a **assinatura** liga cliente + plano + dia de cobrança; (5) o valor a receber do mês e o pagamento "plano" entram no financeiro.
**Cota mensal (pedido do Marcelo, 29/10 12:10 — resolve a D1):** (a) o que **sobra no mês acumula** para o mês seguinte (a cota do mês que virou soma ao saldo do cliente naquele item); (b) se o cliente **gastar a mais**, o excedente **sai do saldo do próximo mês** (saldo pode ficar negativo; o próximo ciclo começa já descontado); (c) **sempre que passar do limite**, a pessoa que agenda recebe um **aviso depois de salvar** o agendamento (nunca antes: o agendamento não é bloqueado nem atrasado pelo aviso); (d) no agendamento pelo link/atendimento, **depois de informar o telefone**, o servidor faz uma **consulta segura dos atendimentos disponíveis no mês** do plano (só o número restante por item, nunca dados do cliente; telefone sozinho nunca basta para ver dados pessoais, mesma regra do v62: resposta genérica, limite de tentativas, sem dizer de quem é o cadastro). Decisão minha, a registrar na implementação: o saldo é derivado dos atendimentos (sem contador gravado), como o uso de cupom.
**Dúvidas:** D1 (resolvida: o valor é **mensal**, do pacote, com cota de atendimentos por mês; falta definir se o que sobra acumula para o mês seguinte e o que acontece ao zerar a cota) D2 cobrança (Pix/dinheiro) e inadimplência entram junto ou depois do financeiro? D3 o cliente vê o plano no link de agendamento? D4 como fica a comissão (percentual sobre o valor do ciclo dividido pelos atendimentos)?

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

## B3. Poder trocar o domínio (DNS) do Agendz depois (pedido de 28/10; no FIM da fila por pedido de 31/10; parcial no stash `b3-parcial` do agendz-admin)
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

## B6. "Dono" vira "proprietário" e pode haver mais de um (pedido de 30/10 23:35 — só registrado, não implementado)
- **Texto:** trocar "dono" por **proprietário** em tudo que o usuário vê (Artifact, site real, Admin); o identificador interno `papel: 'dono'` pode ficar (decidir na hora; mudar o valor mexe em banco, JWT e testes).
- **Vários proprietários:** hoje o Admin recusa mudar o perfil do proprietário ("a loja precisa ter um proprietário", 409). Passa a valer: pode haver mais de um; o painel deixa promover alguém a proprietário e rebaixar um proprietário **desde que reste ao menos um** (nunca deixar a loja sem proprietário; motivo e linha do tempo). Revisar o que hoje assume "um dono só" (comissão 100% do dono, `ehDono`, assistente de primeiro acesso, recuperação de senha, limite de usuários do Admin).
- **Junto:** ação "Transferir propriedade" no Admin e, no site real, o proprietário poder nomear outro (com senha de novo).

## B7. Link do cliente gerado no Artifact abre a loja errada (relato de 30/10 23:14 — investigando)
- Local (3 lojas) o link sai `#agendar@loja` e abre a loja certa (`tests/e2e34.mjs`). Falta o texto exato do link, a loja de origem e a loja vista pelo cliente; o endereço do Artifact publicado pede login (privado) quando aberto sem sessão.

## B8. Aparelho confiável (login automático no celular) — **FEITO na v125 (31/10)**; sobrou só pedir a senha de novo em ação sensível do proprietário (junto do B6)
- **Pedido otimizado:** manter a **rede confiável** (v120, computador da loja) e acrescentar **aparelho confiável** para o celular: depois de entrar, o site real pergunta "Confiar neste aparelho?"; sim = o servidor emite uma chave longa própria do aparelho e a pessoa continua logada mesmo trocando de Wi-Fi/4G.
- **Regras (propostas, seguir o padrão da v120):** só o **hash** da chave no servidor; prazo definido (365 dias como a rede) e renovado só com uso; máx. 5 aparelhos por pessoa; só logo depois de entrar com a senha (10 min), nunca em sessão de senha temporária; **Sair**, trocar a senha, remover o aparelho, desativar a pessoa e mudar o papel derrubam a chave (`versao`); lista em **Meu perfil** com nome do aparelho (do navegador), último uso e botão remover; ações sensíveis do proprietário (senha, equipe, valores) pedem a senha de novo; sem fatores novos no localStorage além do token do aparelho (mesmo ponto único `ui/real/sessao-rede.js`); recusa é 403, nunca 401.
- **A decidir na hora (sem perguntar):** nome do aparelho (derivado do user-agent, editável), pergunta única por aparelho, convivência com a rede confiável (vale a regra mais permissiva só se o token for de rede; token de aparelho vale em qualquer rede).

## B9. Campos do link, Atender igual ao link e escolha automática do profissional (pedidos de 31/10 07:14 e 07:35 — entram depois de Avaliações, Planos fixos e Push)
- **B9a, campos obrigatórios do link:** passo **"Link do cliente"** no **Reconfigurar**, no **primeiro acesso** e também uma **seção em Estabelecimento** (configurações) para mudar a qualquer hora: nome, telefone e, nos tipos com `usaVeiculo`, placa/modelo/porte/veículo. Todo tipo (estética automotiva, barbearia e os próximos); usa a regra que já existe (`linkAgendamento.nomeObrigatorio|telefoneObrigatorio|veiculoObrigatorio`, V30/V35). Desfazer/Refazer do Reconfigurar devolve os valores anteriores.
- **B9b, Atender na tela do link (Apex):** ao clicar em **Atender**, a tela segue a do agendamento por link da Apex (etapas e campos iguais, mesma lista de serviços/veículo), **exceto a data**: no lugar de "Escolher horário" fica um botão ao lado dizendo **Agora**. Fora Apex: decidir na hora se vale para a barbearia (sem mexer no que já funciona).
- **B9c, escolha automática do profissional:** em Estabelecimento, por loja, o dono pode **tirar o campo "quem vai fazer o serviço"** (Apex e barbearia, qualquer tipo). Com o campo tirado, o app escolhe o profissional que **atende naquele horário** e está com a **agenda mais livre** (menos atendimentos no dia; desempate: menos no período, depois a ordem da equipe). Vale no link do cliente e no Atender; o cliente não vê nem escolhe. Respeita expediente, conflito (`validarHorario`), box, horário fixo reservado e a escala; comissão vai ao profissional escolhido. Padrão: continua escolhendo.
- **Fora:** nada de consultório (nem campos de saúde, convênio ou prontuário).
- **A decidir na hora (sem perguntar):** campo extra por tipo só entra por `vocab`/capacidade, nunca `if (tipo === …)`; padrão do link continua "exige tudo"; a escolha automática nasce nos dois lados (`api.js` e servidor) com casos em `equivalencia/`.
