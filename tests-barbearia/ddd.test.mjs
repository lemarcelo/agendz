// Bloqueio por DDD: não se contorna com encaixe, campos extras nem número de outro país cujo código coincide com um DDD atendido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, whatsapp, estabelecimento } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const tenta = (telefone, extra = {}) => whatsapp.agendar({ profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(), '10:00'), nome: 'Teste', telefone, ...extra });
test.beforeEach(() => store.reiniciar());

test('DDD fora da área é bloqueado, com ou sem encaixe, status ou origem extras', () => {
  for (const extra of [{}, { encaixe: true }, { encaixe: true, origem: 'painel', status: 'confirmado' }]) {
    const n = st().clientes.length, a = st().agendamentos.length;
    const r = tenta('5511988887777', extra);
    assert.equal(r.ok, false); assert.equal(r.bloqueado, 'ddd');
    assert.equal(st().clientes.length, n); assert.equal(st().agendamentos.length, a);
  }
  assert.ok(st().mensagensCliente.some((m) => m.modeloId === 'm-ddd' && m.telefone === '5511988887777'), 'o cliente recebe a mensagem de número fora da área');
});

test('números do RS passam, com e sem código do país e com o 9 inicial', () => {
  for (const tel of ['5554996338812', '(54) 99633-8812', '+55 51 98888-7777', '555333221100']) assert.ok(R.dddDe(tel) > 0 && st().estabelecimento.ddds.includes(R.dddDe(tel)), tel);
  assert.equal(tenta('5554988776655').ok, true);
});

test('número de outro país cujo código coincide com um DDD atendido (+54, +51, +53) é bloqueado', () => {
  const estrangeiros = ['5491123456789', '+54 9 11 2345-6789', '0054 9 11 2345 6789', '541123456789', '51987654321012', '5411234567890'];
  for (const tel of estrangeiros) {
    assert.ok(Number.isNaN(R.dddDe(tel)), `${tel} deveria não ter DDD brasileiro`);
    const r = tenta(tel);
    assert.equal(r.ok, false, tel); assert.equal(r.bloqueado, 'ddd', tel);
  }
  assert.equal(whatsapp.dddPermitido('5491123456789'), false);
});

test('outros países continuam bloqueados (+1, +351, +598)', () => {
  for (const tel of ['15415550123', '351912345678', '59899123456']) assert.equal(tenta(tel).bloqueado, 'ddd', tel);
});

test('proprietário pode liberar um DDD novo e ele passa a valer só para números brasileiros', () => {
  assert.ok(auth.login({ identificador: 'alan', senha: '1234' }).ok);
  const antes = st().estabelecimento.ddds;
  // `ddds` guarda números, como no cadastro do estabelecimento
  assert.ok(estabelecimento.salvar({ ddds: [...antes, 11] }).ok);
  auth.logout();
  assert.equal(tenta('5511988887777').ok, true);
  assert.equal(tenta('1198765432101').ok, false, 'número de outro país (13 dígitos sem 55) com "11" no começo não vale');
});

test('o painel (equipe) continua podendo cadastrar e agendar cliente de qualquer DDD: o bloqueio é só do WhatsApp', () => {
  assert.ok(auth.login({ identificador: 'alan', senha: '1234' }).ok);
  const c = st().clientes[0];
  assert.ok(agenda.criar({ clienteId: c.id, profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(), '15:00'), encaixe: true }).ok);
});
