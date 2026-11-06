/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B2: modos da escolha automática do profissional (livre, aleatório, menos atendeu, fila). Os casos de equivalencia/modo-escolha.json são os MESMOS que
// ModoEscolhaEquivalenciaTest roda no servidor; o resto confere a API simulada (Atender e link do cliente).
import { test, jest, beforeEach, afterEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, agenda, estabelecimento, publico } from '../src/services/api.js';
import { reiniciar } from '../tests/helpers.mjs';
import { addDays, startOfDay } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { MODOS_DE_ESCOLHA, limitesDoModo, modoSaneado, ordenarPorModo } from '../src/domain/modo-escolha.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const dia = (n = 3) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const H = 3600 * 1000;
const equipe = () => st().usuarios.filter((u) => u.atende).map((u) => u.id);
const quem = (r) => st().agendamentos.find((a) => a.id === (r.agendamento ? r.agendamento.id : r.agendamentoId)).profissionalId;
beforeEach(() => { jest.useRealTimers(); jest.useFakeTimers({ doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi'); });
afterEach(() => { jest.restoreAllMocks(); });

// ---- equivalência com o servidor
const modos = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/modo-escolha.json', import.meta.url), 'utf8'));
test('há casos suficientes para valer como contrato', () => assert.ok(modos.casos.length >= 20));
for (const c of modos.casos) {
  test(`modo · ${c.nome}`, () => {
    const limites = { ini: 0, fim: 24 * H, janelaFim: 168 * H, mesIni: (c.mes ? c.mes.ini : -240) * H, mesFim: (c.mes ? c.mes.fim : 480) * H };
    const ags = (c.agendamentos || []).map((a) => ({ profissionalId: a.p, inicio: a.h * H, status: a.cancelado ? 'cancelado' : 'confirmado' }));
    const r = ordenarPorModo(c.modo, c.ids, { agendamentos: ags, limites, ja: c.ja || {}, sorteio: c.sorteio || {}, ponteiro: c.ponteiro ?? null });
    assert.equal(JSON.stringify(r), JSON.stringify(c.esperado));
  });
}

test('modo desconhecido vale o padrão; os quatro modos existem', () => {
  assert.deepEqual(MODOS_DE_ESCOLHA, ['livre', 'aleatorio', 'menos', 'fila']);
  for (const x of ['', 'x', null, undefined, 3, {}, 'FILA']) assert.equal(modoSaneado(x), 'livre', String(x));
  const l = limitesDoModo(new Date('2026-10-14T09:00:00-03:00').getTime());
  assert.ok(l.mesIni <= l.ini && l.fim <= l.mesFim, 'o dia está dentro do mês');
});

// ---- configuração
test('só o proprietário muda o modo, e só para um dos quatro; o ponteiro da fila não se grava por aqui', () => {
  assert.equal(estabelecimento.salvar({ modoEscolha: 'sorteio' }).ok, false);
  assert.equal(estabelecimento.salvar({ modoEscolha: 3 }).ok, false);
  assert.ok(estabelecimento.salvar({ modoEscolha: 'fila' }).ok);
  assert.equal(st().estabelecimento.modoEscolha, 'fila');
  estabelecimento.salvar({ filaProfissional: { 's-lav-simples': 'u-marcelo' } });
  assert.equal(st().estabelecimento.filaProfissional, undefined, 'o ponteiro é do servidor, nunca vem do formulário');
  como('pablo');
  assert.equal(estabelecimento.salvar({ modoEscolha: 'livre' }).ok, false, 'profissional não muda a regra');
  assert.equal(st().estabelecimento.modoEscolha, 'fila');
});

// ---- Atender
test('fila: o atendimento vai para um de cada vez, na ordem da equipe, em círculo', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true, modoEscolha: 'fila' }).ok);
  const eq = equipe();
  assert.ok(eq.length >= 2);
  const vistos = [];
  for (let i = 0; i < eq.length + 1; i++) {
    const r = agenda.atender({ servicoIds: ['s-lav-simples'] });
    assert.ok(r.ok, JSON.stringify(r));
    vistos.push(quem(r));
  }
  assert.deepEqual(vistos, [...eq, eq[0]]);
});

test('fila: o ponteiro é por serviço (outro serviço tem a própria fila) e só avança ao criar', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true, modoEscolha: 'fila' }).ok);
  const eq = equipe();
  const a = agenda.atender({ servicoIds: ['s-lav-simples'] });
  assert.equal(quem(a), eq[0]);
  assert.equal(st().estabelecimento.filaProfissional['s-lav-simples'], eq[0]);
  // consulta de horários do link não mexe no ponteiro
  estabelecimento.salvar({ linkAgendamento: { ativo: true, diasMax: 30 } });
  const antes = JSON.stringify(st().estabelecimento.filaProfissional);
  publico.horarios({ servicoIds: ['s-lav-simples'], dayTs: dia() });
  assert.equal(JSON.stringify(st().estabelecimento.filaProfissional), antes);
});

test('menos atendeu: quem tem menos atendimentos no mês recebe o próximo (cancelado não conta)', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true, modoEscolha: 'menos' }).ok);
  const eq = equipe();
  // o primeiro da equipe fica com 2 atendimentos no mês; o segundo com 1; os demais com 0
  for (let i = 0; i < 2; i++) assert.ok(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: eq[0] }).ok);
  assert.ok(agenda.atender({ servicoIds: ['s-lav-simples'], profissionalId: eq[1] }).ok);
  const r = agenda.atender({ servicoIds: ['s-lav-simples'] });
  assert.ok(r.ok, JSON.stringify(r));
  const esperado = eq.length > 2 ? eq[2] : eq[1];
  assert.equal(quem(r), esperado);
});

test('aleatório: segue o sorteio (menor chave primeiro) entre quem atende', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true, modoEscolha: 'aleatorio' }).ok);
  const eq = equipe();
  const chaves = eq.map((_, i) => (i === 1 ? 0.01 : 0.9)); // o segundo da equipe tira o menor número
  const mock = jest.spyOn(Math, 'random');
  chaves.forEach((c) => mock.mockReturnValueOnce(c));
  const r = agenda.atender({ servicoIds: ['s-lav-simples'] });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(quem(r), eq[1]);
});

test('modos só valem com a escolha automática ligada: desligada, quem lança escolhe e o resto é erro como sempre', () => {
  assert.ok(estabelecimento.salvar({ modoEscolha: 'fila' }).ok);
  assert.equal(agenda.atender({ servicoIds: ['s-lav-simples'] }).ok, false);
  assert.equal(st().estabelecimento.filaProfissional, undefined);
});

// ---- link do cliente
test('link do cliente em fila: os pedidos se revezam e o ponteiro avança na criação', () => {
  assert.ok(estabelecimento.salvar({ profissionalAutomatico: true, modoEscolha: 'fila', linkAgendamento: { ativo: true, diasMax: 30 } }).ok);
  const eq = equipe();
  const d = dia();
  const r1 = publico.agendar({ servicoIds: ['s-lav-simples'], inicio: d + 10 * H, nome: 'Ana', telefone: '(55) 99111-0001' });
  assert.ok(r1.ok, JSON.stringify(r1));
  const r2 = publico.agendar({ servicoIds: ['s-lav-simples'], inicio: d + 14 * H, nome: 'Bia', telefone: '(55) 99111-0002' });
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.equal(quem(r1), eq[0]);
  assert.equal(quem(r2), eq[1], 'o segundo da fila, mesmo com o primeiro livre naquele horário');
  assert.equal(st().estabelecimento.filaProfissional['s-lav-simples'], eq[1]);
});
