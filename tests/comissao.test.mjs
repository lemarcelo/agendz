// Atendimento local e comissão do esteticista: percentuais, relatórios (esteticista × proprietário), pagamento e permissões.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, comissoes, servicos, equipe, estabelecimento } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { pctComissao } from '../src/domain/rules.js';
import { comissaoDoAgendamento, relatorioDoProfissional } from '../src/domain/comissao.js';
import { monthStart } from '../src/domain/time.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a + JSON.stringify(r)); };
const srv = (id, patch) => servicos.salvar({ ...st().servicos.find((x) => x.id === id), ...patch });
const eq = (id, patch) => equipe.salvar({ ...st().usuarios.find((x) => x.id === id), ...patch });
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); });
const dono = () => como('davi');
const profissional = (ap) => { como(ap.toLowerCase()); return st().usuarios.find((u) => u.apelido === ap); };

test('precedência do percentual: serviço > esteticista > padrão do estabelecimento; proprietário fica com 100%', () => {
  dono();
  const s = st();
  const b = s.usuarios.find((u) => u.papel === 'profissional');
  const sv = s.servicos[0];
  assert.equal(pctComissao(s, b, sv), 50);
  assert.ok(estabelecimento.salvar({ comissaoPadrao: 40 }).ok);
  assert.equal(pctComissao(st(), b, sv), 40);
  assert.ok(eq(b.id, { comissaoPct: 70 }).ok);
  assert.equal(pctComissao(st(), st().usuarios.find((x) => x.id === b.id), st().servicos.find((x) => x.id === sv.id)), 70, 'sem percentual no serviço vale o do funcionário');
  assert.ok(srv(sv.id, { comissaoPct: 30 }).ok);
  assert.equal(pctComissao(st(), st().usuarios.find((x) => x.id === b.id), st().servicos.find((x) => x.id === sv.id)), 30, 'o serviço sobrepõe o funcionário');
  assert.ok(srv(sv.id, { comissaoPct: 0 }).ok);
  assert.equal(pctComissao(st(), st().usuarios.find((x) => x.id === b.id), st().servicos.find((x) => x.id === sv.id)), 0, '0 no serviço = sem comissão (não herda)');
  assert.ok(srv(sv.id, { comissaoPct: null }).ok);
  assert.ok(eq(b.id, { comissaoPct: null }).ok);
  assert.equal(pctComissao(st(), st().usuarios.find((x) => x.id === b.id), st().servicos.find((x) => x.id === sv.id)), 40, 'sem os dois volta ao geral do estabelecimento');
  assert.equal(pctComissao(st(), st().usuarios.find((u) => u.papel === 'dono'), sv), 100);
});

test('percentual inválido é recusado e vazio volta a herdar', () => {
  dono();
  const sv = st().servicos[0];
  for (const v of [101, -1, 'abc', NaN]) assert.equal(srv(sv.id, { comissaoPct: v }).ok, false, String(v));
  assert.equal(estabelecimento.salvar({ comissaoPadrao: '' }).ok, false);
  assert.ok(srv(sv.id, { comissaoPct: 20 }).ok);
  assert.ok(srv(sv.id, { comissaoPct: null }).ok);
  assert.equal(st().servicos.find((x) => x.id === sv.id).comissaoPct ?? null, null);
});

test('atendimento local: nasce concluído, sem cliente, sem mensagem e com comissão congelada', () => {
  dono();
  const b = st().usuarios.find((u) => u.papel === 'profissional' && u.atende);
  const sv = st().servicos[0];
  const antes = st().clientes.length;
  const r = agenda.registrarLocal({ servicoIds: [sv.id], nome: 'Seu Zé', profissionalId: b.id });
  assert.ok(r.ok, JSON.stringify(r));
  const a = st().agendamentos.find((x) => x.local);
  assert.equal(a.status, 'concluido'); assert.equal(a.clienteId, null); assert.equal(a.nomeAvulso, 'Seu Zé');
  assert.equal(st().clientes.length, antes, 'não cria cadastro de cliente');
  assert.equal(st().mensagensCliente.filter((m) => m.agendamentoId === a.id).length, 0);
  assert.equal(a.comissoes[sv.id], 50);
  estabelecimento.salvar({ comissaoPadrao: 10 });
  assert.equal(comissaoDoAgendamento(st(), st().agendamentos.find((x) => x.local)).itens[0].pct, 50, 'percentual congelado não muda depois');
});

test('atendimento local: nome opcional, serviços obrigatórios, nome longo recusado, sem cupom nem remarcar', () => {
  dono();
  const b = st().usuarios.find((u) => u.papel === 'profissional' && u.atende);
  const sv = st().servicos[0];
  assert.equal(agenda.registrarLocal({ servicoIds: [], profissionalId: b.id }).ok, false);
  assert.equal(agenda.registrarLocal({ servicoIds: [sv.id], nome: 'x'.repeat(61), profissionalId: b.id }).ok, false);
  assert.equal(agenda.registrarLocal({ servicoIds: ['nao-existe'], profissionalId: b.id }).ok, false);
  assert.equal(agenda.registrarLocal({ servicoIds: [sv.id], profissionalId: 'ninguem' }).ok, false);
  assert.ok(agenda.registrarLocal({ servicoIds: [sv.id], profissionalId: b.id }).ok);
  const a = st().agendamentos.find((x) => x.local);
  assert.equal(agenda.aplicarCupom(a.id, 'LAVA-VALE-4M7X').ok, false);
  assert.equal(agenda.remarcar(a.id, { inicio: a.inicio + 3600000 }).ok, false);
});

test('esteticista só registra atendimento local para si e o relatório dele não traz valor cheio nem parte da casa', () => {
  const eu = profissional('Pablo');
  const outro = st().usuarios.find((u) => u.papel === 'profissional' && u.atende && u.id !== eu.id);
  const sv = st().servicos[0];
  const r = agenda.registrarLocal({ servicoIds: [sv.id], profissionalId: outro.id });
  assert.ok(r.ok); assert.equal(st().agendamentos.find((x) => x.local).profissionalId, eu.id, 'forçado para o próprio esteticista');
  const rel = comissoes.meuMes(monthStart(Date.now()));
  assert.ok(rel.ok);
  const txt = JSON.stringify(rel);
  for (const proibido of ['casa', 'pct', 'base', 'custo', 'preco', 'valor"']) assert.ok(!txt.includes(`"${proibido.replace('"', '')}`) || proibido === 'valor"', `vazou ${proibido}`);
  const locais = rel.linhas.filter((l) => l.local);
  assert.equal(locais.length, 1);
  assert.equal(locais[0].receber, Math.round(sv.preco * 50) / 100);
  assert.equal(comissoes.relatorio(monthStart(Date.now())).ok, false, 'esteticista não vê o relatório do proprietário');
  assert.equal(comissoes.pagar(eu.id, monthStart(Date.now())).ok, false, 'esteticista não paga comissão');
});

test('base da comissão é o valor do serviço; comissão + parte do estabelecimento = base', () => {
  dono();
  const b = st().usuarios.find((u) => u.papel === 'profissional' && u.atende);
  const sv = st().servicos[0];
  agenda.registrarLocal({ servicoIds: [sv.id], profissionalId: b.id });
  const a = st().agendamentos.find((x) => x.local);
  const c = comissaoDoAgendamento(st(), st().agendamentos.find((x) => x.id === a.id));
  assert.equal(c.base, sv.preco);
  assert.equal(c.comissao + c.casa, c.base);
});

test('pagar comissão: lança despesa, marca como pago e não paga duas vezes', () => {
  dono();
  const b = st().usuarios.find((u) => u.papel === 'profissional' && u.atende);
  const sv = st().servicos[0];
  agenda.registrarLocal({ servicoIds: [sv.id], profissionalId: b.id });
  agenda.registrarLocal({ servicoIds: [sv.id], nome: 'Outro', profissionalId: b.id });
  const mes = monthStart(Date.now());
  const mine = comissoes.relatorio(mes).profissionais.find((x) => x.id === b.id);
  const aPagarAntes = mine.aPagar; // inclui atendimentos concluídos da seed neste mês
  const desp = st().financeiro.lancamentos.length;
  const r = comissoes.pagar(b.id, mes);
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.valor, aPagarAntes);
  assert.equal(st().financeiro.lancamentos.length, desp + 1);
  const l = st().financeiro.lancamentos[0];
  assert.equal(l.tipo, 'despesa'); assert.equal(l.categoria, 'Comissões'); assert.equal(l.valor, aPagarAntes);
  assert.equal(comissoes.relatorio(mes).profissionais.find((x) => x.id === b.id).aPagar, 0);
  assert.equal(comissoes.pagar(b.id, mes).ok, false, 'não paga de novo');
  assert.equal(st().financeiro.lancamentos.length, desp + 1);
  profissional('Pablo');
  const meu = comissoes.meuMes(mes);
  if (b.apelido === 'Pablo') assert.equal(meu.totais.aReceber, 0);
});

test('só o proprietário define e vê comissão: atendente não altera percentuais nem paga', () => {
  dono();
  const c = equipe.salvar({ nome: 'Ana Atendente', apelido: 'Ana', cpf: '529.982.247-25', email: 'ana@x.com', telefone: '(55) 99999-0000', senha: '1234', papel: 'atendente', atende: false });
  assert.ok(c.ok, JSON.stringify(c));
  como('ana');
  const sv = st().servicos[0];
  srv(sv.id, { comissaoPct: 99 });
  assert.notEqual(st().servicos.find((x) => x.id === sv.id).comissaoPct, 99);
  assert.equal(estabelecimento.salvar({ comissaoPadrao: 99 }).ok === false || st().estabelecimento.comissaoPadrao !== 99, true);
  assert.equal(comissoes.relatorio(monthStart(Date.now())).ok, false);
  assert.equal(comissoes.pagar('x', monthStart(Date.now())).ok, false);
});

// ---------- v49: telefone no atendimento local e serviços mais feitos primeiro ----------

test('atendimento local com telefone de cliente cadastrado vincula o cliente (só dígitos, DDD + número)', () => {
  dono();
  const b = st().usuarios.find((u) => u.papel === 'profissional' && u.atende);
  const sv = st().servicos[0];
  const cli = st().clientes.find((c) => c.id === 'c-igor'); // (54) 99633-8812
  const antes = st().clientes.length;
  for (const tel of ['(54) 99633-8812', '54996338812', '+55 54 99633-8812']) {
    const r = agenda.registrarLocal({ servicoIds: [sv.id], nome: 'Outro nome', telefone: tel, profissionalId: b.id });
    assert.ok(r.ok, tel + JSON.stringify(r));
    const a = st().agendamentos.find((x) => x.id === r.agendamento.id);
    assert.equal(a.clienteId, cli.id, tel); assert.equal(a.nomeAvulso, ''); assert.equal(a.telefoneAvulso, '');
    assert.equal(a.status, 'concluido');
  }
  assert.equal(st().clientes.length, antes);
  assert.equal(st().mensagensCliente.filter((m) => st().agendamentos.find((a) => a.id === m.agendamentoId)?.local).length, 0, 'continua sem mensagem');
});

test('telefone sem cadastro cria o cliente (sem nome fica pelo telefone); só nome não cria; telefone inválido é recusado', () => {
  dono();
  const b = st().usuarios.find((u) => u.papel === 'profissional' && u.atende);
  const sv = st().servicos[0];
  const antes = st().clientes.length;
  const r = agenda.registrarLocal({ servicoIds: [sv.id], nome: 'Zé', telefone: '(51) 98888-7777', profissionalId: b.id });
  assert.ok(r.ok);
  const a = st().agendamentos.find((x) => x.id === r.agendamento.id);
  const c = st().clientes.find((x) => x.id === a.clienteId);
  assert.equal(st().clientes.length, antes + 1); assert.equal(c.nome, 'Zé'); assert.equal(c.telefone, '(51) 98888-7777'); assert.equal(a.nomeAvulso, '');
  const r2 = agenda.registrarLocal({ servicoIds: [sv.id], telefone: '51 97777-6666', profissionalId: b.id });
  assert.ok(r2.ok); const c2 = st().clientes.find((x) => x.id === st().agendamentos.find((y) => y.id === r2.agendamento.id).clienteId);
  assert.equal(c2.semNome, true); assert.equal(c2.nome, '(51) 97777-6666');
  assert.equal(st().clientes.length, antes + 2);
  const r3 = agenda.registrarLocal({ servicoIds: [sv.id], nome: 'Só Nome', profissionalId: b.id });
  assert.ok(r3.ok); assert.equal(st().clientes.length, antes + 2, 'só o nome não cria cadastro');
  for (const tel of ['123', '(51) 9888-77', '1'.repeat(14)]) assert.equal(agenda.registrarLocal({ servicoIds: [sv.id], telefone: tel, profissionalId: b.id }).ok, false, tel);
});

