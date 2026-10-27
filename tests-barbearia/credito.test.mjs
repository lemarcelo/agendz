// Meu crédito no WhatsApp: só existe crédito revisado pelo barbeiro, vale 2 meses, o cliente só gasta o próprio e o que falta é pago separadamente.
// Alterar serviços pelo WhatsApp gera a notificação "Serviços alterados" perguntando se o cliente confirma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, financeiro, whatsapp } from '../src/services/api.js';
import { creditoDoCliente, creditosDoCliente, venceEm } from '../src/domain/financeiro.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { chat } from '../src/services/chat.js';

const st = () => store.getState();
const TEL = '(55) 99711-4020'; // telefone do c-marcelo na semente
const OUTRO = '(51) 98765-4321';
const CPF = '284.510.937-79';
const DIA = 24 * 3600 * 1000;
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const saldo = () => creditoDoCliente(st(), 'c-marcelo', undefined, store.agora());
function solo() { // tira do caminho os horários da semente do cliente
  como('alan');
  for (const o of st().agendamentos.filter((x) => x.clienteId === 'c-marcelo' && ['a_confirmar', 'confirmado'].includes(x.status))) assert.ok(agenda.alterarStatus(o.id, 'cancelado').ok);
}
function marcar(n, hora, servicoIds = ['s-maquina', 's-barba'], profissionalId = 'u-kiko') {
  como('alan');
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId, servicoIds, inicio: tsAt(dia(n), hora), status: 'confirmado' });
  assert.ok(r.ok, JSON.stringify(r));
  return r.agendamento;
}
// Horário de 75 pago por Pix, cancelado, e o barbeiro mantém como crédito.
function comCredito() {
  solo();
  const a = marcar(9, '10:00');
  const c = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  assert.ok(agenda.alterarStatus(a.id, 'cancelado').ok);
  return a;
}
const falar = (t, v) => chat.enviar(t, v);
const ult = () => chat.threadAtual().mensagens.filter((m) => m.de === 'bot').at(-1);
test.beforeEach(() => { store.reiniciar(); chat.reiniciar(); });

test('crédito só aparece para o cliente depois que o barbeiro confirma; antes disso é só pendência', () => {
  const a = comCredito();
  assert.equal(whatsapp.meuCredito('c-marcelo', TEL).total, 0, 'pagamento ainda sem revisão não vira crédito');
  assert.ok(financeiro.acertarValorPago(a.id, 'credito').ok);
  const c = whatsapp.meuCredito('c-marcelo', TEL);
  assert.equal(c.total, 75); assert.ok(c.venceEm > store.agora());
});

test('crédito vale 2 meses: depois disso não aparece, não paga nada e o vencimento fica no histórico', () => {
  const a = comCredito();
  financeiro.acertarValorPago(a.id, 'credito');
  const cr = creditosDoCliente(st(), 'c-marcelo')[0];
  const hoje = new Date(cr.criadoEm); const dois = new Date(venceEm(cr));
  assert.equal((dois.getFullYear() * 12 + dois.getMonth()) - (hoje.getFullYear() * 12 + hoje.getMonth()), 2);
  store.avancar(59 * DIA); // ainda vale
  assert.equal(saldo(), 75);
  store.avancar(5 * DIA); // 64 dias: venceu
  assert.equal(saldo(), 0);
  assert.equal(whatsapp.meuCredito('c-marcelo', TEL).total, 0);
  assert.ok(st().agendamentos.find((x) => x.id === a.id).log.some((l) => /expirou/.test(l.para || '')));
});

test('usar o crédito: cobre o que dá, o resto fica para pagar separadamente e o painel é avisado com o valor que falta', () => {
  const a = comCredito(); financeiro.acertarValorPago(a.id, 'credito');
  const b = marcar(10, '10:00', ['s-maquina', 's-barba', 's-tesoura']); // 115
  assert.equal(whatsapp.aPagar(b.id, TEL), 115);
  const r = whatsapp.usarCredito(b.id, TEL);
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.total, 75); assert.equal(r.falta, 40); assert.equal(r.resta, 0);
  assert.equal(saldo(), 0);
  const av = st().avisosPainel.find((x) => x.tipo === 'credito_usado');
  assert.match(av.texto, /Faltam R\$ 40,00/); assert.match(av.texto, /separadamente/);
  assert.equal(whatsapp.aPagar(b.id, TEL), 40);
  assert.equal(whatsapp.usarCredito(b.id, TEL).ok, false, 'não usa de novo sem crédito');
});

test('crédito sobra quando o horário vale menos que ele; o saldo restante continua com validade', () => {
  const a = comCredito(); financeiro.acertarValorPago(a.id, 'credito');
  const b = marcar(10, '10:00', ['s-barba']); // 35
  const r = whatsapp.usarCredito(b.id, TEL);
  assert.equal(r.total, 35); assert.equal(r.falta, 0); assert.equal(r.resta, 40);
  assert.equal(whatsapp.aPagar(b.id, TEL), 0);
});

test('o cliente nunca cria nem usa crédito sem revisão: sem crédito, de outro número ou de outro cliente, tudo é recusado', () => {
  solo();
  const b = marcar(10, '10:00');
  assert.equal(whatsapp.usarCredito(b.id, TEL).ok, false, 'sem crédito');
  const a = comCredito(); financeiro.acertarValorPago(a.id, 'credito');
  assert.equal(whatsapp.usarCredito(b.id, OUTRO).ok, false, 'outro número');
  assert.equal(whatsapp.usarCredito(b.id, '').ok, false);
  assert.equal(whatsapp.meuCredito('c-marcelo', OUTRO).total, 0, 'outro número não vê o saldo');
  assert.equal(saldo(), 75, 'nada foi gasto');
});

test('horário pago com crédito: cancelar devolve o crédito (a validade original continua valendo)', () => {
  const a = comCredito(); financeiro.acertarValorPago(a.id, 'credito');
  const b = marcar(10, '10:00', ['s-barba']);
  whatsapp.usarCredito(b.id, TEL);
  assert.equal(saldo(), 40);
  assert.ok(whatsapp.cancelar(b.id, TEL).ok);
  assert.equal(saldo(), 75);
});

// ---------- alterar serviços pelo WhatsApp ----------
test('alterar serviços: volta a "a confirmar", envia a notificação "Serviços alterados" com Confirmar/Remarcar/Cancelar e avisa o painel', () => {
  solo();
  const a = marcar(6, '10:00', ['s-maquina']);
  const antes = st().mensagensCliente.length;
  const r = whatsapp.editarServicos(a.id, ['s-maquina', 's-barba'], TEL);
  assert.ok(r.ok, JSON.stringify(r));
  const x = st().agendamentos.find((y) => y.id === a.id);
  assert.equal(x.status, 'a_confirmar'); assert.deepEqual(x.servicoIds, ['s-maquina', 's-barba']);
  const m = st().mensagensCliente[0];
  assert.equal(st().mensagensCliente.length, antes + 1); assert.equal(m.modeloNome, 'Serviços alterados');
  assert.match(m.texto, /Está tudo certo para você\?/); assert.match(m.texto, /R\$ 75,00/);
  assert.deepEqual(m.botoes, ['Confirmar', 'Remarcar', 'Cancelar']);
  assert.match(st().avisosPainel[0].texto, /alterou os serviços/);
  assert.ok(whatsapp.confirmar(a.id, TEL).ok, 'o cliente confirma pelo botão');
});

test('alterar serviços: dentro das 24 h a notificação sai sem Cancelar', () => {
  solo();
  const a = marcar(6, '10:00', ['s-maquina']);
  store.avancar(a.inicio - 10 * 3600 * 1000 - store.agora());
  assert.ok(whatsapp.editarServicos(a.id, ['s-maquina', 's-barba'], TEL).ok);
  assert.deepEqual(st().mensagensCliente[0].botoes, ['Confirmar', 'Remarcar']);
});

test('alterar serviços: recusa outro número, mesma lista, lista vazia/repetida/inexistente, e horário pago com crédito', () => {
  const cr = comCredito(); financeiro.acertarValorPago(cr.id, 'credito');
  const a = marcar(6, '10:00', ['s-barba']);
  assert.equal(whatsapp.editarServicos(a.id, ['s-barba', 's-maquina'], OUTRO).ok, false);
  assert.equal(whatsapp.editarServicos(a.id, ['s-barba'], TEL).ok, false, 'mesmos serviços');
  for (const lista of [[], ['s-barba', 's-barba'], ['zzz'], 'x', null]) assert.equal(whatsapp.editarServicos(a.id, lista, TEL).ok, false);
  assert.ok(whatsapp.usarCredito(a.id, TEL).ok);
  const r = whatsapp.editarServicos(a.id, ['s-barba', 's-maquina'], TEL);
  assert.equal(r.ok, false); assert.match(r.erros[0], /pago com crédito/);
});

test('alterar serviços de horário pago por Pix: valor menor avisa o barbeiro (pago a mais); o cliente não recebe crédito sozinho', () => {
  solo();
  const a = marcar(6, '10:00');
  const c = financeiro.gerarCobranca(a.id, { cpf: CPF }).cobranca;
  assert.ok(financeiro.confirmarManual(c.id, 'ok').ok);
  assert.ok(whatsapp.editarServicos(a.id, ['s-maquina'], TEL).ok);
  assert.equal(saldo(), 0, 'sem crédito antes da revisão');
  assert.ok(st().avisosPainel.some((x) => /pago a mais/i.test(x.texto)));
  assert.equal(whatsapp.meuCredito('c-marcelo', TEL).total, 0);
});

// ---------- conversa ----------
test('chat: "Meu crédito" mostra o saldo e a validade e usa no horário escolhido', () => {
  const a = comCredito(); financeiro.acertarValorPago(a.id, 'credito');
  marcar(10, '10:00', ['s-barba']);
  falar('oi'); falar('credito');
  assert.match(ult().texto, /Seu crédito: R\$ 75,00/); assert.match(ult().texto, /vale até/); assert.match(ult().texto, /2 meses/);
  assert.ok(ult().botoes.some((b) => /^Usar em /.test(b.rotulo)));
  falar('1');
  assert.match(ult().texto, /pago com o seu crédito/); assert.match(ult().texto, /Crédito restante: R\$ 40,00/);
});

test('chat: sem crédito, "Meu crédito" explica; crédito expirado não aparece', () => {
  solo();
  falar('oi'); falar('3');
  assert.match(ult().texto, /não tem crédito/);
  const a = comCredito(); financeiro.acertarValorPago(a.id, 'credito');
  store.avancar(70 * DIA);
  chat.reiniciar(); falar('oi'); falar('credito');
  assert.match(ult().texto, /não tem crédito/);
});

test('chat: alterar serviços mostra antes/depois com o total e só altera depois do "Sim"', () => {
  solo();
  const a = marcar(6, '10:00', ['s-maquina']);
  falar('oi'); falar('2'); // um horário: abre as ações
  falar('alterar');
  assert.match(ult().texto, /Horário de/);
  falar('barba'); falar('continuar');
  assert.match(ult().texto, /Antes: Corte na máquina/); assert.match(ult().texto, /Total: R\$ 75,00/);
  assert.deepEqual(st().agendamentos.find((y) => y.id === a.id).servicoIds, ['s-maquina']);
  falar('1'); // Sim, alterar
  assert.match(ult().texto, /Serviços alterados/);
  assert.deepEqual(st().agendamentos.find((y) => y.id === a.id).servicoIds, ['s-maquina', 's-barba']);
  assert.equal(st().agendamentos.find((y) => y.id === a.id).status, 'a_confirmar');
});

test('chat: depois de agendar com crédito disponível, oferece usar o crédito no novo horário', () => {
  const a = comCredito(); financeiro.acertarValorPago(a.id, 'credito');
  falar('oi'); falar('1'); falar('barba'); falar('continuar');
  falar('1'); // dia
  falar('1'); // hora
  if (/Com qual barbeiro/.test(ult().texto)) falar('1');
  falar('sim');
  assert.match(ult().texto, /Quer usar neste horário\?/);
  assert.ok(ult().botoes.some((b) => b.rotulo === 'Usar meu crédito'));
});
