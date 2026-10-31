# Decisões tomadas sem confirmação e possíveis dúvidas (28/10)

Lista simples. Cada item está no histórico do `prompt-agendz-regras.md` (v84 a v86) com mais detalhe.

## Decisões que eu tomei
1. **Atender em dia anterior**: pede motivo (5 a 300 letras). Só dono, administrador e recepção lançam; profissional só lança hoje.
2. **Hoje em hora anterior** não pede motivo (é atendimento comum).
3. **Comissão de período já pago** vai para o próximo pagamento; se qualquer participante do atendimento já foi pago, o atendimento todo vai.
4. **Cancelar comissão**: só o dono, com motivo, nunca a já paga; dá para restaurar. O profissional vê o motivo.
5. **Remarcar**: concluído nunca; cancelado só junto com a reativação, conferido no horário novo.
6. **Reconfigurar**: "admin" dentro da loja é o dono (pede a senha dele, vale 30 min). Desfazer **desativa**, não exclui. Só a mais recente se desfaz (30 dias). Sem mudança, não entra no histórico. Senha errada é 403 (401 derrubaria a sessão).
7. **Início (v86)**: depois do dia escolhido aparecem os **próximos 7 dias** com agendamento, agrupados por dia (Hoje, Amanhã, data por extenso), com "Ver mais 7 dias". Cancelados e faltas não entram, a menos que um filtro de status esteja ligado.
8. **Admin**: banco e segredo próprios; token de loja não vale lá; login em etapas (senha, troca da senha temporária, TOTP obrigatório); administradores criados só pelo terminal da VPS.
9. **Serviço próprio no assistente**: nome, categoria, preço e duração (não existe campo "descrição" no serviço); no tipo com preço por porte vale o mesmo preço em todos os portes.
10. **Senhas dos donos** (Alan e Kiko) só depois da agenda real (5c); Davi só depois da agenda da estética.

## Possíveis dúvidas (pode responder quando quiser; sigo com o padrão acima)
- Os próximos agendamentos devem mostrar **7 dias** por vez ou outro período?
- Faltas e cancelados futuros devem aparecer nos próximos (hoje ficam fora)?
- Recepção (atendente) pode cancelar comissão ou só o dono (hoje só o dono)?
- No Admin, o suporte deve poder **desfazer** uma reconfiguração da loja ou só o administrador (hoje: só administrador, ainda a implementar)?
- Serviço precisa de um campo "descrição" de verdade (texto que o cliente vê)? Hoje não existe.
- Prazo de 30 dias para desfazer reconfiguração está bom?

## v87 (28/10): Admin no ar e sem internet
- **Decidi:** sem QR code no autenticador do Admin (npm bloqueado no ambiente; a chave vai em grupos de 4 para digitar no aplicativo).
- **Decidi:** sem internet, a ação espera e segue sozinha ao voltar a conexão (faixa de aviso, cancelável). Só espera quando o aparelho sabe que está offline; resposta perdida com o aparelho online não é reenviada.
- **Dúvida:** fila no aparelho (para a pessoa poder até fechar a página) + chave de repetição no servidor. Recomendo só para Atender e agenda do profissional, depois da fatia 5c; financeiro e Pix nunca reenviam sozinhos.

## v88 (28/10): agenda no site real (5b)
- **Decidi:** o seletor de profissional é uma fila de botões (Todos + um por pessoa), sem a seleção múltipla por gesto da tela simulada; só aparece com mais de um profissional que atende.
- **Decidi:** cancelar pede confirmação na própria tela; o servidor grava o motivo "profissional" (motivo escolhido pelo dono entra junto com a 5d).
- **Decidi:** escala por profissional na tela fica depois da 5c (a rota já existe); a prioridade é o Atender, que libera os logins dos donos.

## v89 (28/10): Atender no site real (5c)
- **Decidi:** o botão Atender do site real vale só para tipos sem veículo/porte (barbearia). A estética não mostra o botão até o veículo e o porte entrarem no Atender real. Isso não atrasa Alan e Kiko; só o Davi espera.
- **Decidi:** campos obrigatórios fixos nos padrões do simulador (agendar pede nome e telefone; atendimento de agora não pede nada). A configuração por loja vem com a 5d.
- **Decidi:** o painel do Atender abre em linha, acima da agenda, em vez de janela; ao salvar, a agenda vai para o dia do novo atendimento.
- **Dúvida (não bloqueia):** o cliente criado só com telefone fica com o telefone como nome até alguém informar um nome (igual ao simulador).

## v90 (28/10): chave de repetição
- **Decidi:** fazer isso antes da 5d, porque com os donos usando o site real um clique repetido depois de uma queda de rede duplicaria o atendimento (e, depois, o dinheiro).
- **Decidi:** a chave vale 7 dias e só existe nas duas rotas que criam atendimento/agendamento; as outras escritas seguem sem reenvio automático.
- **Decidi:** continua sem fila no aparelho: a espera pela internet (v87) mais a chave já evitam perda e duplicação sem guardar nada no aparelho.
- v91: o "canto tampado pelo botão" foi entendido como a lista Serviços realizados da ficha (caixa sem raio e botão colado). Atender (modal e site real) conferidos e sem o problema. Se for outra tela, o Marcelo avisa.

## v98 (28/10): remarcar pelo link e avisos do painel (5e-2)
- **Decidi:** remarcar pelo link exige as mesmas **24 h ou mais** do cancelar (o simulador deixava remarcar até o início). Remarcar é cancelar + pedir de novo, e a loja precisa de tempo.
- **Decidi:** o horário remarcado volta sempre a **a confirmar** (mesmo se estava confirmado) e o histórico registra; a loja decide de novo. O profissional e os serviços não mudam.
- **Decidi:** aviso no painel também para **pedido novo** (o simulador só avisava remarcação e cancelamento). Sem WhatsApp, o painel é o único jeito de a loja saber do pedido.
- **Decidi:** desligar o link bloqueia remarcar (403), mas o cliente continua vendo e cancelando o que já tem.
- **Dúvida (D1 da v97, aberta):** avisar a loja também no WhatsApp quando o canal existir (5e-3).

## v97 (28/10): link do cliente no site real (5e-1)
- **Decidi:** o token de acesso vale para **um agendamento** (não para o cliente todo, como no simulador): quem tem o token de um horário não enxerga os outros do mesmo cliente. A página guarda a lista de tokens no aparelho do cliente (`localStorage`, só neste navegador).
- **Decidi:** nesta fatia **não há código por telefone, lembretes, aviso no painel/WhatsApp nem remarcar**: tudo isso depende do canal de WhatsApp (5e-2/5e-3). Quem perde o aparelho fala com a loja.
- **Decidi:** telefone que já tem cadastro manda e **nenhum dado do cadastro muda** (nem o nome); quem digita no link não é conferido. Número novo vira cliente com origem `link`.
- **Decidi:** loja sem expediente cadastrado **não oferece horário** pelo link (o painel sem expediente não restringe, mas expor a agenda 24 h ao público seria pior).
- **Decidi:** o bloqueio de 5 chaves de cupom erradas é por IP no link (telefone se troca de graça); a lista de limites (telefone, IP, loja) é em memória: reiniciar a API zera as contagens.
- **Decidi:** a estética automotiva fica fora do ar no link real até o servidor pedir veículo e porte; o cartão do dono avisa.
- **Decidi:** o DDD fora da área de atendimento não é conferido (o servidor não guarda os DDDs); entra se o Marcelo quiser.
- **Dúvida (D1):** se o pedido do link deve avisar a loja no WhatsApp assim que existir o canal (hoje a loja vê o pedido "a confirmar" na agenda, origem Link).
- **Resolvida a D3 da v96:** o cliente já aplica cupom pelo link (campo opcional no último passo).

## v96 (28/10): cupom no site real (5d-4c-2)
- **Decidi:** a chave do cupom fica em texto na coluna `cupom.chave`: o proprietário precisa vê-la e reenviá-la; só a seção Estabelecimento a lê e ela nunca vai à agenda, ao histórico ou ao log. O agendamento guarda só a cópia do que o cupom valia.
- **Decidi:** o bloqueio de 5 chaves erradas é por usuário logado (15 min), não por IP; a tentativa errada é gravada em transação independente para sobreviver à recusa.
- **Decidi:** cupom só em agendamento futuro (a confirmar ou confirmado); atendimento feito, concluído ou cancelado não usa. No Atender, chave errada desfaz o agendamento inteiro.
- **Decidi:** `total` da API continua o bruto dos serviços; o líquido é `total − desconto` (+ produtos). A comissão usa `preço − desconto`.
- **Decidi:** cupom já usado não se apaga: "remover" o encerra e ele vai para o histórico (imutável, só serve de modelo).
- **Dúvida (D3):** o cliente aplicar cupom pelo link/WhatsApp depende da porta pública no servidor (ainda não existe); o simulador já tem. Entra junto com ela.

## v95 (28/10): forma de pagamento e regras do Atender (5d-4c-1)
- **Decidi:** a forma de pagamento só fica registrada no atendimento feito; sem financeiro no servidor não há lançamento de receita (entra quando o financeiro real existir).
- **Decidi:** as regras ficam em `configuracao_loja` e a tela delas é um cartão no Início do dono, não uma tela nova.
- **Decidi:** o profissional lê as regras (o formulário precisa do padrão e dos obrigatórios), mas só o dono grava.
- **Decidi:** campo obrigatório vale também para o profissional que lança; o que o formulário já preenche por padrão conta como preenchido.
- **Decidi:** no agendamento futuro a forma de pagamento é ignorada (ainda não foi pago) e nunca pode ser obrigatória.

## v94 (28/10): comissão no site real (5d-4b)
- **Decidi:** sem financeiro no servidor, "pagar comissão" só registra o pagamento (valor, período, quem pagou). A despesa "Comissões" entra quando o financeiro real existir.
- **Decidi:** a conta é por linha (serviço ou produto) e a parte de uma pessoa é o conjunto das linhas dela; "paga" e "cancelada" só valem quando todas as linhas estão assim.
- **Decidi:** o menu Comissões é só do dono; os demais perfis veem "Meus ganhos".
- **Decidi:** não criei JSON de equivalência do cálculo; os testes de integração repetem os números do simulador.
- **Dúvida (D2):** quando a ficha do atendimento existir no site real, adicionar/retirar serviço de atendimento com comissão paga deve ser bloqueado (trava `comissaoJaPaga`). Vale o mesmo bloqueio do simulador?

## v93 (28/10): produtos no Atender real (5d-4a)
- **Decidi:** venda só de produto ocupa 1 minuto na coluna de quem atende (se o vendedor não atende, vai para o primeiro que atende).
- **Decidi:** o estoque pode ficar negativo ao concluir uma venda antiga; a checagem de "estoque insuficiente" é só ao lançar.
- **Decidi:** `total` continua só dos serviços; `totalProdutos` vem à parte e o cartão mostra a soma.
- **Decidi:** produto vendido ou com movimento de estoque nunca é apagado, só desativado.
- **Decidi:** a comissão do produto fica congelada na linha, mas não sai na API da agenda (aparece só no relatório da 5d-4b).

## v92 (28/10): comissão em três níveis e produtos no assistente
- **Decidi (D1):** o assistente sugere produtos do tipo (seis por tipo), tudo desmarcado; o dono marca, ajusta e descreve os próprios.
- **Decidi (D2):** a comissão do funcionário não vale para produtos; o produto tem o percentual dele (vazio = sem comissão), como já era.
- **Decidi:** a etapa Comissão fica antes da Equipe, para a equipe já mostrar "usar a geral (X%)"; Pular não grava nada.
- **Decidi:** o percentual da pessoa é opcional na criação; dá para mudar depois em Equipe.
- **Decidi:** Desfazer devolve a comissão geral de antes (sem valor anterior volta a valer 50%) e desativa os produtos criados, sem excluir.
- **Dúvida (não bloqueia):** produto desativado por um Desfazer pode ser reativado em Estoque; se preferir que Refazer seja o único caminho, é só avisar.

- v100: primeiro acesso: a tela de entrada pede usuário + senha enviada e a redefinição pede só usuário novo + senha definitiva (a enviada fica em memória, `senhaEnviada`), depois entra sozinho no assistente (dono) ou na Agenda. **WhatsApp/Pix não serão configurados agora**: no futuro serão por cliente, via Admin, com as chaves da Meta de cada loja; 5e-3 adiado. Testes: `tests/e2e36.mjs`, `tests/e2e37.mjs`.

- v102: Equipe real aceita senha temporária digitada pelo dono (opcional; temporária, troca no primeiro acesso), a pedido dele; Atender: Quando logo depois de Serviços (Cliente/Veículo antes, por causa do porte).
- v102: a comissão do assistente passou para a Equipe (por pessoa, serviços e produtos); **dúvida:** a comissão **geral** da loja ficou sem tela (vale 50% até existir um campo em Estabelecimento); decidi manter o endpoint e o padrão. Produto: percentual do produto > percentual da pessoa que vende sobre produtos > sem comissão.
- v101: o usuário `suporte` é perfil `admin` (gestor sem ser dono), escondido da equipe da loja e sem poder trocar de nome; "salvo por cliente no Admin" = existe por cliente e aparece na ficha, mas a senha nunca é guardada (só redefinida e mostrada uma vez). **Dúvida (não bloqueia):** se preferir que o `suporte` apareça (somente leitura) na equipe do próprio cliente, é só avisar.
- v107: Suporte sem anexo de imagem (adiado); Admin fora do ar = "O suporte não está disponível agora" (503, nada vaza); resolvido fecha sozinho em 7 dias; cliente que responde reabre resolvido/aguardando; limites 5 chamados e 20 respostas por hora por usuário. **Dúvida:** `INTERNO_CHAVE` precisa estar no `.env` da VPS e o Admin precisa ser reimplantado para criar as tabelas.
- v108: domínio próprio: verificação por botão (sem tarefa periódica); depois de verificado falta o CNAME para `alias.<domínio>`; sem renovação da prova. **Dúvida:** domínio próprio exige plano pago? (regra comercial, ainda em aberto)

## v109 (30/10)
- Horário futuro sem cliente nasce **confirmado** (sem cadastro não há a quem pedir confirmação nem enviar mensagem). Dúvida para o Marcelo: preferir "a confirmar"? Hoje o dono confirma na hora.
- O padrão vazio vale também para a estética; exceção registrada em `docs/EQUIVALENCIA-BARBEARIA.md`.
- Os dois pedidos do link para 02/11 16:30 eram de profissionais diferentes (o servidor do link já era estrito por profissional); o furo real era o cliente via WhatsApp/simulador poder sobrepor um pedido a confirmar, agora fechado.
- Aro do botão do link: `--tema-btn-aro` (cor do degradê com transparência), nunca cor solta.

## v110 (30/10)
- **Digital (passkey):** pede a senha de novo para cadastrar; exige verificação do usuário (`UV`); só atestado `none`. Dúvida para o Marcelo: aceitar também chave de segurança USB sem `UV`? Hoje não.
- **Imagens do chamado:** bytes no banco do Admin (sem disco), 3 por mensagem, 1,5 MB cada. A tela reduz e redesenha como JPEG (tira GPS). Dúvida: liberar PDF? Hoje não (risco de script).
- Telefone do link obrigatório por padrão; a loja pode desmarcar. Aviso de remarcação só quando o horário muda.

## Planos de serviço (v113)
- **Decidi (D2):** cobrança e inadimplência andam juntas: a mensalidade é registrada à mão (pagamento direto com o profissional) e a tela mostra "a receber" do mês; dois meses sem pagar zeram o saldo acumulado.
- **Decidi (D3):** o cliente vê plano e saldo pelo link `#planos` consultando por telefone; resposta genérica, 5 consultas por telefone a cada 15 min, só contagens.
- **Decidi (D4):** comissão sobre preço menos desconto; item coberto pelo plano sai de graça (desconto na linha), então comissiona 0.
- **Decidi:** "plano" não é forma de pagamento (marca `planoUso` no atendimento); passar do saldo é **recusado** (não só avisado); "pausar" é não registrar a mensalidade do mês; plano esgotado cobra o preço normal; um plano aberto por cliente; dívida de plano encerrado trava um novo.
- **Dúvida:** horários fixos do assinante (`MAX_FIXOS`, `DIAS_FIXOS_A_FRENTE`), modelos de plano da barbearia e contar agendamento pelo link como corte ainda não foram feitos.

## v119/v120 (30/10): login automático e box
- **Decidi:** a rede é identificada só pelo servidor, pelo IP público (IPv4 inteiro; IPv6 /64). Nome do Wi-Fi é impossível de ler num site. Efeito: quem troca de internet (4G, outro Wi-Fi, IP que muda) cai em "rede não reconhecida" e o token vale 24 h. **Dúvida para o Marcelo:** se o IP da loja mudar com frequência (operadora), vale oferecer "confiar neste aparelho" (token no aparelho, sem IP)?
- **Decidi:** confiar numa rede exige ter acabado de entrar (10 min) e a rede é a que o servidor vê agora; até 5 redes por pessoa; senha temporária nunca ganha rede confiável.
- **Decidi:** a sessão comum passou de 8 h para 24 h para casar com "fora da rede vale 1 dia"; o token longo dura 365 dias e é derrubado por sair, trocar a senha, remover a rede, desativar a pessoa ou mudar o papel.
- **Decidi:** a digital condicional (campo de usuário) é só um atalho do navegador; a digital continua sem substituir a senha.
- **Decidi:** o assistente de estética ganhou a etapa Boxes (nome livre, padrão "Box 1"); o `concluir` ainda cria 1 box por profissional se o dono pular, para nunca deixar a loja sem box. Sem box ativo: Atender, Link Agenda e página do cliente ficam bloqueados; o aviso só leva ao cadastro se a pessoa for o proprietário.

## v121 (30/10): campos opcionais, inclusive veículo
- **Decidi:** no painel (Atender) nada é obrigatório de fábrica, inclusive veículo/placa/modelo/porte na estética; no link do cliente de fábrica nome, telefone, placa, modelo e porte continuam obrigatórios (cliente anônimo), e o dono desmarca o que quiser.
- **Decidi:** veículo incompleto vale só como "foto" do atendimento; só placa + modelo cadastram o veículo no cliente; sem porte vale o médio. Placa informada é sempre conferida.
- **Decidi:** nome opcional no link sem nome digitado = "Sem nome"; nome de uma letra continua recusado.
- **Dúvida:** o atendimento sem veículo na estética usa o preço do porte médio; talvez o dono prefira exigir o porte (ele marca em Regras).

## v122 (30/10): portes de veículo cadastráveis
- **Decidi:** o Médio é fixo (nome editável, nunca sai nem desativa): é o porte de quem não informa e a base do preço.
- **Decidi:** porte novo sem preço no serviço usa o preço e a duração do Médio, em vez de bloquear a gravação do serviço.
- **Decidi:** porte usado (veículo de cliente ou agendamento) só desativa; desativar com agendamento futuro ativo é recusado.
- ~~Dúvida:~~ preço do porte novo por serviço: **resolvida na v124** (seção "Preço específico por porte" no serviço).

## v123 (30/10): ordem dos serviços
- **Decidi:** padrão "mais usados primeiro" em toda loja; a ordem manual (setas) é o desempate e vale integral no modo "minha ordem".
- **Decidi:** a contagem de uso é calculada na hora a partir dos agendamentos não cancelados (nunca guardada, nunca mostrada ao cliente).
- **Decidi:** a lista de Serviços sempre mostra a ordem manual; "mais usados" só vale onde se escolhe serviço (Atender, agendamento, link).
- ~~Dúvida:~~ janela de 90 dias: **aprovada pelo Marcelo e feita na v124**.

## v124 (30/10): preço = base × fator do porte, preço específico e janela de 90 dias
- **Decidi:** o preço que já estava gravado em cada porte vira **preço específico** (nada muda de valor sozinho); só quem não tem valor num porte passa a usar base × fator.
- **Decidi:** fatores de fábrica: Pequeno 0,9 · Médio 1 · Grande 1,2 · SUV 1,3 · Pickup 1,4; porte novo nasce com 1; faixa 0,10 a 10 com duas casas; Médio fixo em 1.
- **Decidi:** a **duração** não usa fator (é a base); tempo específico por porte continua opcional no serviço.
- **Decidi:** preço específico 0 vale (porte grátis); campo em branco = usa o fator.
- **Decidi:** a prévia no porte lista até 6 serviços ativos e comuns (combo fica de fora) e pesquisa por nome sem acento; mostra "preço específico" quando o serviço tem valor próprio no porte.
- **Decidi:** os 90 dias contam do início do agendamento (o futuro também conta), iguais no Artifact e no servidor.
- **Corrigi (sem relação):** teste de fila de avaliações usava data UTC e falhava depois das 21h (horário de Brasília).

## v125 (31/10): aparelho confiável (login automático no celular)
- **Decidi:** o token do aparelho é assinado e a tabela só guarda "ainda vale" (id, pessoa, nome, datas): sem hash de segredo no banco.
- **Decidi:** Sair e trocar a senha **apagam** o aparelho (mais forte que subir versão): o próximo login pergunta de novo.
- **Decidi:** sem uso por 90 dias o aparelho deixa de valer (cumpre o "renovado só com uso"); o prazo máximo do token é 365 dias.
- **Decidi:** a pergunta continua atrás da caixa "Login automático"; no celular a sugestão é o aparelho, no computador a rede.
- **Decidi:** o nome do aparelho vem do navegador (ex.: "Celular Android · Chrome"); para mudar, remove e inclui de novo.
- **Corrigi (brecha antiga da v120):** senha refeita pelo proprietário, pelo Admin ou pelo suporte não derrubava a rede confiável; agora derruba a rede e os aparelhos.
- **Adiado:** pedir a senha de novo em ação sensível do proprietário quando a sessão é de aparelho; faço junto do B6 (proprietário), com a sua aprovação.
- **Confirmado pelo Marcelo:** DNS coringa `*.agendz.io` já existe.

## v126 (31/10): link do cliente na demonstração leva a loja em `?loja=` e no `#`
- **Relato:** link gerado pelo Artifact da Dalforno (`…frame.claudeusercontent.com/_f/…/#agendar@dalforno`) abria a Apex ao clicar. Não reproduzi: abrindo o mesmo tipo de endereço (origem http, caminho e `#agendar@loja`), a loja certa abre, com ou sem loja salva no navegador e também na troca de hash com a página já aberta. O navegador do app recusou abrir o link real do quadro.
- **Hipótese:** o fragmento (`#`) se perde no caminho (redirecionamento ou quadro do claude.ai) e a página cai na loja padrão.
- **Decisão sem confirmação:** reforçar com `?loja=<slug>` além do `#…@<slug>`; a Apex só aparece se nenhum dos dois chegar. **Em aberto:** se ainda abrir a Apex, preciso saber se o endereço aberto no navegador ainda tem `?loja=` e `#` (copie a barra de endereços da aba aberta).

## v127 (31/10): Avaliações no servidor e no site real
- Estrela do cartão fica num `div.cartao-bloco` (relativo) para ficar no canto do cartão mesmo com o painel aberto.
- Pedir avaliação no site real tem dois toques (Preparar chama o servidor; Abrir no WhatsApp abre a aba sem `await` antes).
- A fila em lote mora dentro de Avaliações no site real (lá não existe a tela Mensagens).
- Admin: a chave de anônimo só vai à loja quando vem no corpo; Admin antigo nunca a desliga sem querer.
- Dúvida: `semMensagens` (cliente não quer mensagens) ainda não tem campo na ficha do cliente real; entra numa próxima.

## v129 (31/10): link da demonstração com `?ir=`
- Causa provável do "abre o login": o quadro do Artifact joga o fragmento fora. Reforço: a página também na busca; volta sozinho do `#` se ele existir (o `#` manda).
- Dúvida aberta: se o quadro também descartar a busca, nada no app resolve; peço ao Marcelo para testar com um link de outra loja (Dalforno) para separar "loja perdida" de "página perdida".
