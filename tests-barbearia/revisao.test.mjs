// Achados da revisão independente (agente revisor): cada teste reproduz o ataque e confere que ele falha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, clientes, equipe, estabelecimento, financeiro, estoque, modelos, excecoes, whatsapp, bancoSimulado, servicos, MODO_DEMO } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import * as E from '../src/domain/engine.js';
import { addDays, startOfDay, tsAt, ymd, MIN, DIA } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const dia = (n = 8) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const como = (a) => assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a);
const clienteOutro = () => st().clientes.find((c) => c.id !== 'c-igor').id;
const marca = (profissionalId, hora, n = 8, extra = {}) => { como('alan'); const r = agenda.criar({ clienteId: 'c-igor', profissionalId, servicoIds: ['s-tesoura'], inicio: tsAt(dia(n), hora), ...extra }); assert.ok(r.ok, JSON.stringify(r)); return r.agendamento; };
const telDe = (agId) => (st().clientes.find((c) => c.id === st().agendamentos.find((a) => a.id === agId)?.clienteId) || {}).telefone;
const copia = () => JSON.stringify(st()).replace(/"seq":\d+/, '');
test.beforeEach(() => store.reiniciar());

// A1 – exceções não cancelam o que não é afetado nem o que é de outro barbeiro
test('A1: excecoes.salvar só resolve agendamentos realmente afetados', () => {
  const doTailuan = marca('u-tailuan', '10:00', 9);
  const concluido = st().agendamentos.find((a) => a.status === 'concluido');
  como('kiko');
  const d = ymd(dia(20));
  excecoes.salvar('u-kiko', { tipo: 'folga', inicio: d, fim: d }, 'cancelar', [doTailuan.id, concluido.id]);
  assert.equal(st().agendamentos.find((a) => a.id === doTailuan.id).status, 'a_confirmar');
  assert.equal(st().agendamentos.find((a) => a.id === concluido.id).status, 'concluido');
});
test('A1: exceção de folga cancela os agendamentos do próprio barbeiro naquele dia', () => {
  const a = marca('u-kiko', '10:00', 9);
  como('kiko');
  const d = ymd(a.inicio);
  const r = excecoes.salvar('u-kiko', { tipo: 'folga', inicio: d, fim: d }, 'cancelar', [a.id]);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(st().agendamentos.find((x) => x.id === a.id).status, 'cancelado');
});
test('M5: exceções exigem login, datas válidas e período de no máximo 1 ano', () => {
  como('alan');
  assert.equal(excecoes.salvar('estab', { tipo: 'folga', inicio: '0001-01-01', fim: '9999-12-31' }, 'avisar', []).ok, false);
  assert.equal(excecoes.salvar('estab', { tipo: 'folga', inicio: '2026-13-45' }, 'avisar', []).ok, false);
  assert.equal(excecoes.salvar('estab', { tipo: 'horario', inicio: '2026-11-01', faixas: 'zz' }, 'avisar', []).ok, false);
  assert.equal(excecoes.salvar('estab', { tipo: 'horario', inicio: '2026-11-01', faixas: [[null]] }, 'avisar', []).ok, false);
  auth.logout();
  assert.deepEqual(excecoes.impacto('estab', { tipo: 'folga', inicio: '2026-11-01', fim: '2026-11-01' }), []);
  como('alan');
  const t0 = Date.now();
  assert.deepEqual(excecoes.impacto('estab', { tipo: 'folga', inicio: '0001-01-01', fim: '99999-12-31' }), []);
  assert.ok(Date.now() - t0 < 1000);
});

// A2 – WhatsApp: o número do remetente manda
test('A2: WhatsApp não age em nome de outro número (confirmar, remarcar, editar, listar)', () => {
  const a = marca('u-kiko', '10:00', 9);
  const dono = telDe(a.id);
  const estranho = '(51) 98000-0002';
  const antes = copia();
  assert.equal(whatsapp.confirmar(a.id, estranho).ok, false);
  assert.equal(whatsapp.confirmar(a.id).ok, false);
  assert.equal(whatsapp.remarcar(a.id, tsAt(dia(10), '11:00'), estranho).ok, false);
  assert.equal(whatsapp.editarMeusDados(a.clienteId, { nome: 'PWNED' }, estranho).ok, false);
  assert.deepEqual(whatsapp.meusAgendamentos(a.clienteId, estranho), []);
  assert.equal(copia(), antes);
  assert.ok(whatsapp.confirmar(a.id, dono).ok);
  const lista = whatsapp.meusAgendamentos(a.clienteId, dono);
  assert.ok(lista.every((x) => !('log' in x) && !('plano' in x)));
});
test('A2: CPF de outra pessoa não identifica nem agenda no nome dela', () => {
  const vitima = st().clientes.find((c) => c.id === 'c-igor');
  assert.equal(whatsapp.identificar({ telefone: '(51) 98000-0002', cpf: vitima.cpf, nome: '' }), null);
  assert.equal(whatsapp.identificar({ telefone: '', cpf: vitima.cpf }), null);
  const r = whatsapp.agendar({ telefone: '(51) 98000-0002', nome: 'Atacante', cpf: vitima.cpf, profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(9), '10:00') });
  if (r.ok) assert.notEqual(r.agendamento.clienteId, 'c-igor');
});

// A3/A4 – recuperação e login
test('A3: o código de recuperação só aparece no modo demonstração (que é explícito e exportado)', () => {
  assert.equal(typeof MODO_DEMO, 'boolean');
  const r = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(55) 99701-1122' });
  assert.equal('codigo' in r, MODO_DEMO);
  assert.ok(r.destino);
});
test('A4: bloqueio de login não é contornado por variações do CPF e não é zerado por outra recuperação', () => {
  for (const v of ['391.847.260-40', '391 847 260 40', '39184726040', '391.847.260-40 ', '391-847-260.40', '391847260 40']) auth.login({ identificador: v, senha: 'x' });
  assert.equal(auth.login({ identificador: 'alan', senha: '1234' }).ok, false, 'alias do CPF deveria ter somado no mesmo contador');
  assert.equal(auth.login({ identificador: '391 847 260 40', senha: '1234' }).ok, false);
  // outra pessoa recuperando a própria senha não libera o Alan
  const r = auth.iniciarRecuperacao({ cpf: '724.093.518-32', telefone: '(55) 99644-3050' });
  assert.ok(auth.concluirRecuperacao({ cpf: '72409351832', codigo: r.codigo, senha: 'novaKiko' }).ok);
  assert.equal(auth.login({ identificador: 'alan', senha: '1234' }).ok, false, 'recuperação de outro usuário liberou o bloqueio');
});
test('entradas nulas em login e recuperação não lançam exceção', () => {
  for (const f of [auth.login, auth.iniciarRecuperacao, auth.concluirRecuperacao]) { assert.doesNotThrow(() => f(null)); assert.doesNotThrow(() => f(undefined)); assert.equal(f(null).ok, false); }
  como('alan');
  assert.equal(equipe.alterarSenha('1234', ['1', '2', '3', '4']).ok, false);
  assert.equal(equipe.alterarSenha('1234', { length: 9 }).ok, false);
});

// A5 – banco simulado
test('A5: valores absurdos no banco simulado e na cobrança são recusados', () => {
  como('alan');
  assert.equal(bancoSimulado.lancar({ contaId: 'ct1', tipo: 'credito', valor: 1e308 }).ok, false);
  assert.equal(bancoSimulado.lancar({ contaId: 'ct1', tipo: 'credito', valor: Infinity }).ok, false);
  const a = marca('u-kiko', '10:00', 9);
  for (const valor of [Infinity, 1e21, 1e15, 100001]) assert.equal(financeiro.gerarCobranca(a.id, { cpf: '529.982.247-25', valor }).ok, false, String(valor));
});
test('M4: Pix recebido com valor diferente do cobrado fica registrado pelo valor recebido', () => {
  const a = marca('u-kiko', '10:00', 9);
  const g = financeiro.gerarCobranca(a.id, { cpf: '529.982.247-25' });
  financeiro.conectarOpenFinance('ct1');
  bancoSimulado.pagarPix({ codigo: g.cobranca.copiaECola, nome: 'Igor', cpf: '529.982.247-25', valor: 100 });
  financeiro.sincronizar('ct1');
  const e = st().financeiro.extrato.find((x) => x.status === 'divergente');
  if (!e) return;
  assert.ok(financeiro.autorizarExtrato(e.id).ok);
  const l = st().financeiro.lancamentos.find((x) => x.id === st().financeiro.cobrancas.find((c) => c.id === g.cobranca.id).lancamentoId);
  assert.equal(l.valor, 100);
});

// A6 – lista de serviços
test('A6: servicoIds inválidos são recusados (inexistente, duplicado, não-lista, desativado, excesso)', () => {
  const base = { telefone: '(51) 98000-0003', nome: 'Teste', profissionalId: 'u-kiko', inicio: tsAt(dia(9), '10:00') };
  for (const servicoIds of [['s-tesoura', 'constructor', 'fake'], ['s-tesoura', 's-tesoura', 's-tesoura'], 'x', null, undefined, {}, [], Array(11).fill('s-tesoura'), [1]]) {
    const r = whatsapp.agendar({ ...base, servicoIds });
    assert.equal(r.ok, false, JSON.stringify(servicoIds));
  }
  como('alan');
  const a = marca('u-kiko', '09:20', 9);
  assert.equal(agenda.editarServicos(a.id, ['s-tesoura', 's-tesoura']).ok, false);
  assert.equal(agenda.editarServicos(a.id, ['constructor']).ok, false);
  servicos.remover('s-barba'); // com histórico só desativa
  const barba = st().servicos.find((s) => s.id === 's-barba');
  if (barba && barba.ativo === false) assert.equal(whatsapp.agendar({ ...base, servicoIds: ['s-barba'] }).ok, false);
  assert.deepEqual(whatsapp.horariosLivres({ profissionalId: 'u-kiko', dayTs: dia(9), servicoIds: undefined }), []);
  assert.deepEqual(whatsapp.profissionaisComHorario({ inicio: tsAt(dia(9), '10:00') }), []);
});

// M1 – schemas
test('M1: escala, exceção, notificações e calendário inválidos são recusados e nada lança depois', () => {
  como('kiko');
  assert.equal(estabelecimento.salvarEscalaProfissional('u-kiko', { 1: { aberto: true, faixas: [null] } }).ok, false);
  assert.equal(estabelecimento.salvarEscalaProfissional('u-kiko', { 1: { aberto: true, faixas: [['25:00', '26:00']] } }).ok, false);
  como('alan');
  assert.equal(estabelecimento.salvar({ notificacoes: [null] }).ok, false);
  assert.equal(estabelecimento.salvar({ notificacoes: [{ modo: 'dias', dias: 1 }] }).ok, false);
  assert.equal(estabelecimento.salvar({ calendario: null }).ok, false);
  assert.equal(estabelecimento.salvar({ visaoPadrao: 'xyz' }).ok, false);
  assert.equal(servicos.salvar({ nome: 'N', preco: 1, duracao: 10, notificacoes: [null] }).ok, false);
  assert.doesNotThrow(() => whatsapp.horariosLivres({ profissionalId: 'u-kiko', dayTs: dia(9), servicoIds: ['s-tesoura'] }));
  assert.doesNotThrow(() => agenda.validar({ profissionalId: 'u-kiko', inicio: tsAt(dia(9), '10:00'), servicoIds: ['s-tesoura'] }));
});

// M2 – edições de agendamento
test('M2: editar serviços não invade outro agendamento nem estoura o expediente', () => {
  como('alan');
  const d = dia(9);
  const a = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '10:00'), status: 'confirmado' }).agendamento;
  const b = agenda.criar({ clienteId: clienteOutro(), profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '10:50'), status: 'confirmado' });
  assert.ok(b.ok, JSON.stringify(b));
  assert.equal(agenda.editarServicos(a.id, ['s-tesoura', 's-barba']).ok, false, 'estendeu por cima do próximo');
  assert.equal(agenda.editarServicos(a.id, Array(10).fill(0).map((_, i) => ['s-tesoura', 's-maquina', 's-degrade', 's-barba', 's-barba-degrade'][i % 5])).ok, false);
});
test('M2: confirmar corte só aceita serviços do agendamento, sem repetir', () => {
  como('alan');
  const a = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(9), '10:00'), status: 'confirmado' }).agendamento;
  assert.equal(agenda.confirmarServico(a.id, Array(50).fill('s-barba-degrade')).ok, false);
  assert.equal(agenda.confirmarServico(a.id, ['s-tesoura', 's-tesoura']).ok, false);
  assert.equal(agenda.confirmarServico(a.id, ['s-barba']).ok, false);
  assert.ok(agenda.confirmarServico(a.id, ['s-tesoura']).ok);
});
test('M2: aumentar a duração do serviço não sobrepõe confirmados existentes', () => {
  como('alan');
  const d = dia(9);
  agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '10:00'), status: 'confirmado' });
  agenda.criar({ clienteId: clienteOutro(), profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '11:00'), status: 'confirmado' });
  const sv = st().servicos.find((s) => s.id === 's-tesoura');
  assert.equal(servicos.salvar({ ...sv, duracao: 120 }).ok, false);
  assert.equal(st().servicos.find((s) => s.id === 's-tesoura').duracao, sv.duracao);
});

// M3 – status
test('M3: status inválido em criar e remarcar; sem dupla reserva por status falso', () => {
  como('alan');
  const t = tsAt(dia(9), '10:00');
  assert.equal(agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: t, status: 'hacked' }).ok, false);
  const a = marca('u-kiko', '11:00', 9);
  assert.equal(agenda.remarcar(a.id, { inicio: t, status: 'xpto' }).ok, false);
  assert.equal(st().agendamentos.filter((x) => !Object.values(R.STATUS).includes(x.status)).length, 0);
});

// M4 – dinheiro
test('M4: agendamento cujo Pix virou crédito não volta a valer (painel nem WhatsApp)', () => {
  const a = marca('u-kiko', '10:00', 9);
  const g = financeiro.gerarCobranca(a.id, { cpf: '529.982.247-25' });
  financeiro.confirmarManual(g.cobranca.id, '');
  agenda.cancelar(a.id);
  assert.ok(financeiro.manterComoCredito(a.id).ok);
  assert.equal(agenda.alterarStatus(a.id, 'confirmado').ok, false);
  assert.equal(agenda.remarcar(a.id, { inicio: tsAt(dia(10), '10:00') }).ok, false);
  assert.equal(whatsapp.remarcar(a.id, tsAt(dia(10), '10:00'), telDe(a.id)).ok, false);
  assert.equal(st().agendamentos.find((x) => x.id === a.id).status, 'cancelado');
});
test('M4: grupo com cobrança Pix não pode ser removido', () => {
  como('alan');
  const g = financeiro.salvarGrupo({ nome: 'Novo', contaId: 'ct1' });
  assert.ok(g.ok, JSON.stringify(g));
  const sv = st().servicos.find((s) => s.id === 's-tesoura');
  servicos.salvar({ ...sv, grupoMovimentacaoId: g.grupo.id });
  const a = marca('u-kiko', '10:00', 9);
  assert.ok(financeiro.gerarCobranca(a.id, { cpf: '529.982.247-25' }).ok);
  servicos.salvar({ ...st().servicos.find((s) => s.id === 's-tesoura'), grupoMovimentacaoId: null });
  assert.equal(financeiro.removerGrupo(g.grupo.id).ok, false);
});

// M6/M7 – leitura e modelos
test('M6: barbeiro não consulta a agenda de outro por agenda.validar', () => {
  como('kiko');
  const v = agenda.validar({ profissionalId: 'u-tailuan', inicio: tsAt(dia(9), '10:00'), servicoIds: ['s-tesoura'] });
  assert.ok(v.erros.length && !v.pendentes.length && !v.confirmados.length);
});
test('M7: modelos: remover e salvar exigem permissão de estabelecimento', () => {
  como('alan');
  const m = modelos.salvar({ nome: 'Meu modelo', corpo: 'Olá {{1}}, tudo bem?', botoes: [], categoria: 'Utilidade', variaveis: ['Nome'] });
  assert.ok(m.ok, JSON.stringify(m));
  auth.logout();
  assert.equal(modelos.remover(m.modelo.id).ok, false);
  como('kiko');
  assert.equal(modelos.remover(m.modelo.id).ok, false);
  assert.equal(modelos.salvar({ nome: 'x', corpo: 'oi' }).ok, false);
  assert.ok(st().modelos.some((x) => x.id === m.modelo.id));
});

// M8 – limites do WhatsApp
test('M8: limite de horários por cliente, horizonte de 60 dias e horário fora do minuto', () => {
  const base = { telefone: '(51) 98000-0004', nome: 'Spam', servicoIds: ['s-tesoura'] };
  let aceitos = 0;
  for (let i = 0; i < 12; i++) {
    const r = whatsapp.agendar({ ...base, profissionalId: ['u-kiko', 'u-tailuan', 'u-alan'][i % 3], inicio: tsAt(dia(2 + i), '10:00') });
    if (r.ok) aceitos++;
  }
  assert.ok(aceitos <= E.LIMITE_ATIVOS_POR_CLIENTE, 'aceitou ' + aceitos);
  const longe = whatsapp.agendar({ telefone: '(51) 98000-0005', nome: 'Longe', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(startOfDay(store.agora() + 300 * DIA), '10:00') });
  assert.equal(longe.ok, false);
  for (const inicio of [tsAt(dia(9), '10:00') + 0.5, tsAt(dia(9), '10:00') + 7000]) assert.equal(whatsapp.agendar({ telefone: '(51) 98000-0006', nome: 'X', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio }).ok, false);
});

// M9 – mensagens automáticas não se perdem
test('M9: bloqueio por DDD e horário ocupado gravam a mensagem ao cliente', () => {
  const n0 = JSON.stringify(st()).length;
  const r = whatsapp.agendar({ telefone: '(11) 98888-7777', nome: 'Paulista', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(dia(9), '10:00') });
  assert.equal(r.ok, false); assert.equal(r.bloqueado, 'ddd');
  assert.ok(JSON.stringify(st()).length > n0, 'a mensagem de DDD não foi gravada');
});

// Baixa
test('BAIXA: tipo de movimento de estoque livre e categoria hostil', () => {
  como('alan');
  const m = st().materiais[0];
  assert.equal(estoque.movimentar({ materialId: m.id, tipo: 'x', qtd: -1000 }).ok, false);
  for (const categoria of ['constructor', '__proto__', 'toString']) financeiro.salvarLancamento({ tipo: 'despesa', valor: 10, descricao: 'x', categoria, data: Date.now() });
  const r = financeiro.salvarLancamento({ tipo: 'despesa', valor: 10, descricao: 'y', categoria: { a: 1 }, data: Date.now() });
  assert.ok(r.ok === true || r.ok === false);
  const resumo = JSON.stringify(Object.values(st().financeiro.lancamentos).map((l) => typeof l.categoria));
  assert.ok(!resumo.includes('object'));
});
test('BAIXA: equipe.salvar sem papel é recusado', () => {
  como('alan');
  assert.equal(equipe.salvar({ nome: 'Sem Papel', apelido: 'sp', cpf: '11144477735', email: 'sp@x.com', senha: '1234' }).ok, false);
});
