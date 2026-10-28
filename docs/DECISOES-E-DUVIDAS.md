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
