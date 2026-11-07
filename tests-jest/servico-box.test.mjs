/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// G3 (V63): boxes permitidos por serviço (estética). Vazio = qualquer box; com lista só esses; vários serviços = interseção; o cliente nunca escolhe (o sistema decide).
import { test, jest, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { store, auth, agenda, servicos } from '../src/services/api.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
let n = 0;
const marca = (o) => agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-davi', servicoIds: ['s-lav-simples'], veiculo: { placa: `SBX${1000 + (n++)}`, modelo: 'Modelo Teste', porte: 'medio' }, status: 'confirmado', ...o });
const IDS = () => st().estabelecimento.boxes.map((b) => b.id);
const limitar = (servicoId, boxIds) => { const s = st().servicos.find((x) => x.id === servicoId); const r = servicos.salvar({ id: servicoId, nome: s.nome, preco: s.preco, duracao: s.duracao, precos: s.precos, duracoes: s.duracoes, boxIds }); assert.ok(r.ok, JSON.stringify(r)); };

beforeEach(() => { jest.useRealTimers(); store.reiniciar(); como('davi'); n = 0; });

test('serviço restrito só vai para os boxes permitidos, mesmo com o primeiro livre', () => {
  const [, b2] = IDS();
  limitar('s-lav-simples', [b2]);
  const d = dia(21);
  const a = marca({ inicio: tsAt(d, '09:00') });
  assert.ok(a.ok, JSON.stringify(a));
  assert.equal(a.agendamento.boxId, b2);
  const b = marca({ profissionalId: 'u-pablo', inicio: tsAt(d, '09:00') }); // o único permitido está ocupado: sem outro box, não agenda
  assert.equal(b.ok, false);
  assert.match(b.erros[0], /ocupado/);
});

test('sem restrição (vazio) continua valendo qualquer box e box pedido fora da lista é recusado', () => {
  const [b1, b2] = IDS();
  const d = dia(22);
  assert.equal(marca({ inicio: tsAt(d, '09:00') }).agendamento.boxId, b1);
  limitar('s-lav-simples', [b2]);
  const r = marca({ profissionalId: 'u-pablo', inicio: tsAt(d, '14:00'), boxId: b1 });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /não atende a esses serviços/);
});

test('dois serviços restritos: vale a interseção; sem box em comum não agenda', () => {
  const [b1, b2, b3] = IDS();
  const outro = st().servicos.find((s) => s.id === 's-lav-motor');
  limitar('s-lav-simples', [b1, b2]);
  limitar(outro.id, [b2, b3]);
  const d = dia(23);
  const a = marca({ servicoIds: ['s-lav-simples', outro.id], inicio: tsAt(d, '09:00') });
  assert.ok(a.ok, JSON.stringify(a));
  assert.equal(a.agendamento.boxId, b2);
  limitar(outro.id, [b3]);
  const r = marca({ servicoIds: ['s-lav-simples', outro.id], inicio: tsAt(d, '15:00') });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Nenhum box ativo atende/);
});

test('só o proprietário define os boxes do serviço e só com boxes da loja', () => {
  const s = st().servicos.find((x) => x.id === 's-lav-simples');
  const base = { id: s.id, nome: s.nome, preco: s.preco, duracao: s.duracao, precos: s.precos, duracoes: s.duracoes };
  assert.equal(servicos.salvar({ ...base, boxIds: ['inexistente'] }).ok, false);
  como('pablo');
  servicos.salvar({ ...base, boxIds: [IDS()[0]] });
  assert.deepEqual(st().servicos.find((x) => x.id === s.id).boxIds || [], []);
});
