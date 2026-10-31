/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B9c (v132): o dono tira o campo "quem vai fazer o serviço"; o app escolhe quem está com a agenda mais livre (Atender e link do cliente).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, estabelecimento, publico } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { addDays, startOfDay } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { JANELA_DIAS, limitesDoDia, ordemPorFolga, profissionalAutomatico } from '../src/domain/profissional-auto.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const dia = (n = 3) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const H = 3600 * 1000;
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi'); });

const D0 = new Date('2026-10-14T00:00:00-03:00').getTime();
const L = limitesDoDia(D0 + 9 * H);
const ag = (p, h, status = 'confirmado') => ({ profissionalId: p, inicio: D0 + h * H, status });

test('ordem por folga: menos agendamentos no dia; empate → menos na janela de 7 dias; empate → ordem da equipe', () => {
  assert.equal(L.ini, D0); assert.equal(L.fim, addDays(D0, 1)); assert.equal(L.janelaFim, addDays(D0, JANELA_DIAS));
  assert.deepEqual(ordemPorFolga([], ['a', 'b', 'c'], L), ['a', 'b', 'c'], 'sem nada, a ordem da equipe');
  assert.deepEqual(ordemPorFolga([ag('a', 9), ag('a', 10), ag('b', 9)], ['a', 'b', 'c'], L), ['c', 'b', 'a']);
  // empate no dia (1 cada): quem tem menos nos próximos dias vem antes
  const ags = [ag('a', 9), ag('b', 9), ag('a', 24 + 9), ag('a', 48 + 9), ag('b', 24 + 9)];
  assert.deepEqual(ordemPorFolga(ags, ['a', 'b'], L), ['b', 'a']);
  assert.deepEqual(ordemPorFolga(ags, ['b', 'a'], L), ['b', 'a']);
});

test('ordem por folga: cancelado e fora da janela não contam; id de fora da lista é ignorado', () => {
  const ags = [ag('a', 9, 'cancelado'), ag('a', 10, 'cancelado'), ag('b', 9), ag('a', -30), ag('a', 24 * 8 + 9), ag('zzz', 9)];
  assert.deepEqual(ordemPorFolga(ags, ['b', 'a'], L), ['a', 'b']);
  assert.deepEqual(ordemPorFolga(null, ['a'], L), ['a']);
});

test('padrão continua perguntando; só o dono liga, e só com sim/não', () => {
  assert.equal(profissionalAutomatico(st()), false);
  assert.equal(estabelecimento.salvar({ profissionalAutomatico: 'sim' }).ok, false);
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true }).ok);
  assert.equal(profissionalAutomatico(st()), true);
  como('pablo');
  assert.equal(estabelecimento.salvar({ profissionalAutomatico: false }).ok, false, 'profissional não muda a regra');
  assert.equal(profissionalAutomatico(st()), true);
});

test('Atender de agora sem profissional: vai para o mais livre; comissão e agenda ficam com ele', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true }).ok);
  const a1 = agenda.atender({ servicoIds: ['s-lav-simples'] });
  assert.ok(a1.ok, JSON.stringify(a1));
  const p1 = st().agendamentos.find((a) => a.id === a1.agendamento.id).profissionalId;
  const a2 = agenda.atender({ servicoIds: ['s-lav-simples'] });
  assert.ok(a2.ok, JSON.stringify(a2));
  const p2 = st().agendamentos.find((a) => a.id === a2.agendamento.id).profissionalId;
  assert.notEqual(p1, p2, 'o segundo vai para quem ficou com menos');
  assert.ok(st().usuarios.find((u) => u.id === p1).atende);
});

test('Atender futuro: pula quem já está ocupado no horário', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true }).ok);
  const inicio = dia() + 10 * H;
  const primeiro = agenda.atender({ servicoIds: ['s-lav-simples'], inicio, nome: 'Ana', telefone: '(55) 99111-0001' });
  assert.ok(primeiro.ok, JSON.stringify(primeiro));
  const segundo = agenda.atender({ servicoIds: ['s-lav-simples'], inicio, nome: 'Bia', telefone: '(55) 99111-0002' });
  assert.ok(segundo.ok, JSON.stringify(segundo));
  const p = (r) => st().agendamentos.find((a) => a.id === r.agendamento.id).profissionalId;
  assert.notEqual(p(primeiro), p(segundo));
});

test('profissional escolhido por quem lança continua valendo com a regra ligada', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true }).ok);
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: 'u-marcelo' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(st().agendamentos.find((a) => a.id === r.agendamento.id).profissionalId, 'u-marcelo');
});

test('regra desligada: sem profissional continua sendo erro', () => {
  const r = agenda.atender({ servicoIds: ['s-lav-simples'] });
  assert.equal(r.ok, false);
});

test('link do cliente: com a regra ligada a página não pergunta quem e o pedido cai no mais livre', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true, linkAgendamento: { ativo: true, diasMax: 30 } }).ok);
  const d = dia();
  const base = { servicoIds: ['s-lav-simples'], inicio: d + 10 * H };
  const p = publico.pagina ? publico.pagina() : null;
  if (p) assert.equal(p.profissionalAutomatico, true);
  const r1 = publico.agendar({ ...base, nome: 'Ana', telefone: '(55) 99111-0001' });
  assert.ok(r1.ok, JSON.stringify(r1));
  const r2 = publico.agendar({ ...base, nome: 'Bia', telefone: '(55) 99111-0002' });
  assert.ok(r2.ok, JSON.stringify(r2));
  const quem = (r) => st().agendamentos.find((a) => a.id === r.agendamentoId).profissionalId;
  assert.notEqual(quem(r1), quem(r2));
});
