---
name: agendz-regras-e-seguranca
description: Use ao mudar regras da agenda do Agendz (conflito, status, tipos, veículo/porte/box, notificações, DDD, escalas, estoque, comissão, link do cliente) ou ao revisar segurança, IDOR e isolamento entre lojas.
---

# Regras da agenda e segurança do Agendz

Fonte da verdade: `/home/claude/prompt-agendz-regras.md`. **Leia a seção antes de mexer** e mantenha código e prompt iguais. Domínio em `/home/claude/agendz/src/domain` (`rules.js`, `engine.js`, `publico.js`, `schedule.js`, `tipos.js`, `tenant.js`, `financeiro.js`, `comissao.js`…). A tela nunca é a defesa: **a API confere tudo**.

## Tipos de estabelecimento (capacidades, não `if`)
- Capacidades: `usaVeiculo`, `precoPorPorte`, `usaRecursoFisico`, `multiDia`, `prontoParaRetirada`. Estética liga todas; barbearia desliga todas (preço e duração no serviço). Sem a capacidade, a API **descarta** os campos (`permitidos`): veículo (`veiculoId, veiculo, placa, marca, modelo, cor, porte`) e box (`boxId, boxes`); andamento/pronto é recusado.
- O tipo é definido na **criação** e nunca muda (nem dono, nem admin; `estabelecimento.salvar` recusa e não grava nada; a tela mostra só leitura).
- A loja vem do **endereço** (`domain/tenant.js`); nunca de campo do corpo. Endereço desconhecido = "Loja não encontrada", jamais loja padrão.

## Pontos que mais quebram
- **Conflito:** janela ocupada = duração + intervalo, no profissional **e no box** (estética); só ativos ocupam; confirmados nunca se sobrepõem; pendentes sobrepostos têm aviso; quem confirma primeiro fica (os pendentes conflitantes viram cancelados por `conflito` com oferta de remarcar); reativar exige horário e box livres. Toda criação, remarcação, reativação e edição passa por `validarHorario`/`acharConflitos`; atendimento local usa `boxId: null`.
- **Estética:** placa antiga/Mercosul só por formato (`limparVeiculo`); preço/duração por porte via `servicoNoPorte`/`servicosPorIds` (nunca `s.preco` direto), congelados no agendamento; vários dias consomem blocos de trabalho e ocupam o box até a retirada; combo usa `componentes`; "Pronto para retirada" avisa o cliente uma vez só (`PRAZO_RETIRADA_MS` 24 h), com desfazer.
- **Status:** 4 status + "Cliente agendou" (visual) + marcadores `emServico`/`pronto`; status à mão grava `statusManual`; conclusão automática no `tick`.
- **Notificações:** o status define a notificação; lista do serviço substitui a do estabelecimento; até 10 por nível; sem notificação na criação; mensagens usam o nome da loja do tenant.
- **Escalas/exceções:** por estabelecimento e por profissional; mostre os agendamentos afetados ao criar exceção. **DDD:** só permitidos (51, 53, 54, 55 por padrão), `telefoneNacional`.
- **Estoque:** material (consumo por serviço, baixa uma vez na conclusão) × produto (vendido, `preco`, `comissaoPct`, `vendedorId`).
- **Comissão:** percentual profissional > serviço > padrão, congelado; período De/Até; trava depois de paga; o profissional nunca vê valor cheio.
- **Link do cliente (`publico.*`):** só horários livres (nunca quem ocupa); token pessoal ou telefone + código; no máximo 3 abertos; cancelar só com 24 h ou mais; lembretes 24 h e 2 h só com aceite. Botão do link abre `wa.me` em aba nova + copia; **nunca** `whatsapp://`.

## Checklist de segurança (toda funcionalidade que mexa em API, cadastro, login, agenda, link ou financeiro)
1. Ação sem login falha sem alterar estado: `exigir(secao)`, `meuAgendamento(id)`, `usuario()`; `publico.*` não tem sessão.
2. **IDOR:** profissional só age no que é dele; WhatsApp e rotas públicas conferem o número/token do remetente, nunca o id enviado.
3. Campos por `pegar(obj, [campos])`; nunca `Object.assign`/spread; `id`, papel, permissões, `boxId`, `precos`, `tipo` e `loja` não vêm do cliente.
4. Números por `finito()` com teto; textos por `limparTexto`; listas com limite; ids por tipo e tamanho; porte inválido ou serviço sem preço é erro, nunca preço zero.
5. Login: 5 erros = 15 min; mesma mensagem para usuário inexistente e senha errada; recuperação 6 dígitos, 30 min, uso único, 5 tentativas; nunca devolver senha (`semUsuarioSenha`).
6. Front: sem `innerHTML`, `eval`, `dangerouslySetInnerHTML`, `alert/confirm/prompt`; links só `https`, `tel:`, `mailto:`, `wa.me`.
7. Segredos só no servidor; CPF completo nunca em lista de aviso (`cpfMascarado`); resposta ao cliente não revela de quem é um cadastro (`GENERICO`).
8. **Não duplicar:** profissional e box nunca em dois confirmados no mesmo horário; Pix pago duas vezes = um crédito; cobrança cancelada não vira paga; acerto nunca passa do pago; crédito nunca passa do saldo; estoque baixa uma vez.
9. **Isolamento entre lojas (Gate 3, F1):** usuário/token da loja A pedindo id da loja B → 404; token A com `Host` da B → 403; `Host` desconhecido → 404; `X-Forwarded-Host` de fora ignorado; arquivo da A no host da B → 404; consulta sem `app.loja_id` devolve zero linhas (RLS). Nenhum dado, link, token, cupom, mensagem ou arquivo atravessa lojas.

## Fluxo
Domínio → `api.js` → tela; teste de domínio do caso novo e do conflito (inclua a operação no fuzz de `tests/conflitos.test.mjs` se mexe em horário, box ou dinheiro); prompt + histórico; `npm run verificar-tudo`. Relate falhas de segurança com: o que acontecia, impacto, correção.
