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

