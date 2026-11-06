// Bloco B1b (barbearia): #agendar com profissional por serviço. Corte de tesoura só com o Kiko + Barba só com o Tailuan: só os horários em que a SEQUÊNCIA cabe
// (o primeiro serviço no horário do Kiko, o seguinte no do Tailuan logo depois); o pedido cria um agendamento por profissional, ligados pelo mesmo grupo.
import { test, jest, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda, servicos, publico } from '../src/services/api.js';
import { addDays, startOfDay, MIN } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok); };
const dia = (n = 3) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const tel = (i) => `(51) 9${String(8100 + i).padStart(4, '0')}-${String(2000 + i).padStart(4, '0')}`;
const SV = ['s-tesoura', 's-barba'];
const ATR = { 's-tesoura': 'u-kiko', 's-barba': 'u-tailuan' };
const nomeDe = (id) => st().servicos.find((s) => s.id === id).nome;

beforeEach(() => {
  jest.useRealTimers();
  jest.useFakeTimers({ doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], now: new Date('2026-10-12T07:00:00-03:00') });
  store.reiniciar(); como('alan');
  // A1: tesoura só com o Kiko; barba só com o Tailuan
  assert.ok(servicos.salvar({ id: 's-tesoura', nome: nomeDe('s-tesoura'), preco: 40, duracao: 40, profissionalIds: ['u-kiko'] }).ok);
  assert.ok(servicos.salvar({ id: 's-barba', nome: nomeDe('s-barba'), preco: 35, duracao: 40, profissionalIds: ['u-tailuan'] }).ok);
  auth.logout();
});

test('B1b sem atribuições, serviços de pessoas diferentes não têm horário (nenhum profissional faz os dois): é o problema que a atribuição resolve', () => {
  assert.deepEqual([...publico.horarios({ servicoIds: SV, dayTs: dia() })], []);
});

test('B1b com atribuições: só os horários em que a sequência inteira cabe, no nome do profissional do primeiro serviço', () => {
  const d = dia();
  const h = publico.horarios({ servicoIds: SV, dayTs: d, atribuicoes: ATR });
  assert.ok(h.length > 0, 'há horários');
  assert.ok(h.every((x) => x.profissionalId === 'u-kiko'), 'o horário é o do primeiro serviço (Kiko)');
  const dias = publico.diasLivres({ servicoIds: SV, de: d, dias: 3, atribuicoes: ATR });
  assert.ok(dias.length >= 1);
});

test('B1b o horário do SEGUNDO profissional também conta: ocupado o Tailuan logo depois, aquele início some', () => {
  const d = dia(4);
  const antes = publico.horarios({ servicoIds: SV, dayTs: d, atribuicoes: ATR });
  const alvo = antes.find((x) => x.inicio);
  assert.ok(alvo);
  como('alan');
  // ocupa o Tailuan exatamente quando a barba começaria (a tesoura dura 40 min)
  assert.ok(agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-tailuan', servicoIds: ['s-barba'], inicio: alvo.inicio + 40 * MIN, status: 'confirmado' }).ok);
  auth.logout();
  const depois = publico.horarios({ servicoIds: SV, dayTs: d, atribuicoes: ATR });
  assert.equal(depois.some((x) => x.inicio === alvo.inicio), false, 'o horário em que o segundo profissional está ocupado sumiu');
});

test('B1b o pedido cria um agendamento por profissional, em sequência, ligados pelo mesmo grupo; vem a lista das partes', () => {
  const d = dia(5);
  const h = publico.horarios({ servicoIds: SV, dayTs: d, atribuicoes: ATR })[0];
  const r = publico.agendar({ nome: 'Cliente Sequência', telefone: tel(1), servicoIds: SV, atribuicoes: ATR, inicio: h.inicio });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.partes.length, 2);
  const lista = st().agendamentos.filter((a) => a.grupoId && a.grupoId === st().agendamentos.find((x) => x.id === r.agendamentoId).grupoId).sort((x, y) => x.inicio - y.inicio);
  assert.equal(lista.length, 2);
  assert.equal(JSON.stringify(lista.map((a) => a.profissionalId)), JSON.stringify(['u-kiko', 'u-tailuan']));
  assert.equal(JSON.stringify(lista.map((a) => a.servicoIds)), JSON.stringify([['s-tesoura'], ['s-barba']]));
  assert.equal(lista[1].inicio, lista[0].inicio + 40 * MIN, 'o segundo começa quando o primeiro termina (a duração soma)');
  assert.ok(lista.every((a) => a.origem === 'link' && a.clienteId === lista[0].clienteId));
});

test('B1b tudo ou nada: se o segundo profissional não cabe no horário, nenhum agendamento é gravado', () => {
  const d = dia(6);
  const h = publico.horarios({ servicoIds: SV, dayTs: d, atribuicoes: ATR })[0];
  como('alan');
  assert.ok(agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-tailuan', servicoIds: ['s-barba'], inicio: h.inicio + 40 * MIN, status: 'confirmado' }).ok);
  auth.logout();
  const antes = st().agendamentos.length;
  const r = publico.agendar({ nome: 'Cliente Corrida', telefone: tel(2), servicoIds: SV, atribuicoes: ATR, inicio: h.inicio });
  assert.equal(r.ok, false);
  assert.equal(st().agendamentos.length, antes, 'nada gravado');
});

test('B1b atribuição inválida: falta um serviço, ou o profissional não faz o serviço', () => {
  const h = publico.horarios({ servicoIds: SV, dayTs: dia(), atribuicoes: ATR })[0];
  assert.equal(publico.agendar({ nome: 'Fulano Teste', telefone: tel(3), servicoIds: SV, atribuicoes: { 's-tesoura': 'u-kiko' }, inicio: h.inicio }).ok, false, 'falta o profissional da barba');
  const errado = publico.agendar({ nome: 'Fulano Teste', telefone: tel(4), servicoIds: SV, atribuicoes: { 's-tesoura': 'u-tailuan', 's-barba': 'u-kiko' }, inicio: h.inicio });
  assert.equal(errado.ok, false, 'o Tailuan não faz a tesoura e o Kiko não faz a barba');
});

test('B1b um profissional só nas atribuições = pedido de sempre (um agendamento, sem grupo)', () => {
  const unico = { 's-tesoura': 'u-kiko', 's-barba': 'u-kiko' };
  // volta o Kiko a fazer a barba para este caso
  como('alan');
  assert.ok(servicos.salvar({ id: 's-barba', nome: nomeDe('s-barba'), preco: 35, duracao: 40, profissionalIds: ['u-kiko', 'u-tailuan'] }).ok);
  auth.logout();
  const h = publico.horarios({ servicoIds: SV, dayTs: dia(7), atribuicoes: unico })[0];
  const r = publico.agendar({ nome: 'Cliente Unico', telefone: tel(5), servicoIds: SV, atribuicoes: unico, inicio: h.inicio });
  assert.ok(r.ok, JSON.stringify(r));
  const a = st().agendamentos.find((x) => x.id === r.agendamentoId);
  assert.equal(a.grupoId, undefined);
  assert.equal(a.servicoIds.length, 2);
});
