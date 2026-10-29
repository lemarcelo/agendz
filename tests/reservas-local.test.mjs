/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Horários guardados no navegador do cliente: expiram pelo próprio horário, levam nome e telefone só enquanto houver horário, e lixo do navegador é descartado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adicionarReserva, lerReservas, limparReservas, removerReserva, sincronizarReservas, MAX_RESERVAS } from '../src/domain/reservas-local.js';

const H = 3600000;
const AGORA = Date.parse('2026-10-29T13:00:00Z');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n, deltaH, extra = {}) => ({ id: id(n), inicio: AGORA + deltaH * H, fim: AGORA + deltaH * H + 0.75 * H, servicos: ['Corte'], profissional: 'Alan', ...extra });
const CLI = { nome: 'Bruno Lima', telefone: '(11) 99999-0001' };

test('o horário que já terminou some; o que está em andamento ainda vale', () => {
  const r = limparReservas({ cliente: CLI, itens: [item(1, -2), item(2, -0.5), item(3, 5)] }, AGORA);
  assert.deepEqual(r.itens.map((x) => x.id), [id(2), id(3)], 'termina às 13:15 então ainda vale; o das 11h já passou');
  assert.deepEqual(r.cliente, CLI);
});

test('sem nenhum horário, nome e telefone também somem', () => {
  const r = limparReservas({ cliente: CLI, itens: [item(1, -3)] }, AGORA);
  assert.deepEqual(r, { cliente: null, itens: [] });
  assert.deepEqual(limparReservas({ cliente: CLI, itens: [] }, AGORA), { cliente: null, itens: [] });
});

test('adicionar guarda o cliente e ordena por data; repetir o mesmo horário não duplica', () => {
  let d = adicionarReserva(null, { item: item(1, 30), cliente: CLI }, AGORA);
  d = adicionarReserva(d, { item: item(2, 5), cliente: CLI }, AGORA);
  d = adicionarReserva(d, { item: item(2, 6), cliente: CLI }, AGORA);
  assert.deepEqual(d.itens.map((x) => x.id), [id(2), id(1)]);
  assert.equal(d.itens[0].inicio, AGORA + 6 * H, 'o mesmo id é substituído');
  assert.deepEqual(d.cliente, CLI);
});

test('remover o último horário apaga também o cliente', () => {
  let d = adicionarReserva(null, { item: item(1, 5), cliente: CLI }, AGORA);
  d = removerReserva(d, id(1), AGORA);
  assert.deepEqual(d, { cliente: null, itens: [] });
});

test('sincronizar: remarcado muda a data, cancelado ou concluído sai', () => {
  let d = adicionarReserva(null, { item: item(1, 5), cliente: CLI }, AGORA);
  d = adicionarReserva(d, { item: item(2, 8), cliente: CLI }, AGORA);
  const novo = AGORA + 20 * H;
  d = sincronizarReservas(d, [{ id: id(1), inicio: novo, fim: novo + H, ativo: true }, { id: id(2), inicio: AGORA + 8 * H, ativo: false }], AGORA);
  assert.deepEqual(d.itens.map((x) => [x.id, x.inicio]), [[id(1), novo]]);
});

test('lixo do navegador: JSON quebrado, tipos errados, id ruim, texto enorme, muitos itens', () => {
  assert.deepEqual(lerReservas('{quebrado', AGORA), { cliente: null, itens: [] });
  assert.deepEqual(lerReservas(null, AGORA), { cliente: null, itens: [] });
  assert.deepEqual(lerReservas('"texto"', AGORA), { cliente: null, itens: [] });
  const sujo = { cliente: { nome: 'N'.repeat(500), telefone: 123 }, itens: [{ id: 'x', inicio: AGORA + H }, { id: id(1), inicio: 'amanhã' }, { id: id(2), inicio: AGORA + H, fim: 1, servicos: ['S'.repeat(500), 5, null], profissional: 'P'.repeat(500), extra: 'x' }] };
  const r = limparReservas(sujo, AGORA);
  assert.equal(r.itens.length, 1); assert.equal(r.itens[0].fim, AGORA + H + 30 * 60000, 'fim ruim: 30 min depois do início');
  assert.equal(r.itens[0].servicos[0].length, 120); assert.equal(r.itens[0].profissional.length, 80); assert.ok(!('extra' in r.itens[0]));
  assert.equal(r.cliente.nome.length, 60); assert.equal(r.cliente.telefone, '123');
  const muitos = { itens: Array.from({ length: 80 }, (_, i) => item(i + 1, i + 1)) };
  assert.equal(limparReservas(muitos, AGORA).itens.length, MAX_RESERVAS);
});
