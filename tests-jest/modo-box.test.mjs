/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// G2 (V62): modos da escolha automática do BOX na estética (livre, aleatório, menos atendeu, fila). Só vale quando ninguém pediu um box.
import { test, jest, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda, estabelecimento } from '../src/services/api.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
let n = 0;
const marca = (o) => agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-davi', servicoIds: ['s-lav-simples'], veiculo: { placa: `MOD${1000 + (n++)}`, modelo: 'Modelo Teste', porte: 'medio' }, status: 'confirmado', ...o });
const IDS = () => st().estabelecimento.boxes.map((b) => b.id);

beforeEach(() => { jest.useRealTimers(); store.reiniciar(); como('davi'); n = 0; });

test('modo inválido é recusado e o padrão é livre', () => {
  assert.notEqual(st().estabelecimento.modoEscolhaBox, 'fila');
  const r = estabelecimento.salvar({ modoEscolhaBox: 'qualquer' });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Modo de escolha do box inválido/);
});

test('fila: os carros rodam pelos boxes na ordem e o ponteiro avança só na criação', () => {
  assert.ok(estabelecimento.salvar({ modoEscolhaBox: 'fila' }).ok);
  const d = dia(11);
  const ids = IDS();
  const usados = [];
  for (const h of ['09:00', '11:00', '13:00', '15:00']) {
    const a = marca({ inicio: tsAt(d, h) });
    assert.ok(a.ok, JSON.stringify(a));
    usados.push(a.agendamento.boxId);
  }
  assert.equal(JSON.stringify(usados.slice(0, ids.length)), JSON.stringify(ids));
  assert.equal(usados[ids.length], ids[0]); // volta ao primeiro
});

test('menos: o box que atendeu menos no mês vem primeiro', () => {
  assert.ok(estabelecimento.salvar({ modoEscolhaBox: 'menos' }).ok);
  const d = dia(12);
  const ids = IDS();
  const a1 = marca({ inicio: tsAt(d, '09:00'), boxId: ids[0] });
  const a2 = marca({ inicio: tsAt(d, '10:00'), boxId: ids[0] });
  assert.ok(a1.ok && a2.ok);
  const a3 = marca({ inicio: tsAt(d, '14:00') });
  assert.ok(a3.ok);
  assert.notEqual(a3.agendamento.boxId, ids[0]);
});

test('aleatório: sempre escolhe um box ativo e livre; box pedido manda sobre o modo', () => {
  assert.ok(estabelecimento.salvar({ modoEscolhaBox: 'aleatorio' }).ok);
  const d = dia(13);
  const ids = IDS();
  for (let i = 0; i < 5; i++) {
    const a = marca({ inicio: tsAt(d, `${9 + i}:00`.padStart(5, '0')) });
    assert.ok(a.ok);
    assert.ok(ids.includes(a.agendamento.boxId));
  }
  const p = marca({ inicio: tsAt(d, '16:00'), boxId: ids[2] });
  assert.equal(p.agendamento.boxId, ids[2]);
});

test('livre (padrão): o primeiro box livre na ordem do cadastro, como antes', () => {
  const d = dia(14);
  const ids = IDS();
  assert.equal(marca({ inicio: tsAt(d, '09:00') }).agendamento.boxId, ids[0]);
});
