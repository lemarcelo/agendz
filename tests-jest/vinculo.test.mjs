/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco A (demonstração): serviços por funcionário (A1) e ausência do profissional (A3). Os casos de `realizaTodos` são os mesmos de VinculoEquivalenciaTest (servidor).
import { test, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, agenda, servicos, equipe, ausencias, publico } from '../src/services/api.js';
import { reiniciar } from '../tests/helpers.mjs';
import { addDays, startOfDay, tsAt, MIN, ymd } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import * as V from '../src/domain/vinculo.js';
import * as R from '../src/domain/rules.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const diaUtil = (n = 3) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const cria = (o) => agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], ...o });
const equivalencia = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/vinculo.json', import.meta.url), 'utf8'));

beforeEach(() => { reiniciar(); como('davi'); });

test('A1 equivalência com o servidor: realizaTodos', () => {
  assert.ok(equivalencia.casos.length >= 7);
  for (const c of equivalencia.casos) assert.equal(V.realizaTodos(c.porServico, c.profissional, c.servicos), c.esperado, c.nome);
});

test('A1 padrão: sem lista própria a pessoa realiza todos os serviços (comportamento de antes preservado)', () => {
  assert.equal(V.erroDeVinculo(st(), 'u-pablo', ['s-lav-simples', 's-lav-detalhada']), null);
  const ini = tsAt(diaUtil(), '10:00');
  assert.ok(cria({ inicio: ini }).ok);
});

test('A1 Serviços > Editar: quem não está marcado não pode receber o serviço (mensagem do servidor) e o pedido não grava nada', () => {
  const marcados = st().usuarios.filter((u) => u.atende && u.id !== 'u-pablo').map((u) => u.id);
  const r = servicos.salvar({ id: 's-lav-simples', nome: st().servicos.find((s) => s.id === 's-lav-simples').nome, preco: 40, duracao: 40, profissionalIds: marcados });
  assert.ok(r.ok, JSON.stringify(r));
  const antes = st().agendamentos.length;
  const nega = cria({ inicio: tsAt(diaUtil(), '10:00') });
  assert.equal(nega.ok, false);
  assert.match(nega.erros[0], /Pablo não realiza o serviço /);
  assert.equal(st().agendamentos.length, antes, 'recusado não grava');
  assert.ok(cria({ profissionalId: marcados[0], inicio: tsAt(diaUtil(), '10:00') }).ok, 'quem foi marcado continua recebendo');
});

test('A1 Equipe > Editar e Serviços > Editar mexem nos MESMOS dados', () => {
  const sv = st().servicos.find((s) => s.id === 's-lav-simples');
  const pablo = st().usuarios.find((u) => u.id === 'u-pablo');
  const todos = st().servicos.filter((s) => s.ativo !== false).map((s) => s.id);
  const r = equipe.salvar({ ...pablo, senha: '', servicoIds: todos.filter((id) => id !== sv.id) });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(V.realizaServico(st().usuarios.find((u) => u.id === 'u-pablo'), sv.id), false, 'Equipe tirou o serviço');
  // a mesma informação aparece do lado do serviço
  assert.equal(V.porServicoDoEstado(st())[sv.id].includes('u-pablo'), false);
  assert.ok(servicos.salvar({ id: sv.id, nome: sv.nome, preco: 40, duracao: 40, profissionalIds: ['u-pablo', 'u-davi'] }).ok);
  assert.equal(V.realizaServico(st().usuarios.find((u) => u.id === 'u-pablo'), sv.id), true, 'Serviços devolveu o serviço');
});

test('A1 serviço novo vem marcado para todos; profissional novo realiza todos os serviços', () => {
  const pablo = st().usuarios.find((u) => u.id === 'u-pablo');
  assert.ok(equipe.salvar({ ...pablo, senha: '', servicoIds: ['s-lav-simples'] }).ok); // Pablo passa a ter lista própria
  const novo = servicos.salvar({ nome: 'Serviço extra do teste', preco: 50, duracao: 30 });
  assert.ok(novo.ok, JSON.stringify(novo));
  assert.equal(V.realizaServico(st().usuarios.find((u) => u.id === 'u-pablo'), novo.servico.id), true, 'serviço novo entrou na lista de quem já tinha lista');
  const outro = servicos.salvar({ nome: 'Serviço só do dono', preco: 50, duracao: 30, profissionalIds: ['u-davi'] });
  assert.ok(outro.ok);
  assert.equal(V.realizaServico(st().usuarios.find((u) => u.id === 'u-pablo'), outro.servico.id), false);
  assert.equal(V.realizaServico(st().usuarios.find((u) => u.id === 'u-davi'), outro.servico.id), true);
});

test('A1 só o proprietário muda quem realiza; o link do cliente só mostra quem realiza', () => {
  como('pablo');
  assert.equal(servicos.salvar({ id: 's-lav-simples', nome: 'x', preco: 40, duracao: 40, profissionalIds: [] }).ok, false, 'sem permissão da seção Serviços');
  como('davi');
  assert.ok(servicos.salvar({ id: 's-lav-simples', nome: st().servicos.find((s) => s.id === 's-lav-simples').nome, preco: 40, duracao: 40, profissionalIds: ['u-davi'] }).ok);
  auth.logout();
  const cfg = publico.config();
  const pablo = cfg.profissionais.find((p) => p.id === 'u-pablo');
  assert.ok(pablo && Array.isArray(pablo.servicoIds) && !pablo.servicoIds.includes('s-lav-simples'), 'a página sabe que Pablo não faz esse serviço');
  assert.ok(cfg.profissionais.find((p) => p.id === 'u-davi').servicoIds.includes('s-lav-simples'));
});

// ---------- A3 ausência ----------
const hora = (dia, hm) => tsAt(dia, hm);

test('A3 ausência por horários: bloqueia o agendamento (mesma mensagem do servidor) e libera ao remover', () => {
  const d = diaUtil();
  const r = ausencias.criar('u-pablo', [{ ini: hora(d, '10:00'), fim: hora(d, '12:00') }]);
  assert.ok(r.ok, JSON.stringify(r));
  const nega = cria({ inicio: hora(d, '11:00') });
  assert.equal(nega.ok, false);
  assert.match(nega.erros[0], /Pablo está ausente nesse horário\./);
  assert.ok(cria({ inicio: hora(d, '13:00') }).ok, 'fora da ausência continua livre');
  assert.ok(ausencias.remover(r.ausencias[0].id).ok);
  assert.ok(cria({ clienteId: 'c-igor', inicio: hora(d, '11:00') }).ok, 'depois de remover o horário volta');
});

test('A3 dia inteiro bloqueia todo o expediente do dia; o link do cliente não oferece nenhum horário desse profissional', () => {
  const d = diaUtil(4);
  const r = ausencias.criar('u-pablo', [{ dia: ymd(d) }]);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.ausencias[0].diaInteiro, true);
  for (const hm of ['09:00', '12:00', '16:00']) assert.equal(cria({ inicio: hora(d, hm) }).ok, false, hm);
  assert.deepEqual(R.horariosLivres(st(), { profissionalId: 'u-pablo', dayTs: d, servicoIds: ['s-lav-simples'], agora: store.agora() }), [], 'nenhum horário livre');
});

test('A3 já existe agendamento no período: recusa e lista os conflitos (nada é gravado)', () => {
  const d = diaUtil(5);
  assert.ok(cria({ inicio: hora(d, '10:00') }).ok);
  const antes = (st().ausencias || []).length;
  const r = ausencias.criar('u-pablo', [{ ini: hora(d, '09:00'), fim: hora(d, '12:00') }]);
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Há 1 agendamento nesse período: \d\d\/\d\d 10:00 \(Igor\)\. Remarque ou cancele antes de lançar a ausência\./);
  assert.equal((st().ausencias || []).length, antes);
});

test('A3 permissões: o profissional lança só a própria; o dono lança de qualquer um; a recepção só lê', () => {
  const d = diaUtil(6);
  como('pablo');
  assert.equal(ausencias.criar('u-marcelo', [{ dia: ymd(d) }]).ok, false, 'profissional não lança de outro');
  const minha = ausencias.criar('u-pablo', [{ ini: hora(d, '10:00'), fim: hora(d, '11:00') }]);
  assert.ok(minha.ok);
  como('davi');
  assert.ok(ausencias.criar('u-marcelo', [{ dia: ymd(addDays(d, 1)) }]).ok, 'dono lança de qualquer um');
  como('pablo');
  assert.equal(ausencias.listar({}).ausencias.every((x) => x.profissionalId === 'u-pablo'), true, 'profissional só enxerga as próprias');
  assert.equal(ausencias.remover(st().ausencias.find((x) => x.profissionalId === 'u-marcelo').id).ok, false, 'não remove a de outro');
  assert.ok(ausencias.remover(minha.ausencias[0].id).ok);
});

test('A3 entrada inválida: sem intervalo, fim antes do início, no passado, longa demais e dia mal escrito', () => {
  const d = diaUtil();
  for (const ruim of [[], [{ ini: hora(d, '12:00'), fim: hora(d, '10:00') }], [{ ini: store.agora() - 5 * 86400000, fim: store.agora() - 4 * 86400000 }],
    [{ ini: hora(d, '10:00'), fim: hora(d, '10:00') + 40 * 86400000 }], [{ dia: '2026/13/45' }], [null], 'texto']) {
    assert.equal(ausencias.criar('u-pablo', ruim).ok, false, JSON.stringify(ruim));
  }
  assert.equal(ausencias.criar('u-inexistente', [{ dia: ymd(d) }]).ok, false);
});

test('A3 ausência tem o mesmo peso no cálculo de ocupação: remarcar para dentro dela também é recusado', () => {
  const d = diaUtil(7);
  const ag = cria({ inicio: hora(d, '15:00') });
  assert.ok(ag.ok);
  assert.ok(ausencias.criar('u-pablo', [{ ini: hora(d, '10:00'), fim: hora(d, '12:00') }]).ok);
  const r = agenda.remarcar(ag.agendamento.id, { inicio: hora(d, '11:00') });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /ausente/);
});
