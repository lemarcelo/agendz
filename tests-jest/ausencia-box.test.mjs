/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ausência do box (G2): o box com folga ou manutenção não recebe carro novo; carro já marcado continua e vem na lista de afetados; recepção lança, esteticista não.
import { test, jest, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda, ausenciasBox } from '../src/services/api.js';
import { addDays, startOfDay, tsAt, HORA } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const vei = (n) => ({ placa: `AUS${1000 + n}`, modelo: 'Modelo Teste', porte: 'medio' });
const marca = (o) => agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-davi', servicoIds: ['s-lav-simples'], veiculo: vei(Math.floor(Math.random() * 8000)), status: 'confirmado', ...o });
const IDS = () => st().estabelecimento.boxes.map((b) => b.id);

beforeEach(() => {
  jest.useRealTimers();
  store.reiniciar();
  como('davi');
});

test('box ausente no dia não recebe carro: o servidor escolhe outro; todos ausentes = sem horário', () => {
  const d = dia(9);
  const [b1, b2, b3] = IDS();
  assert.ok(ausenciasBox.criar(b1, d, d + 24 * HORA, 'manutenção').ok);
  const a = marca({ inicio: tsAt(d, '10:00') });
  assert.ok(a.ok, JSON.stringify(a));
  assert.notEqual(a.agendamento.boxId, b1);
  assert.ok(ausenciasBox.criar(b2, d, d + 24 * HORA).ok);
  assert.ok(ausenciasBox.criar(b3, d, d + 24 * HORA).ok);
  const r = marca({ profissionalId: 'u-pablo', inicio: tsAt(d, '10:00') });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /boxes estão ocupados/);
});

test('carro já marcado no box NÃO impede a ausência: ela é gravada e a lista de afetados vem na resposta', () => {
  const d = dia(10);
  const a = marca({ inicio: tsAt(d, '10:00') });
  assert.ok(a.ok);
  const r = ausenciasBox.criar(a.agendamento.boxId, d, d + 24 * HORA);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.afetados.length, 1);
  assert.equal(st().agendamentos.find((x) => x.id === a.agendamento.id).status, 'confirmado');
});

test('remover a ausência libera o box', () => {
  const d = dia(11);
  const [b1, b2, b3] = IDS();
  const ids = [b1, b2, b3].map((b) => ausenciasBox.criar(b, d, d + 24 * HORA).ausencias[0].id);
  assert.equal(marca({ inicio: tsAt(d, '10:00') }).ok, false);
  for (const id of ids) assert.ok(ausenciasBox.remover(id).ok);
  assert.ok(marca({ inicio: tsAt(d, '10:00') }).ok);
});

test('permissão: proprietário e recepção lançam; esteticista não', () => {
  const d = dia(12);
  const [b1] = IDS();
  como('pablo');
  assert.equal(ausenciasBox.criar(b1, d, d + 24 * HORA).ok, false);
  assert.equal(ausenciasBox.remover('nao-existe').ok, false);
});

test('período inválido é recusado (fim antes do início, passado e mais de 31 dias)', () => {
  const d = dia(9);
  const [b1] = IDS();
  assert.equal(ausenciasBox.criar(b1, d + HORA, d).ok, false);
  assert.equal(ausenciasBox.criar(b1, d - 40 * 24 * HORA, d - 39 * 24 * HORA).ok, false);
  assert.equal(ausenciasBox.criar(b1, d, d + 40 * 24 * HORA).ok, false);
});
