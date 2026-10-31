import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, whatsapp, excecoes, servicos, equipe, estabelecimento, clientes, afetadosPorExcecoes } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import { addDays, startOfDay, tsAt, ymd, MIN, HORA, DIA } from '../src/domain/time.js';
import { validarModelo } from '../src/domain/templates.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const proxDiaUtil = (n = 1) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const telDe = (agId) => { const a = st().agendamentos.find((x) => x.id === agId); return (st().clientes.find((c) => c.id === a?.clienteId) || {}).telefone; };
const login = () => auth.login({ identificador: 'alan', senha: '1234' });
const cria = (o) => agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], ...o });
test.beforeEach(() => { store.reiniciar(); login(); });

test('dados de exemplo: um de cada status e uma etiqueta Reagendado', () => {
  const s = st();
  for (const x of ['a_confirmar', 'confirmado', 'concluido', 'cancelado']) assert.ok(s.agendamentos.some((a) => a.status === x), x);
  assert.ok(s.agendamentos.some((a) => a.reagendado));
  assert.ok(s.agendamentos.some((a) => R.statusVisual(a, store.agora()).chave === 'vermelho'));
  assert.equal(s.usuarios.find((u) => u.papel === 'dono').nome, 'Alan Dalforno');
});

test('login por CPF, apelido e e-mail', () => {
  assert.ok(auth.login({ identificador: '391.847.260-40', senha: '1234' }).ok);
  assert.ok(auth.login({ identificador: 'KIKO', senha: '1234' }).ok);
  assert.ok(auth.login({ identificador: 'tailuan@barbeariadalforno.com.br', senha: '1234' }).ok);
  assert.equal(auth.login({ identificador: 'kiko', senha: 'x' }).ok, false);
});

test('recuperação de senha com CPF + telefone', () => {
  assert.equal(auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(11) 1', canal: 'whatsapp' }).ok, false);
  const r = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(55) 99701-1122', canal: 'whatsapp' });
  assert.ok(r.ok);
  assert.equal(auth.concluirRecuperacao({ cpf: '39184726040', codigo: '000', senha: 'nova1' }).ok, false);
  assert.ok(auth.concluirRecuperacao({ cpf: '39184726040', codigo: r.codigo, senha: 'nova1' }).ok);
  assert.ok(auth.login({ identificador: 'alan', senha: 'nova1' }).ok);
});

test('barbeiro vê só a própria agenda', async () => {
  const { agendamentosVisiveis } = await import('../src/services/api.js');
  auth.login({ identificador: 'kiko', senha: '1234' });
  const u = st().usuarios.find((x) => x.id === 'u-kiko');
  assert.ok(agendamentosVisiveis(st(), u).every((a) => a.profissionalId === 'u-kiko'));
});

test('conflito pela janela ocupada (duração + intervalo): 30 min às 10:00 conflita com pendente 10:15', () => {
  const d = proxDiaUtil(8);
  // serviço de 30 min para o teste
  servicos.salvar({ id: 's-tesoura', nome: 'Corte somente tesoura', preco: 40, duracao: 30, intervalo: 0, antecedenciaH: 2, notificacoes: null, confirmacaoServico: null });
  const a = cria({ inicio: tsAt(d, '10:15') });
  assert.ok(a.ok, JSON.stringify(a));
  const v = agenda.validar({ profissionalId: 'u-kiko', inicio: tsAt(d, '10:00'), servicoIds: ['s-tesoura'] });
  assert.equal(v.pendentes.length, 1);
  assert.equal(v.erros.length, 0);
});

test('intervalo do serviço entra na janela ocupada', () => {
  const d = proxDiaUtil(8);
  assert.ok(cria({ inicio: tsAt(d, '10:00') }).ok); // 40 + 10 = 50 min → livre a partir de 10:50
  const v1 = agenda.validar({ profissionalId: 'u-kiko', inicio: tsAt(d, '10:40'), servicoIds: ['s-tesoura'] });
  const v2 = agenda.validar({ profissionalId: 'u-kiko', inicio: tsAt(d, '10:50'), servicoIds: ['s-tesoura'] });
  assert.equal(v1.pendentes.length, 1);
  assert.equal(v2.pendentes.length, 0);
});

test('não permite agendar normal sobre confirmado; encaixe permite e sinaliza', () => {
  const d = proxDiaUtil(8);
  const base = cria({ inicio: tsAt(d, '11:00'), status: 'confirmado' });
  assert.ok(base.ok);
  const r = cria({ inicio: tsAt(d, '11:10'), clienteId: 'c-jon' });
  assert.equal(r.ok, false);
  const e = cria({ inicio: tsAt(d, '11:10'), clienteId: 'c-jon', encaixe: true });
  assert.ok(e.ok);
  assert.equal(e.agendamento.encaixe, true);
  assert.equal(e.avisos.confirmados.length, 1);
});

test('fora do horário do barbeiro não grava, nem como encaixe', () => {
  const d = proxDiaUtil(8);
  assert.equal(cria({ inicio: tsAt(d, '12:30'), encaixe: true }).ok, false);
  assert.equal(cria({ inicio: tsAt(d, '18:30'), encaixe: true }).ok, false); // 40 min passa das 19h
  assert.ok(cria({ inicio: tsAt(d, '18:20'), encaixe: true }).ok);
});

test('quem confirma primeiro fica com o horário; o outro é cancelado e recebe "horário ocupado"', () => {
  const d = proxDiaUtil(9);
  const a = cria({ inicio: tsAt(d, '09:00') }).agendamento;
  const b = cria({ inicio: tsAt(d, '09:20'), clienteId: 'c-jon' }).agendamento;
  const r = whatsapp.confirmar(b.id, telDe(b.id));
  assert.ok(r.ok);
  const aa = st().agendamentos.find((x) => x.id === a.id);
  assert.equal(aa.status, 'cancelado');
  assert.equal(aa.motivoCancelamento, 'conflito');
  assert.ok(st().mensagensCliente.some((m) => m.agendamentoId === a.id && m.modeloNome === 'Horário ocupado'));
  assert.equal(whatsapp.confirmar(a.id, telDe(a.id)).ok, false);
});

test('remarcar pelo cliente marca a etiqueta, registra no log e volta a "a confirmar"', () => {
  const d = proxDiaUtil(9);
  const a = cria({ inicio: tsAt(d, '09:00'), status: 'confirmado' }).agendamento;
  const novo = tsAt(proxDiaUtil(10), '15:00');
  const r = whatsapp.remarcar(a.id, novo, telDe(a.id));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.agendamento.reagendado, true);
  assert.equal(r.agendamento.status, 'a_confirmar');
  const l = r.agendamento.log.find((x) => x.campo === 'data e hora');
  assert.ok(l && l.autor.tipo === 'cliente' && l.de && l.para);
});

test('barbeiro remarca escolhendo status: confirmado não notifica', () => {
  const d = proxDiaUtil(9);
  const a = cria({ inicio: tsAt(d, '09:00') }).agendamento;
  const antes = st().mensagensCliente.length;
  const r = agenda.remarcar(a.id, { inicio: tsAt(d, '15:00'), status: 'confirmado' });
  assert.ok(r.ok);
  assert.equal(r.agendamento.status, 'confirmado');
  assert.equal(r.agendamento.reagendado, true);
  assert.equal(st().mensagensCliente.length, antes);
});

test('sem notificações em nenhum nível: agendamento do WhatsApp nasce confirmado', () => {
  estabelecimento.salvar({ notificacoes: [] });
  const d = proxDiaUtil(9);
  const r = whatsapp.agendar({ telefone: '(54) 99633-8812', nome: 'Igor Filipin', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '10:00') });
  assert.ok(r.ok);
  assert.equal(r.agendamento.status, 'confirmado');
});

test('notificação do serviço substitui a do estabelecimento (maior valor prevalece)', () => {
  const sv = R.servicosPorIds(st(), ['s-barba-degrade', 's-tesoura']);
  servicos.salvar({ id: 's-tesoura', ...st().servicos.find((x) => x.id === 's-tesoura'), notificacoes: [{ id: 'z', modo: 'horas', horas: '05:00', tipo: 'pergunta' }] });
  const e = R.notificacoesEfetivas(R.servicosPorIds(st(), ['s-tesoura', 's-barba']), st().estabelecimento);
  assert.equal(e.origem, 'servico'); // tesoura R$40 > barba R$35
  assert.equal(e.lista.length, 1);
  assert.ok(sv.length === 2);
});

test('plano de notificações: passadas são puladas; a pergunta só sai em horário comercial', () => {
  const d = proxDiaUtil(9);
  const a = cria({ inicio: tsAt(d, '09:00') }).agendamento;
  assert.equal(a.plano.length, 2);
  assert.ok(a.plano.every((p) => p.estado === 'pendente'));
  const agora = store.agora();
  const curto = cria({ inicio: agora + 30 * MIN + (10 - ((agora + 30 * MIN) % (10 * MIN))), clienteId: 'c-jon', profissionalId: 'u-tailuan', encaixe: true });
  if (curto.ok) assert.ok(curto.agendamento.plano.every((p) => p.estado === 'pulada'));
});

test('falta de confirmação: avisa cliente e painel; ao fim do atendimento cancela sozinho', () => {
  const d = proxDiaUtil(2);
  const a = cria({ inicio: tsAt(d, '14:00') }).agendamento;
  store.avancar(d + 14 * HORA + 5 * MIN - store.agora());
  let x = st().agendamentos.find((y) => y.id === a.id);
  assert.ok(x.faltaConfirmacao);
  assert.equal(R.statusVisual(x, store.agora()).chave, 'vermelho');
  assert.ok(st().avisosPainel.some((p) => p.agendamentoId === a.id && p.texto.startsWith('Sem confirmação:')));
  assert.ok(st().mensagensCliente.some((m) => m.agendamentoId === a.id && m.modeloNome.startsWith('Sem confirmação')));
  store.avancar(HORA);
  x = st().agendamentos.find((y) => y.id === a.id);
  assert.equal(x.status, 'cancelado');
  assert.ok(x.log.some((l) => l.autor.tipo === 'sistema' && /Cancelado/.test(l.para)));
});

test('conclusão automática de confirmado; com confirmação de corte espera o barbeiro', () => {
  const d = proxDiaUtil(2);
  const a = cria({ inicio: tsAt(d, '10:00'), status: 'confirmado' }).agendamento;
  const b = cria({ inicio: tsAt(d, '15:00'), status: 'confirmado', profissionalId: 'u-tailuan' }).agendamento;
  estabelecimento.salvar({ confirmacaoServico: true });
  servicos.salvar({ ...st().servicos.find((x) => x.id === 's-tesoura'), confirmacaoServico: false }); // o serviço prevalece
  store.avancar(d + 20 * HORA - store.agora());
  assert.equal(st().agendamentos.find((x) => x.id === a.id).status, 'concluido');
  assert.equal(st().agendamentos.find((x) => x.id === b.id).status, 'concluido');
  const c = cria({ inicio: tsAt(proxDiaUtil(4), '10:00'), status: 'confirmado', servicoIds: ['s-barba'] }).agendamento;
  store.avancar(proxDiaUtil(4) + 20 * HORA - store.agora());
  assert.equal(st().agendamentos.find((x) => x.id === c.id).status, 'confirmado');
  const r = agenda.confirmarServico(c.id, ['s-barba']);
  assert.ok(r.ok);
  assert.equal(r.agendamento.status, 'concluido');
});

test('último atendimento: concluído, senão cancelado, senão primeiro', () => {
  assert.equal(R.ultimoAtendimento(st(), 'c-marcelo').tipo, 'concluido');
  assert.equal(R.ultimoAtendimento(st(), 'c-jon').tipo, 'concluido');
  const novo = clientes.salvar({ nome: 'Fulano', telefone: '(51) 99999-0000' }).cliente;
  assert.equal(R.ultimoAtendimento(st(), novo.id).tipo, 'primeiro');
});

test('folga em dia com agendamentos pede destino; cancelar ou avisar', () => {
  const d = proxDiaUtil(9);
  const a = cria({ inicio: tsAt(d, '09:00') }).agendamento;
  const ex = { tipo: 'folga', inicio: ymd(d), fim: ymd(d), rotulo: 'Folga' };
  const afetados = excecoes.impacto('u-kiko', ex);
  assert.deepEqual(afetados.map((x) => x.id), [a.id]);
  assert.equal(excecoes.impacto('u-tailuan', ex).length, 0);
  excecoes.salvar('u-kiko', ex, 'avisar', [a.id]);
  assert.ok(st().mensagensCliente.some((m) => m.agendamentoId === a.id && m.modeloNome.startsWith('Folga')));
  assert.equal(st().agendamentos.find((x) => x.id === a.id).status, 'a_confirmar');
  excecoes.salvar('u-kiko', { ...ex, inicio: ymd(addDays(d, 1)), fim: ymd(addDays(d, 1)) }, 'cancelar', []);
  assert.equal(cria({ inicio: tsAt(addDays(d, 1), '09:00') }).ok, false);
});

test('feriados vinculados deixam o estabelecimento fechado e avisam o impacto', () => {
  const imp = excecoes.impactoFeriados();
  const r = excecoes.vincularFeriados(true, 'cancelar', imp.map((x) => x.id));
  assert.ok(r.ok);
  assert.ok(st().estabelecimento.escala.excecoes.some((e) => e.origem === 'calendario'));
  assert.equal(faixasDoDia(st().estabelecimento.escala, new Date(2026, 11, 25).getTime()).length, 0);
  excecoes.vincularFeriados(false);
  assert.equal(st().estabelecimento.escala.excecoes.filter((e) => e.origem === 'calendario').length, 0);
});

test('DDD fora do RS é bloqueado; dono pode liberar', () => {
  const d = proxDiaUtil(9);
  const r = whatsapp.agendar({ telefone: '(11) 98888-7777', nome: 'Paulista', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '10:00') });
  assert.equal(r.bloqueado, 'ddd');
  assert.equal(whatsapp.dddPermitido('(11) 98888-7777'), false);
  estabelecimento.salvar({ ddds: [51, 53, 54, 55, 11] });
  assert.equal(whatsapp.dddPermitido('(11) 98888-7777'), true);
});

test('antecedência mínima vale para o WhatsApp, não para o painel', () => {
  const agora = store.agora();
  const t = Math.ceil((agora + 30 * MIN) / MIN) * MIN;
  const v = R.validarHorario(st(), { profissionalId: 'u-kiko', inicio: t, servicoIds: ['s-tesoura'], origem: 'whatsapp', agora });
  assert.ok(v.erros.some((e) => /antecedência/.test(e)) || v.erros.some((e) => /não atende/.test(e)));
});

test('cliente cadastrado pelo WhatsApp: só nome é obrigatório; identificado por telefone + nome', () => {
  const d = proxDiaUtil(9);
  const r = whatsapp.agendar({ telefone: '(51) 98000-1111', nome: 'Beto', profissionalId: 'u-tailuan', servicoIds: ['s-barba'], inicio: tsAt(d, '10:00') });
  assert.ok(r.ok && r.clienteNovo);
  assert.equal(whatsapp.identificar({ telefone: '(51) 98000-1111', nome: 'beto' }).id, r.cliente.id);
  assert.equal(whatsapp.agendar({ telefone: '(51) 98000-2222', nome: '', profissionalId: 'u-tailuan', servicoIds: ['s-barba'], inicio: tsAt(d, '11:00') }).ok, false);
});

test('permissões: admin só vê o que o dono liberou; só o dono cadastra equipe', () => {
  const novo = equipe.salvar({ nome: 'Ana Admin', apelido: 'ana', cpf: '111.444.777-35', email: 'ana@x.com', telefone: '(55) 99111-2222', papel: 'admin', senha: '1234', permissoes: { clientes: true } });
  assert.ok(novo.ok);
  auth.login({ identificador: 'ana', senha: '1234' });
  assert.ok(clientes.salvar({ nome: 'Z', telefone: '(55) 99999-1111' }).ok);
  assert.equal(servicos.salvar({ nome: 'X', preco: 1, duracao: 10 }).ok, false);
  assert.equal(equipe.salvar({ nome: 'Y' }).ok, false);
  assert.equal(estabelecimento.salvar({ nome: 'Z' }).ok, false);
});

test('modelos Meta: variável no início/fim e numeração fora de ordem são recusadas', () => {
  assert.ok(validarModelo('{{1}} chegou').length);
  assert.ok(validarModelo('Olá, seu código é {{1}}').length);
  assert.ok(validarModelo('Olá {{2}} e {{3}} ok').length);
  assert.equal(validarModelo('Olá, {{1}}! Seu horário é {{2}} hoje.').length, 0);
});

test('log guarda de/para, autor e horário', () => {
  const d = proxDiaUtil(9);
  const a = cria({ inicio: tsAt(d, '09:00') }).agendamento;
  agenda.alterarStatus(a.id, 'confirmado');
  agenda.editarServicos(a.id, ['s-barba']);
  const x = st().agendamentos.find((y) => y.id === a.id);
  const l = x.log.filter((e) => e.campo !== 'criação');
  assert.equal(l.length, 2);
  assert.ok(l.every((e) => e.em && e.autor.nome === 'Alan'));
});

test('desativar barbeiro: bloqueia com agendamento futuro; mantém histórico; impede novos', () => {
  const d = proxDiaUtil(9);
  const a = cria({ inicio: tsAt(d, '09:00') }).agendamento; // Kiko, a confirmar
  const r = equipe.definirAtendimento('u-kiko', false);
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /agendamento/);
  agenda.cancelar(a.id);
  // ainda restam os agendamentos de exemplo do Kiko: cancela todos os futuros
  for (const x of st().agendamentos.filter((y) => y.profissionalId === 'u-kiko' && ['a_confirmar', 'confirmado'].includes(y.status) && y.inicio > store.agora())) agenda.cancelar(x.id);
  const antes = st().agendamentos.filter((y) => y.profissionalId === 'u-kiko').length;
  assert.ok(equipe.definirAtendimento('u-kiko', false).ok);
  assert.equal(st().agendamentos.filter((y) => y.profissionalId === 'u-kiko').length, antes); // histórico intacto
  assert.equal(cria({ inicio: tsAt(d, '10:00') }).ok, false); // sem novos pelo painel
  const w = whatsapp.agendar({ telefone: '(54) 99633-8812', nome: 'Igor Filipin', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '11:00') });
  assert.equal(w.ok, false);
  assert.equal(equipe.remover('u-kiko').ok, false); // com histórico não remove
  assert.ok(equipe.definirAtendimento('u-kiko', true).ok);
});

import { relatorioMensal, relatorioEstoque, totalAgendamento, statusEstoque } from '../src/domain/reports.js';
import { estoque } from '../src/services/api.js';

test('acréscimo aposentado: a entrada é ignorada e não há mais API para editá-lo', () => {
  const d = proxDiaUtil(9);
  const r = cria({ inicio: tsAt(d, '09:00'), servicoIds: ['s-tesoura', 's-barba'], acrescimos: { 's-tesoura': 12.5 }, status: 'confirmado' });
  assert.ok(r.ok);
  const a = r.agendamento;
  assert.deepEqual(a.acrescimos, {});
  assert.equal(totalAgendamento(st(), a), 40 + 35);
  assert.equal(typeof agenda.editarAcrescimos, 'undefined');
});

test('relatório mensal: concluídos com valores individuais, acréscimos e total; filtro por barbeiro', () => {
  const hoje = store.agora();
  const todos = relatorioMensal(st(), { mesTs: hoje, profissionalId: '' });
  const soma = todos.linhas.reduce((t, l) => t + l.total, 0);
  assert.ok(todos.linhas.length >= 1);
  assert.equal(Math.round(soma * 100), Math.round(todos.totais.total * 100));
  assert.equal(todos.totais.total, todos.totais.servicos + todos.totais.acrescimos);
  const kiko = relatorioMensal(st(), { mesTs: hoje, profissionalId: 'u-kiko' });
  assert.ok(kiko.linhas.every((l) => l.a.profissionalId === 'u-kiko'));
  assert.ok(kiko.totais.total <= todos.totais.total);
  assert.equal(todos.porProfissional.reduce((t, b) => t + b.atendimentos, 0), todos.totais.atendimentos);
});

test('estoque: conclusão baixa materiais dos serviços feitos e o estorno devolve', () => {
  const d = proxDiaUtil(2);
  const a = cria({ inicio: tsAt(d, '10:00'), status: 'confirmado', servicoIds: ['s-maquina', 's-barba'], profissionalId: 'u-tailuan' }).agendamento;
  store.avancar(d + 20 * HORA - store.agora()); // conclui sozinho
  const mov = (id) => st().movimentosEstoque.filter((m) => m.agendamentoId === a.id && m.materialId === id).reduce((t, m) => t + m.delta, 0);
  assert.equal(mov('mt-pomada'), -8);
  assert.equal(mov('mt-papel'), -1);
  assert.equal(mov('mt-lamina'), -1);
  assert.equal(mov('mt-espuma'), -15);
  agenda.alterarStatus(a.id, 'cancelado'); // desfaz conclusão: estorna
  assert.equal(mov('mt-pomada'), 0);
  agenda.alterarStatus(a.id, 'concluido');
  assert.equal(mov('mt-pomada'), -8); // sem baixar duas vezes
});

test('estoque: entrada, ajuste, alerta de mínimo e relatório do mês', () => {
  assert.ok(estoque.movimentar({ materialId: 'mt-pomada', tipo: 'entrada', qtd: 250 }).ok);
  assert.equal(estoque.movimentar({ materialId: 'mt-pomada', tipo: 'entrada', qtd: 0 }).ok, false);
  assert.ok(estoque.movimentar({ materialId: 'mt-papel', tipo: 'ajuste', qtd: 20 }).ok);
  const papel = st().materiais.find((m) => m.id === 'mt-papel');
  assert.equal(papel.estoque, 20);
  assert.equal(statusEstoque(papel), 'baixo');
  const rel = relatorioEstoque(st(), { mesTs: store.agora() });
  assert.ok(rel.alertas.some((x) => x.m.id === 'mt-papel'));
  assert.ok(rel.itens.find((x) => x.m.id === 'mt-pomada').entradas >= 250);
  assert.ok(rel.itens.find((x) => x.m.id === 'mt-pomada').consumo > 0);
  const r = estoque.salvarMaterial({ nome: 'Toalha', unidade: 'un', minimo: 5, custo: 0, estoque: 30 });
  assert.equal(r.material.estoque, 30);
  assert.equal(servicos.salvar({ id: 's-barba', ...st().servicos.find((x) => x.id === 's-barba'), materiais: [{ materialId: 'mt-lamina', qtd: 0 }] }).ok, false);
});

// ---------- financeiro ----------
import { financeiro, bancoSimulado } from '../src/services/api.js';
import { cpfValido, lerBrCode, crc16 } from '../src/domain/pix.js';
import { resumoFinanceiro, cobrancaDoAgendamento, creditoDoCliente } from '../src/domain/financeiro.js';
const futuro = (hm = '10:00', n = 2, extra = {}) => cria({ inicio: tsAt(proxDiaUtil(n), hm), status: 'confirmado', clienteId: 'c-marcelo', profissionalId: 'u-tailuan', servicoIds: ['s-maquina'], ...extra }).agendamento;
const MARCELO_CPF = '284.510.937-79';

test('pix: CPFs de exemplo são válidos e o copia e cola tem CRC e dados corretos', () => {
  for (const c of st().clientes.filter((c) => c.cpf)) assert.ok(cpfValido(c.cpf), c.nome);
  assert.equal(cpfValido('111.111.111-11'), false);
  const a = futuro();
  const r = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.cobranca.valor, 40);
  const p = lerBrCode(r.cobranca.copiaECola);
  assert.ok(p.ok); assert.equal(p.valor, 40); assert.equal(p.chave, st().financeiro.contas[0].pix.chave); assert.equal(p.txid, r.cobranca.txid);
  assert.equal(crc16('123456789'), '29B1');
  assert.equal(lerBrCode(r.cobranca.copiaECola.slice(0, -1) + '0').ok, false);
});

test('pix: validações da cobrança e uma por agendamento', () => {
  const a = futuro();
  assert.equal(financeiro.gerarCobranca(a.id, { cpf: '123.456.789-00' }).ok, false);
  assert.ok(financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).ok);
  assert.equal(financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).ok, false);
  const b = futuro('15:00', 3);
  agenda.cancelar(b.id);
  assert.equal(financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).ok, false);
});

test('pix: pagamento pelo banco concilia sozinho e só avisa no WhatsApp se o código foi enviado', () => {
  financeiro.conectarOpenFinance('ct1');
  const a = futuro();
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  const sem = st().mensagensCliente.length;
  const r = bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Marcelo Santos', cpf: MARCELO_CPF });
  assert.ok(r.ok);
  assert.equal(cobrancaDoAgendamento(st(), a).status, 'paga');
  assert.equal(st().financeiro.cobrancas[0].via, 'open_finance');
  assert.equal(st().mensagensCliente.length, sem, 'não enviou o código, então não avisa');
  const l = st().financeiro.lancamentos.find((x) => x.cobrancaId === c.id);
  assert.ok(l.conciliado); assert.equal(l.tipo, 'credito'); assert.equal(l.valor, 40);
  // com envio
  const b = futuro('15:00', 3);
  const c2 = financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).cobranca;
  assert.ok(financeiro.enviarCobranca(c2.id).ok);
  assert.ok(st().mensagensCliente[0].texto.includes(c2.copiaECola));
  bancoSimulado.pagarPix({ codigo: c2.copiaECola, nome: 'Marcelo', cpf: MARCELO_CPF });
  const m = st().mensagensCliente[0];
  assert.equal(m.modeloNome, 'Pagamento confirmado'); assert.match(m.texto, /40,00/);
  assert.ok(st().avisosPainel[0].texto.includes('Pix recebido'));
});

test('pix: CPF ou valor diferentes pedem autorização; autorizar confirma, rejeitar manda para classificar', () => {
  financeiro.conectarOpenFinance('ct1');
  const a = futuro(); const b = futuro('15:00', 3);
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  const c2 = financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).cobranca;
  const r = bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Outra pessoa', cpf: '503.976.128-77' });
  assert.equal(r.extrato.status, 'divergente'); assert.match(r.extrato.motivo, /CPF/);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'pendente');
  assert.ok(financeiro.autorizarExtrato(r.extrato.id).ok);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga');
  const r2 = bancoSimulado.pagarPix({ codigo: c2.copiaECola, nome: 'Marcelo', cpf: MARCELO_CPF, valor: 30 });
  assert.equal(r2.extrato.status, 'divergente'); assert.match(r2.extrato.motivo, /valor/);
  assert.ok(financeiro.rejeitarExtrato(r2.extrato.id).ok);
  assert.equal(st().financeiro.extrato.find((e) => e.id === r2.extrato.id).status, 'a_classificar');
  assert.ok(financeiro.classificarExtrato(r2.extrato.id, { categoria: 'Outros créditos' }).ok);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c2.id).status, 'pendente');
});

test('open finance: importa o extrato, concilia lançamentos manuais e deixa o resto para classificar', () => {
  const r = financeiro.conectarOpenFinance('ct1');
  assert.ok(r.ok); assert.equal(r.novos, 4);
  const ex = st().financeiro.extrato;
  assert.equal(ex.filter((e) => e.status === 'conciliado').length, 2); // aluguel e luz
  assert.ok(st().financeiro.lancamentos.filter((l) => l.conciliado).length === 2);
  assert.equal(ex.filter((e) => e.status === 'a_classificar').length, 2);
  // lançar à mão a compra de R$ 320 concilia sozinho
  const hoje = store.agora();
  const l = financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'Compra de produtos', valor: 320, data: hoje - 2 * DIA, categoria: 'Materiais e produtos' }).lancamento;
  assert.ok(st().financeiro.lancamentos.find((x) => x.id === l.id).conciliado);
  assert.equal(financeiro.removerLancamento(l.id).ok, false);
  assert.equal(financeiro.sincronizar('ct1').novos, 0);
  financeiro.desconectarOpenFinance('ct1');
  assert.equal(financeiro.sincronizar('ct1').ok, false);
});

test('pix: sem Open Finance a confirmação é manual e o banco concilia depois', () => {
  const a = futuro();
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Marcelo', cpf: MARCELO_CPF });
  assert.equal(st().financeiro.cobrancas[0].status, 'pendente', 'sem Open Finance nada acontece sozinho');
  assert.ok(financeiro.confirmarManual(c.id, 'viu no app').ok);
  assert.equal(st().financeiro.cobrancas[0].via, 'manual');
  assert.equal(st().financeiro.lancamentos[0].conciliado, false);
  financeiro.conectarOpenFinance('ct1');
  assert.equal(st().financeiro.lancamentos.find((l) => l.cobrancaId === c.id).conciliado, true);
});

test('financeiro: expiração, cancelamento junto com o agendamento, permissões e resumo', () => {
  const t0 = store.agora(); // o relógio avança 25 h abaixo: perto da virada do mês o resumo olha o mês do seed (t0)
  const a = futuro();
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  store.avancar(25 * HORA);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'expirada');
  const b = futuro('15:00', 4);
  const c2 = financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).cobranca;
  agenda.cancelar(b.id);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c2.id).status, 'cancelada');
  // barbeiro: gera para o próprio agendamento, mas não vê o financeiro
  auth.logout(); auth.login({ identificador: 'kiko', senha: '1234' });
  assert.equal(R.pode(R.pode ? st().usuarios.find((u) => u.id === 'u-kiko') : null, 'financeiro'), false);
  assert.equal(financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'x', valor: 1, data: t0 }).ok, false);
  assert.equal(financeiro.confirmarManual(c.id).ok, false);
  auth.logout(); login();
  financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'Internet', valor: 120, data: t0, categoria: 'Internet e telefone' });
  financeiro.salvarLancamento({ tipo: 'credito', descricao: 'Aporte', valor: 500, data: t0, categoria: 'Outros créditos' });
  const r = resumoFinanceiro(st(), { mesTs: t0 });
  assert.equal(r.creditos, 500); assert.equal(r.despesas, 1506.9); assert.equal(r.saldo, -1006.9);
});

// ---------- API Pix do banco ----------
import { BANCOS_API } from '../src/domain/financeiro.js';
const cfgApi = (o = {}) => ({ banco: 'Sicredi', ambiente: 'homologacao', urlBase: 'https://api-pix-h.sicredi.com.br/api/v2', clientId: 'abc12345', clientSecret: 'segredo123', certificadoNome: 'cert.cer', chavePrivadaNome: 'app.key', cadeiaNome: 'cadeia.pem', escopos: ['cob.write', 'cob.read', 'pix.read', 'webhook.write'], webhookUrl: 'https://api.barbearia.example/webhooks/pix', ...o });

test('api pix: lista de bancos e Nubank sem API pública', () => {
  assert.deepEqual(BANCOS_API.map((b) => b.nome), ['Itaú', 'Santander', 'Bradesco', 'Sicredi', 'Banco Inter', 'Banco do Brasil', 'Caixa Econômica Federal', 'Nubank']);
  const nu = financeiro.salvarConta({ apelido: 'Nubank PJ', banco: 'Nubank', agencia: '0001', conta: '445566-7' }).conta;
  const r = financeiro.salvarApiPix(nu.id, cfgApi());
  assert.equal(r.ok, false); assert.match(r.erros[0], /Nubank/);
  const c6 = financeiro.salvarConta({ apelido: 'C6', banco: 'C6 Bank', agencia: '0001', conta: '778899-0' }).conta;
  assert.match(financeiro.salvarApiPix(c6.id, cfgApi()).erros[0], /lista de bancos com API Pix/);
});

test('api pix: o teste de conexão aponta o que falta e só ativa com tudo certo', () => {
  assert.ok(financeiro.salvarApiPix('ct1', cfgApi({ certificadoNome: '' })).ok);
  let r = financeiro.testarApiPix('ct1');
  assert.equal(r.ok, false); assert.match(r.erros[0], /certificado/i); assert.equal(st().financeiro.contas[0].apiPix.ativa, false);
  financeiro.salvarApiPix('ct1', cfgApi({ escopos: ['cob.read'] }));
  assert.match(financeiro.testarApiPix('ct1').erros[0], /cob\.write/);
  financeiro.salvarApiPix('ct1', cfgApi({ urlBase: 'http://inseguro' }));
  assert.match(financeiro.testarApiPix('ct1').erros[0], /https/);
  // o segredo salvo não precisa ser digitado de novo
  financeiro.salvarApiPix('ct1', cfgApi({ clientSecret: '' }));
  r = financeiro.testarApiPix('ct1');
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.passos.length, 6);
  assert.equal(st().financeiro.contas[0].apiPix.ativa, true);
  // Banco do Brasil exige a chave de aplicação
  financeiro.salvarApiPix('ct2', cfgApi({ clientSecret: 'segredo123' }));
  assert.match(financeiro.testarApiPix('ct2').erros[0], /chave de aplicação/i);
  financeiro.salvarApiPix('ct2', cfgApi({ appKey: 'devkey123', clientSecret: 'segredo123' }));
  assert.ok(financeiro.testarApiPix('ct2').ok);
  assert.ok(financeiro.desativarApiPix('ct2').ok); assert.equal(st().financeiro.contas[1].apiPix.ativa, false);
  assert.equal(st().financeiro.contas[0].apiPix.ativa, true, 'cada conta tem a sua API');
});

test('api pix: cobrança dinâmica e confirmação por webhook, sem Open Finance nem manual', () => {
  financeiro.salvarApiPix('ct1', cfgApi()); assert.ok(financeiro.testarApiPix('ct1').ok);
  const a = futuro(); const b = futuro('15:00', 3);
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  assert.equal(c.emitidaPor, 'api'); assert.equal(c.bancoApi, 'Sicredi');
  assert.ok(c.txid.length >= 26 && c.txid.length <= 35);
  const p = lerBrCode(c.copiaECola);
  assert.ok(p.ok); assert.equal(p.chave, null); assert.equal(p.valor, null); assert.equal(p.txid, c.txid); assert.match(p.url, /sicredi/);
  assert.match(st().agendamentos.find((x) => x.id === a.id).log.at(-1).para, /API do Sicredi/);
  financeiro.enviarCobranca(c.id);
  const r = bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Marcelo', cpf: MARCELO_CPF });
  assert.ok(r.ok); assert.equal(r.canal, 'webhook');
  const pago = st().financeiro.cobrancas.find((x) => x.id === c.id);
  assert.equal(pago.status, 'paga'); assert.equal(pago.via, 'api_pix');
  assert.equal(st().mensagensCliente[0].modeloNome, 'Pagamento confirmado');
  assert.equal(st().financeiro.contas[0].openFinance.conectado, false);
  // divergência pelo webhook também pede autorização
  const c2 = financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).cobranca;
  const r2 = bancoSimulado.pagarPix({ codigo: c2.copiaECola, nome: 'Outro', cpf: '503.976.128-77' });
  assert.equal(r2.extrato.status, 'divergente');
  assert.ok(financeiro.autorizarExtrato(r2.extrato.id).ok);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c2.id).via, 'api_pix');
  // desativada, o código dinâmico deixa de ser reconhecido e a confirmação volta a ser manual
  const d = futuro('11:00', 4);
  const c3 = financeiro.gerarCobranca(d.id, { cpf: MARCELO_CPF }).cobranca;
  financeiro.desativarApiPix('ct1');
  assert.equal(bancoSimulado.pagarPix({ codigo: c3.copiaECola, nome: 'M', cpf: MARCELO_CPF }).canal, null);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c3.id).status, 'pendente');
});

// ---------- cancelamento do Pix, aviso para devolver e crédito do cliente ----------
import { estabelecimento as apiEstab } from '../src/services/api.js';
const validade = (h) => financeiro.salvarPix('ct1', { ...st().financeiro.contas[0].pix, validadeH: h });
const ativaApi = () => { financeiro.salvarApiPix('ct1', cfgApi()); assert.ok(financeiro.testarApiPix('ct1').ok); };
const ultimoAviso = (a) => { const sv = R.servicosPorIds(st(), a.servicoIds); const { lista } = R.notificacoesEfetivas(sv, st().estabelecimento); return Math.max(...lista.map((n) => R.momentoNotificacao(n, a.inicio))); };

test('pix: o cancelamento do Pix pendente vem dos avisos (padrão: até o último aviso) e cancela no banco', () => {
  ativaApi(); validade(240);
  const a = futuro('14:00', 3);
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  const t = ultimoAviso(st().agendamentos.find((x) => x.id === a.id));
  store.avancar(t - store.agora() - 60000);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'pendente');
  store.avancar(2 * 60000);
  const cob = st().financeiro.cobrancas.find((x) => x.id === c.id);
  assert.equal(cob.status, 'cancelada');
  assert.match(st().agendamentos.find((x) => x.id === a.id).log.at(-1).para, /cancelada no banco.*avisos/i);
  const r = bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'M', cpf: MARCELO_CPF });
  assert.equal(r.ok, false); assert.match(r.erros[0], /cancelada ou expirou/);
});

test('pix: configuração do cancelamento por horas antes, nunca, e por serviço', () => {
  assert.equal(apiEstab.salvar({ pixCancelamento: { modo: 'horas', horas: '' } }).ok, false);
  assert.ok(apiEstab.salvar({ pixCancelamento: { modo: 'horas', horas: '04:00' } }).ok); validade(240);
  const a = futuro('14:00', 3);
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  const al = st().agendamentos.find((x) => x.id === a.id);
  store.avancar(al.inicio - 4 * HORA + 60000 - store.agora());
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'cancelada');
  // serviço com avisos próprios e "nunca": o Pix não é cancelado pelos avisos
  servicos.salvar({ ...st().servicos.find((x) => x.id === 's-maquina'), notificacoes: [{ id: 'n1', modo: 'horas', horas: '05:00', tipo: 'pergunta' }], pixCancelamento: { modo: 'nunca' } });
  const b = futuro('15:00', 4);
  const c2 = financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).cobranca;
  store.avancar(st().agendamentos.find((x) => x.id === b.id).inicio - HORA - store.agora());
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c2.id).status, 'pendente', 'com "nunca" só expira pela validade');
});

test('pix: sem avisos configurados não há cancelamento automático; cobrança criada depois do prazo vale até expirar', () => {
  apiEstab.salvar({ notificacoes: [] });
  const a = futuro('14:00', 3);
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  store.avancar(a.inicio - HORA - store.agora());
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'expirada');
});

test('pix: cancelar o agendamento pago só avisa o painel para devolver (mesmo com a API do banco): nada é devolvido nem enviado ao cliente', () => {
  ativaApi();
  financeiro.conectarOpenFinance('ct1');
  const a = futuro();
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  financeiro.enviarCobranca(c.id);
  bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Marcelo Santos', cpf: MARCELO_CPF });
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga');
  const msgs = st().mensagensCliente.length, debitos = st().financeiro.extrato.filter((e) => e.tipo === 'debito').length;
  agenda.cancelar(a.id);
  const av = st().avisosPainel.filter((x) => x.tipo === 'devolver' && x.agendamentoId === a.id);
  assert.equal(av.length, 1); assert.match(av[0].texto, /40,00/); assert.match(av[0].texto, /barbeiro/i);
  assert.equal(st().mensagensCliente.length, msgs, 'o cliente não é avisado');
  assert.equal(st().financeiro.extrato.filter((e) => e.tipo === 'debito').length, debitos, 'nenhuma devolução pela API');
  assert.equal(st().financeiro.devolucoes, undefined);
  agenda.alterarStatus(a.id, 'cancelado');
  assert.equal(st().avisosPainel.filter((x) => x.tipo === 'devolver' && x.agendamentoId === a.id).length, 1, 'um aviso só');
});

test('pix: cancelou com Pix pago → aviso; o barbeiro confirma que não compareceu → crédito do cliente, usado depois para pagar outro atendimento', () => {
  const a = futuro(); const b = futuro('15:00', 3);
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  const pend = financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).cobranca;
  financeiro.confirmarManual(c.id, 'viu no app');
  agenda.cancelar(a.id); agenda.cancelar(b.id);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === pend.id).status, 'cancelada', 'cobrança sem pagamento só é cancelada');
  assert.equal(st().avisosPainel.filter((x) => x.tipo === 'devolver').length, 1);
  assert.match(st().avisosPainel.find((x) => x.tipo === 'devolver').texto, /Abra o agendamento e escolha/);
  // não compareceu: vira crédito (sem novo lançamento: a receita já foi lançada no pagamento)
  const lanc = st().financeiro.lancamentos.length;
  assert.ok(financeiro.manterComoCredito(a.id).ok);
  assert.equal(st().financeiro.lancamentos.length, lanc);
  const cli = a.clienteId;
  assert.equal(creditoDoCliente(st(), cli, undefined, store.agora()), 40);
  // usa o crédito num atendimento novo (40 de crédito, serviço de 40)
  const n = futuro('16:00', 4);
  const msgs = st().mensagensCliente.length;
  const r = financeiro.usarCredito(n.id);
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.total, 40);
  const pg = st().financeiro.cobrancas.find((x) => x.agendamentoId === n.id);
  assert.equal(pg.status, 'paga'); assert.equal(pg.via, 'credito');
  assert.equal(st().financeiro.lancamentos.length, lanc, 'usar crédito não lança receita de novo');
  assert.equal(st().mensagensCliente.length, msgs, 'nada enviado ao cliente');
  assert.equal(creditoDoCliente(st(), cli, undefined, store.agora()), 0);
  assert.equal(financeiro.usarCredito(n.id).ok, false, 'sem saldo, não usa de novo');
  assert.equal(financeiro.gerarCobranca(n.id, { cpf: MARCELO_CPF }).ok, false, 'já está pago');
  // cancelar o atendimento pago com crédito devolve o crédito ao cliente, sem aviso de devolver dinheiro
  const avisos = st().avisosPainel.filter((x) => x.tipo === 'devolver').length;
  agenda.cancelar(n.id); store.avancar(60000);
  assert.equal(creditoDoCliente(st(), cli, undefined, store.agora()), 40);
  assert.equal(st().avisosPainel.filter((x) => x.tipo === 'devolver').length, avisos);
});

test('pix: crédito parcial paga parte e o restante é cobrado por Pix; crédito de outro cliente não vale', () => {
  const a = futuro();
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  financeiro.confirmarManual(c.id, '');
  agenda.cancelar(a.id); financeiro.manterComoCredito(a.id);
  const cli = a.clienteId;
  const ro = cria({ inicio: tsAt(proxDiaUtil(3), '10:00'), status: 'confirmado', clienteId: 'c-igor', profissionalId: 'u-tailuan', servicoIds: ['s-maquina', 's-barba'] });
  assert.ok(ro.ok, JSON.stringify(ro));
  const outro = ro.agendamento;
  assert.equal(financeiro.usarCredito(outro.id).ok, false, 'crédito é do cliente que pagou');
  const rb = cria({ inicio: tsAt(proxDiaUtil(3), '15:00'), status: 'confirmado', clienteId: cli, profissionalId: 'u-tailuan', servicoIds: ['s-maquina', 's-barba'] }); // 75
  assert.ok(rb.ok, JSON.stringify(rb));
  const b = rb.agendamento;
  assert.ok(financeiro.usarCredito(b.id).ok);
  const faltam = financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF });
  assert.ok(faltam.ok, JSON.stringify(faltam));
  assert.equal(faltam.cobranca.valor, 35, '75 − 40 de crédito');
});

test('pix: cobrança da API não é cancelada com a API desativada', () => {
  ativaApi();
  const a = futuro();
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  financeiro.desativarApiPix('ct1');
  const r = financeiro.cancelarCobranca(c.id);
  assert.equal(r.ok, false); assert.match(r.erros[0], /desativada/);
  ativaApi();
  assert.ok(financeiro.cancelarCobranca(c.id).ok);
  assert.match(st().agendamentos.find((x) => x.id === a.id).log.at(-1).para, /cancelada no banco/);
});

// ---------- contas e grupos de movimentação ----------
const BARBA_G2 = () => servicos.salvar({ ...st().servicos.find((x) => x.id === 's-barba'), grupoMovimentacaoId: 'g2' });

test('contas: cadastro, validações e remoção só sem uso', () => {
  assert.equal(st().financeiro.contas.length, 2);
  assert.equal(financeiro.salvarConta({ apelido: '', banco: 'Sicredi', agencia: '0101', conta: '1234-5' }).ok, false);
  assert.equal(financeiro.salvarConta({ apelido: 'X', banco: 'Banco Fantasma', agencia: '0101', conta: '1234-5' }).ok, false);
  assert.equal(financeiro.salvarConta({ apelido: 'X', banco: 'Itaú', agencia: '1', conta: '1234-5' }).ok, false);
  assert.match(financeiro.salvarConta({ apelido: 'conta principal', banco: 'Itaú', agencia: '0101', conta: '1234-5' }).erros[0], /Já existe/);
  const r = financeiro.salvarConta({ apelido: 'Conta do Kiko', banco: 'Itaú', agencia: '0101', conta: '55555-5' });
  assert.ok(r.ok); assert.equal(r.conta.pix.chave, ''); assert.equal(r.conta.apiPix.ativa, false); assert.equal(r.conta.openFinance.conectado, false);
  // sem chave Pix a conta não recebe cobrança
  assert.ok(financeiro.salvarGrupo({ nome: 'Kiko', contaId: r.conta.id }).ok);
  // remoção: conta com grupo, conta única
  assert.match(financeiro.removerConta('ct2').erros[0], /Fornecedores e produtos/);
  const g = st().financeiro.grupos.find((x) => x.nome === 'Kiko');
  assert.ok(financeiro.removerGrupo(g.id).ok);
  assert.ok(financeiro.removerConta(r.conta.id).ok);
  // trocar o banco com API ativa é recusado
  financeiro.salvarApiPix('ct1', cfgApi()); financeiro.testarApiPix('ct1');
  assert.match(financeiro.salvarConta({ id: 'ct1', apelido: 'Conta principal', banco: 'Itaú', agencia: '0101', conta: '12345-6' }).erros[0], /Desative a API/);
  financeiro.desativarApiPix('ct1');
  assert.ok(financeiro.salvarConta({ id: 'ct1', apelido: 'Conta principal', banco: 'Itaú', agencia: '0101', conta: '12345-6' }).ok);
  // barbeiro não mexe em contas nem grupos
  auth.logout(); auth.login({ identificador: 'kiko', senha: '1234' });
  assert.equal(financeiro.salvarConta({ apelido: 'Z', banco: 'Itaú', agencia: '0101', conta: '1234-5' }).ok, false);
  assert.equal(financeiro.salvarGrupo({ nome: 'Z', contaId: 'ct1' }).ok, false);
});

test('grupos: nome único, conta obrigatória, padrão do estabelecimento e do serviço validados, remoção só sem uso', () => {
  assert.equal(financeiro.salvarGrupo({ nome: 'Novo', contaId: 'ct9' }).ok, false);
  assert.equal(financeiro.salvarGrupo({ nome: 'geral', contaId: 'ct1' }).ok, false);
  const g = financeiro.salvarGrupo({ nome: 'Barba e bigode', contaId: 'ct2' }).grupo;
  assert.ok(g.id);
  // padrão do estabelecimento e grupo do serviço precisam existir
  assert.equal(apiEstab.salvar({ grupoMovimentacaoId: 'g99' }).ok, false);
  assert.equal(apiEstab.salvar({ grupoMovimentacaoId: '' }).ok, false);
  assert.equal(servicos.salvar({ ...st().servicos.find((x) => x.id === 's-barba'), grupoMovimentacaoId: 'g99' }).ok, false);
  assert.ok(BARBA_G2().ok);
  // em uso
  assert.match(financeiro.removerGrupo('g1').erros[0], /padrão do estabelecimento/);
  assert.match(financeiro.removerGrupo('g2').erros[0], /Barba/);
  servicos.salvar({ ...st().servicos.find((x) => x.id === 's-barba'), grupoMovimentacaoId: null });
  financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'Pomada', valor: 50, data: store.agora(), grupoId: 'g2' });
  assert.match(financeiro.removerGrupo('g2').erros[0], /lançamentos/);
  assert.ok(financeiro.removerGrupo(g.id).ok);
  // mudar a conta do grupo vale daqui para a frente
  const l = st().financeiro.lancamentos.find((x) => x.descricao === 'Pomada');
  assert.equal(l.contaId, 'ct2');
  assert.ok(financeiro.salvarGrupo({ id: 'g2', nome: 'Fornecedores e produtos', contaId: 'ct1' }).ok);
  assert.equal(st().financeiro.lancamentos.find((x) => x.id === l.id).contaId, 'ct2', 'o que já foi lançado fica na conta de origem');
  const l2 = financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'Pomada 2', valor: 10, data: store.agora(), grupoId: 'g2' }).lancamento;
  assert.equal(l2.contaId, 'ct1');
});

test('despesas: o grupo define a conta e a conciliação só olha o extrato dessa conta', () => {
  financeiro.conectarOpenFinance('ct1'); financeiro.conectarOpenFinance('ct2');
  const hoje = store.agora();
  // compra de R$ 320 já está no extrato da conta principal (ct1); lançada no grupo da ct2 não concilia
  const l = financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'Compra de produtos', valor: 320, data: hoje - 2 * DIA, grupoId: 'g2' }).lancamento;
  assert.equal(l.contaId, 'ct2'); assert.equal(l.conciliado, false);
  assert.equal(st().financeiro.extrato.find((e) => e.valor === 320).status, 'a_classificar');
  // sem grupo escolhido vale o padrão do estabelecimento (ct1) e concilia
  const l2 = financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'Compra de produtos', valor: 320, data: hoje - 2 * DIA }).lancamento;
  assert.equal(l2.grupoId, 'g1'); assert.equal(l2.contaId, 'ct1'); assert.equal(l2.conciliado, true);
  assert.equal(financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'x', valor: 5, data: hoje, grupoId: 'g99' }).ok, false);
  // movimento na ct2 só concilia com lançamento da ct2
  const l3 = financeiro.salvarLancamento({ tipo: 'despesa', descricao: 'Distribuidora', valor: 77, data: hoje, grupoId: 'g2' }).lancamento;
  bancoSimulado.lancar({ contaId: 'ct1', tipo: 'debito', valor: 77, descricao: 'Débito' });
  assert.equal(st().financeiro.lancamentos.find((x) => x.id === l3.id).conciliado, false);
  bancoSimulado.lancar({ contaId: 'ct2', tipo: 'debito', valor: 77, descricao: 'Débito' });
  assert.equal(st().financeiro.lancamentos.find((x) => x.id === l3.id).conciliado, true);
  assert.equal(st().financeiro.extrato.filter((e) => e.contaId === 'ct2').length, 1);
  // classificar um movimento: o lançamento fica na conta dele
  const e = st().financeiro.extrato.find((x) => x.valor === 77 && x.contaId === 'ct1');
  assert.equal(financeiro.classificarExtrato(e.id, { categoria: 'Outras despesas', grupoId: 'g2' }).ok, false, 'g2 é da ct2');
  const c = financeiro.classificarExtrato(e.id, { categoria: 'Outras despesas' });
  assert.ok(c.ok); assert.equal(c.lancamento.contaId, 'ct1'); assert.equal(c.lancamento.grupoId, 'g1');
  // resumo por conta e por grupo, com filtro
  const r = resumoFinanceiro(st(), { mesTs: hoje });
  assert.equal(r.porConta.length, 2); assert.equal(r.porGrupo.length, 2);
  const so2 = resumoFinanceiro(st(), { mesTs: hoje, contaId: 'ct2' });
  assert.equal(so2.despesas, 397); // 320 + 77
});

test('serviços: o grupo do serviço divide o Pix por conta, cada uma com a sua chave', () => {
  assert.ok(BARBA_G2().ok);
  const a = cria({ inicio: tsAt(proxDiaUtil(2), '10:00'), status: 'confirmado', clienteId: 'c-marcelo', profissionalId: 'u-tailuan', servicoIds: ['s-maquina', 's-barba'] }).agendamento;
  const r = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF });
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.cobrancas.length, 2);
  const c1 = r.cobrancas.find((c) => c.contaId === 'ct1'); const c2 = r.cobrancas.find((c) => c.contaId === 'ct2');
  assert.equal(c1.valor, 40); assert.deepEqual(c1.servicoIds, ['s-maquina']); assert.equal(c1.grupoId, 'g1');
  assert.equal(c2.valor, 35); assert.deepEqual(c2.servicoIds, ['s-barba']); assert.equal(c2.grupoId, 'g2');
  assert.equal(lerBrCode(c1.copiaECola).chave, st().financeiro.contas[0].pix.chave);
  assert.equal(lerBrCode(c2.copiaECola).chave, st().financeiro.contas[1].pix.chave);
  assert.equal(financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).ok, false, 'já geradas');
  // mensagem de cada Pix traz só os serviços e o valor dele
  financeiro.enviarCobranca(c2.id);
  assert.match(st().mensagensCliente[0].texto, /Barba/); assert.doesNotMatch(st().mensagensCliente[0].texto, /Corte na máquina/); assert.match(st().mensagensCliente[0].texto, /35,00/);
  // o valor não pode ser alterado quando há mais de uma conta
  const b = cria({ inicio: tsAt(proxDiaUtil(3), '10:00'), status: 'confirmado', clienteId: 'c-marcelo', profissionalId: 'u-tailuan', servicoIds: ['s-maquina', 's-barba'] }).agendamento;
  assert.match(financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF, valor: 10 }).erros[0], /contas diferentes/);
  // conta sem chave Pix bloqueia só a geração
  assert.equal(financeiro.salvarPix('ct2', { ...st().financeiro.contas[1].pix, chave: ' ' }).ok, false, 'a chave não pode ficar vazia');
  const nova = financeiro.salvarConta({ apelido: 'Conta nova', banco: 'Itaú', agencia: '0101', conta: '99999-9' }).conta;
  const gn = financeiro.salvarGrupo({ nome: 'Barba nova', contaId: nova.id }).grupo;
  servicos.salvar({ ...st().servicos.find((x) => x.id === 's-barba'), grupoMovimentacaoId: gn.id });
  assert.match(financeiro.gerarCobranca(b.id, { cpf: MARCELO_CPF }).erros[0], /Conta nova.*chave Pix/);
});

test('serviços: cada conta confirma o seu Pix pelo seu canal (API de uma, Open Finance ou manual na outra) e o crédito fica na conta de origem', () => {
  BARBA_G2();
  financeiro.salvarApiPix('ct2', cfgApi({ appKey: 'devkey123' })); assert.ok(financeiro.testarApiPix('ct2').ok);
  financeiro.conectarOpenFinance('ct1');
  const a = cria({ inicio: tsAt(proxDiaUtil(2), '10:00'), status: 'confirmado', clienteId: 'c-marcelo', profissionalId: 'u-tailuan', servicoIds: ['s-maquina', 's-barba'] }).agendamento;
  const { cobrancas } = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF });
  const c1 = cobrancas.find((c) => c.contaId === 'ct1'); const c2 = cobrancas.find((c) => c.contaId === 'ct2');
  assert.equal(c1.emitidaPor, 'local'); assert.equal(c2.emitidaPor, 'api'); assert.equal(c2.bancoApi, 'Banco do Brasil');
  financeiro.enviarCobranca(c1.id); financeiro.enviarCobranca(c2.id);
  const r2 = bancoSimulado.pagarPix({ codigo: c2.copiaECola, nome: 'Marcelo', cpf: MARCELO_CPF });
  assert.equal(r2.canal, 'webhook'); assert.equal(r2.conta.id, 'ct2');
  const r1 = bancoSimulado.pagarPix({ codigo: c1.copiaECola, nome: 'Marcelo', cpf: MARCELO_CPF });
  assert.equal(r1.canal, 'open_finance'); assert.equal(r1.conta.id, 'ct1');
  const pagos = st().financeiro.cobrancas.filter((c) => c.agendamentoId === a.id);
  assert.ok(pagos.every((c) => c.status === 'paga'));
  const l1 = st().financeiro.lancamentos.find((x) => x.cobrancaId === c1.id); const l2 = st().financeiro.lancamentos.find((x) => x.cobrancaId === c2.id);
  assert.equal(l1.contaId, 'ct1'); assert.equal(l1.grupoId, 'g1'); assert.equal(l2.contaId, 'ct2'); assert.equal(l2.grupoId, 'g2');
  assert.equal(st().mensagensCliente.filter((m) => m.modeloNome === 'Pagamento confirmado').length, 2);
  // cancelar o atendimento: um aviso por Pix pago (cada um com o seu valor); o crédito fica na conta de origem
  const debitos = st().financeiro.extrato.filter((e) => e.tipo === 'debito').length;
  agenda.cancelar(a.id); store.avancar(60000);
  assert.equal(st().avisosPainel.filter((x) => x.tipo === 'devolver' && x.agendamentoId === a.id).length, 2);
  assert.equal(st().financeiro.extrato.filter((e) => e.tipo === 'debito').length, debitos, 'nem a API devolve sozinha');
  assert.ok(financeiro.manterComoCredito(a.id).ok);
  const creds = st().financeiro.creditos.filter((x) => x.agendamentoId === a.id);
  assert.equal(creds.length, 2);
  assert.equal(creds.find((x) => x.cobrancaId === c1.id).contaId, 'ct1'); assert.equal(creds.find((x) => x.cobrancaId === c2.id).contaId, 'ct2');
  assert.equal(creditoDoCliente(st(), a.clienteId, 'ct1', store.agora()), c1.valor); assert.equal(creditoDoCliente(st(), a.clienteId, 'ct2', store.agora()), c2.valor);
});

test('contas: o banco de uma conta não confirma o Pix de outra', () => {
  BARBA_G2();
  financeiro.conectarOpenFinance('ct1'); // só a ct1 está conectada
  const a = cria({ inicio: tsAt(proxDiaUtil(2), '10:00'), status: 'confirmado', clienteId: 'c-marcelo', profissionalId: 'u-tailuan', servicoIds: ['s-barba'] }).agendamento;
  const c = financeiro.gerarCobranca(a.id, { cpf: MARCELO_CPF }).cobranca;
  assert.equal(c.contaId, 'ct2');
  const r = bancoSimulado.pagarPix({ codigo: c.copiaECola, nome: 'Marcelo', cpf: MARCELO_CPF });
  assert.equal(r.canal, null);
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'pendente', 'a ct2 não tem API nem Open Finance: confirma só à mão');
  assert.equal(financeiro.sincronizar('ct2').ok, false);
  financeiro.conectarOpenFinance('ct2');
  assert.equal(st().financeiro.cobrancas.find((x) => x.id === c.id).status, 'paga', 'conectando a ct2 o extrato dela traz o Pix');
});

// ---------- DDD com código do país ----------
test('DDD: o WhatsApp entrega o número com o código do país e o bloqueio continua valendo', () => {
  for (const n of ['(11) 98888-7777', '11988887777', '+55 11 98888-7777', '5511988887777', '055 11 98888-7777', '011 98888-7777']) {
    assert.equal(R.dddDe(n), 11, n);
    assert.equal(whatsapp.dddPermitido(n), false, n);
  }
  for (const n of ['(51) 98000-0001', '+55 51 98000-0001', '5551980000001']) { assert.equal(R.dddDe(n), 51, n); assert.equal(whatsapp.dddPermitido(n), true, n); }
  // DDD 55 (Santa Maria) com e sem código do país, fixo e celular
  for (const n of ['(55) 99701-1122', '5555997011122', '+55 55 3222-1234', '(55) 3222-1234']) assert.equal(R.dddDe(n), 55, n);
  const d = proxDiaUtil(9);
  const r = whatsapp.agendar({ telefone: '5511988887777', nome: 'Paulista', profissionalId: 'u-kiko', servicoIds: ['s-tesoura'], inicio: tsAt(d, '10:00') });
  assert.equal(r.bloqueado, 'ddd');
  assert.equal(st().clientes.some((c) => c.nome === 'Paulista'), false, 'o bloqueado não vira cliente');
  // o cliente cadastrado é reconhecido com ou sem o código do país
  assert.equal(whatsapp.clientePorTelefone('5555997114020').length, 1);
  assert.equal(whatsapp.clientePorTelefone('+55 55 99711-4020').length, 1);
  assert.equal(R.identificarCliente(st().clientes, { telefone: '5555997114020', cpf: '', nome: 'Marcelo' })?.id, 'c-marcelo');
});
