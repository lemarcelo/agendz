/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Planos de serviço: cota mensal derivada dos agendamentos (acúmulo, adiantamento, atraso), catálogo, mensalidade, estorno, encerramento,
// pedido pelo link, saldo por telefone (resposta genérica e limite) e permissão da seção `planos`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS } from '../src/domain/rules.js';
import { extrato, montarPlano, podeUsar, saldoAtual, descontosDoPlano, usoParaAgendamento, aReceber } from '../src/domain/planos.js';
import * as AS from '../src/domain/assinaturas.js';
import { store, auth, planos, publico } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';

const em = (m, d, h = 10) => new Date(2026, m - 1, d, h, 0).getTime();
const base = () => ({
  servicos: [{ id: 'sv1', nome: 'Corte' }, { id: 'sv2', nome: 'Barba' }, { id: 'cb', nome: 'Combo', combo: true }],
  clientes: [{ id: 'c1', nome: 'Ana', telefone: '(51) 99999-0001' }],
  planos: [], assinaturas: [], agendamentos: [], financeiro: { lancamentos: [] }, seq: {},
});
const plano = (s, extra = {}) => { const r = montarPlano(s, { nome: 'Degradê em Dia', preco: 75, cortes: 2, servicoIds: ['sv1'], ...extra }); assert.ok(r.ok, JSON.stringify(r)); return r.dados; };
function assinatura(s, p, { inicioMes = '2026-10', pagos = ['2026-10'] } = {}) {
  const as = { id: 'as1', clienteId: 'c1', planoId: 'p1', plano: { ...p, servicoIds: [...p.servicoIds] }, status: 'ativa', inicioMes, pagamentos: pagos.map((mes, i) => ({ id: `mp${i}`, mes, valor: p.preco, forma: 'pix', estornado: false })), divida: 0 };
  s.assinaturas.push(as); return as;
}
let n = 0;
const uso = (s, inicio, status = STATUS.CONCLUIDO, extra = {}) => s.agendamentos.push({ id: `a${++n}`, inicio, status, origem: 'painel', planoUso: { assinaturaId: 'as1', incluidos: ['sv1'] }, ...extra });

test('catálogo: nome, valor, cortes e serviços são conferidos; combo não entra; nome repetido é recusado', () => {
  const s = base();
  assert.equal(montarPlano(s, { nome: 'x', preco: 10, cortes: 1, servicoIds: ['sv1'] }).ok, false);
  assert.equal(montarPlano(s, { nome: 'Ok', preco: 0, cortes: 1, servicoIds: ['sv1'] }).ok, false);
  assert.equal(montarPlano(s, { nome: 'Ok', preco: 10, cortes: 32, servicoIds: ['sv1'] }).ok, false);
  assert.equal(montarPlano(s, { nome: 'Ok', preco: 10, cortes: 1, servicoIds: [] }).ok, false);
  assert.equal(montarPlano(s, { nome: 'Ok', preco: 10, cortes: 1, servicoIds: ['cb'] }).ok, false, 'combo não');
  assert.equal(montarPlano(s, { nome: 'Ok', preco: 10, cortes: 1, servicoIds: ['sv1', 'sv1'] }).ok, false, 'repetido');
  assert.equal(montarPlano(s, { nome: 'Ok', preco: 10, cortes: 1, servicoIds: ['sv1'], adianta: 9 }).ok, false);
  s.planos.push({ id: 'p1', nome: 'Ok' });
  assert.equal(montarPlano(s, { nome: 'ok', preco: 10, cortes: 1, servicoIds: ['sv1'] }).ok, false, 'nome repetido sem diferenciar maiúscula');
  const r = montarPlano(s, { nome: 'Ok', preco: 10.456, cortes: 1, servicoIds: ['sv1'] }, { id: 'p1' });
  assert.ok(r.ok); assert.equal(r.dados.preco, 10.46); assert.equal(r.dados.adianta, 1); assert.equal(r.dados.acumuloMeses, 2); assert.equal(r.dados.intervaloDias, 3);
});

test('cota: o mês pago dá os cortes; sem mensalidade registrada não há saldo', () => {
  const s = base(); const p = plano(s);
  const as = assinatura(s, p, { pagos: [] });
  assert.equal(saldoAtual(s, as, em(10, 15)).restantes, 0);
  assert.equal(podeUsar(s, as, { inicio: em(10, 20), agora: em(10, 15) }).ok, false);
  as.pagamentos.push({ id: 'm', mes: '2026-10', valor: 75, forma: 'pix', estornado: false });
  assert.equal(saldoAtual(s, as, em(10, 15)).restantes, 2);
  assert.equal(podeUsar(s, as, { inicio: em(10, 20), agora: em(10, 15) }).ok, true);
});

test('cota: gasta 2, o terceiro é adiantado (com aviso) e o quarto é recusado', () => {
  const s = base(); const p = plano(s); const as = assinatura(s, p);
  uso(s, em(10, 5)); uso(s, em(10, 12));
  assert.equal(saldoAtual(s, as, em(10, 15)).restantes, 0);
  const terceiro = podeUsar(s, as, { inicio: em(10, 20), agora: em(10, 15) });
  assert.ok(terceiro.ok && terceiro.adiantado, JSON.stringify(terceiro));
  assert.match(terceiro.aviso, /adiantado/i);
  uso(s, em(10, 20));
  const quarto = podeUsar(s, as, { inicio: em(10, 27), agora: em(10, 15) });
  assert.equal(quarto.ok, false); assert.match(quarto.erro, /acabaram/);
});

test('cota: o que sobra acumula (até o teto) e o excedente sai do mês seguinte', () => {
  const s = base(); const p = plano(s, { cortes: 2, acumuloMeses: 2 }); // teto 4
  const as = assinatura(s, p, { pagos: ['2026-10', '2026-11', '2026-12'] });
  const ex = extrato(s, as, em(12, 2));
  assert.deepEqual(ex.linhas.map((l) => l.saldoFim), [2, 4, 4], 'nenhum corte usado: 2, 4 e para no teto de 4');
  uso(s, em(10, 3)); uso(s, em(10, 10)); uso(s, em(10, 20)); // 3 em outubro: -1
  const ex2 = extrato(s, as, em(10, 21));
  assert.equal(ex2.linhas[0].saldoFim, -1);
  const ex3 = extrato(s, as, em(11, 2));
  assert.equal(ex3.linhas[1].saldoFim, 1, 'novembro começa descontado do excedente: -1 + 2');
});

test('cota: intervalo mínimo entre dois cortes e plano que ainda não começou', () => {
  const s = base(); const p = plano(s, { cortes: 4, intervaloDias: 3 }); const as = assinatura(s, p);
  uso(s, em(10, 10));
  assert.equal(podeUsar(s, as, { inicio: em(10, 11), agora: em(10, 9) }).ok, false);
  assert.equal(podeUsar(s, as, { inicio: em(10, 13), agora: em(10, 9) }).ok, true);
  const antes = podeUsar(s, as, { inicio: em(9, 20), agora: em(10, 9) });
  assert.equal(antes.ok, false); assert.match(antes.erro, /começa em/);
});

test('cota: mês sem pagamento não dá corte novo, mas o saldo acumulado vale; 2 meses sem pagar zeram', () => {
  const s = base(); const p = plano(s, { cortes: 2 }); const as = assinatura(s, p);
  uso(s, em(10, 5));
  assert.equal(podeUsar(s, as, { inicio: em(11, 5), agora: em(10, 20) }).ok, true, 'sobrou 1 de outubro');
  uso(s, em(11, 5));
  const seg = podeUsar(s, as, { inicio: em(11, 20), agora: em(10, 20) });
  assert.equal(seg.ok, false); assert.match(seg.erro, /mensalidade de .* não foi registrada/);
  s.agendamentos.pop(); // sem o uso de novembro, sobra 1 corte de outubro
  const ex = extrato(s, as, em(12, 20));
  assert.ok(ex.linhas.some((l) => l.zerou), 'novembro e dezembro sem pagar: o acumulado expira');
  assert.equal(ex.saldo, 0);
});

test('cancelado devolve o corte, mas a falta de confirmação consome (menos no pedido do link)', () => {
  const s = base(); const p = plano(s, { cortes: 1 }); const as = assinatura(s, p);
  uso(s, em(10, 5), STATUS.CANCELADO, { motivoCancelamento: 'cliente' });
  assert.equal(saldoAtual(s, as, em(10, 20)).restantes, 1);
  uso(s, em(10, 8), STATUS.CANCELADO, { motivoCancelamento: 'falta_confirmacao', origem: 'whatsapp' });
  assert.equal(saldoAtual(s, as, em(10, 20)).restantes, 0, 'não confirmou: gasta');
  s.agendamentos.pop(); uso(s, em(10, 8), STATUS.CANCELADO, { motivoCancelamento: 'falta_confirmacao', origem: 'link' });
  assert.equal(saldoAtual(s, as, em(10, 20)).restantes, 1, 'no link quem não confirmou foi a loja: o corte volta');
});

test('uso no agendamento: só serviço do plano, só do próprio cliente; o item do plano sai de graça e o resto é cobrado', () => {
  const s = base(); const p = plano(s); const as = assinatura(s, p); as.id = 'as1';
  assert.equal(usoParaAgendamento(s, { assinaturaId: 'as1', clienteId: 'outro', servicoIds: ['sv1'], inicio: em(10, 20), agora: em(10, 15) }).ok, false);
  assert.equal(usoParaAgendamento(s, { assinaturaId: 'as1', clienteId: 'c1', servicoIds: ['sv2'], inicio: em(10, 20), agora: em(10, 15) }).ok, false);
  const u = usoParaAgendamento(s, { assinaturaId: 'as1', clienteId: 'c1', servicoIds: ['sv1', 'sv2'], inicio: em(10, 20), agora: em(10, 15) });
  assert.ok(u.ok);
  assert.deepEqual(descontosDoPlano(u.uso, [{ id: 'sv1', valor: 40 }, { id: 'sv2', valor: 30 }]), { sv1: 40 });
});

test('a receber: assinatura ativa sem a mensalidade do mês', () => {
  const s = base(); const p = plano(s); const as = assinatura(s, p, { pagos: ['2026-10'] });
  assert.equal(aReceber(s, em(10, 20)).length, 0);
  assert.equal(aReceber(s, em(11, 2)).length, 1);
  as.status = 'cancelada';
  assert.equal(aReceber(s, em(11, 2)).length, 0);
});

// ---------- pela API simulada ----------
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok, a); };
const umPlano = (extra = {}) => planos.salvar({ nome: 'Plano Lavagem', preco: 90, cortes: 2, servicoIds: ['s-lav-simples'], ...extra });
test.beforeEach(() => reiniciar());

test('API: só quem tem a seção Planos mexe; o dono libera por pessoa; o padrão é ninguém', () => {
  como('davi'); assert.ok(umPlano().ok);
  como('pablo');
  assert.equal(planos.listar().ok, false); assert.equal(umPlano({ nome: 'Outro' }).ok, false);
  assert.equal(planos.contratar({ clienteId: 'c-igor', planoId: 'x' }).ok, false);
  assert.equal(planos.pagar('as1', { forma: 'pix' }).ok, false);
});

test('API: contratar, pagar, estornar, encerrar com dívida e travar plano novo', () => {
  como('davi');
  const p = umPlano().plano;
  const c = planos.contratar({ clienteId: 'c-igor', planoId: p.id });
  assert.ok(c.ok, JSON.stringify(c)); assert.equal(c.assinatura.status, 'pendente');
  assert.equal(planos.contratar({ clienteId: 'c-igor', planoId: p.id }).ok, false, 'um plano aberto por cliente');
  const mes = planos.listar().mes;
  assert.equal(planos.pagar(c.assinatura.id, { mes, forma: 'boleto' }).ok, false);
  const pg = planos.pagar(c.assinatura.id, { mes, forma: 'pix' });
  assert.ok(pg.ok, JSON.stringify(pg)); assert.equal(pg.pagamento.valor, 90);
  assert.equal(planos.pagar(c.assinatura.id, { mes, forma: 'pix' }).ok, false, 'a mesma mensalidade não se repete');
  const l = planos.listar().assinaturas[0];
  assert.equal(l.status, 'ativa'); assert.equal(l.saldo.restantes, 2);
  assert.equal(planos.estornar(c.assinatura.id, pg.pagamento.id, 'x').ok, false, 'motivo curto');
  assert.ok(planos.estornar(c.assinatura.id, pg.pagamento.id, 'cliente desistiu').ok);
  assert.equal(planos.listar().assinaturas[0].status, 'pendente');
  assert.ok(planos.encerrar(c.assinatura.id, 'cliente mudou de cidade').ok);
  assert.ok(planos.contratar({ clienteId: 'c-igor', planoId: p.id }).ok, 'sem dívida, pode contratar de novo');
});

test('API: pedido pelo link só chega ao dono; isca, repetição e plano desativado', () => {
  como('davi');
  const p = umPlano().plano;
  auth.logout();
  assert.equal(publico.planos().planos.length, 1);
  assert.deepEqual(Object.keys(publico.planos().planos[0]).sort(), ['cortes', 'descricao', 'id', 'nome', 'preco', 'produtos', 'servicos', 'validadeMeses']);
  assert.equal(publico.pedirPlano({ nome: 'Joana', telefone: '(51) 98888-7777', planoId: p.id, site: 'robo' }).ok, false, 'isca preenchida');
  assert.ok(publico.pedirPlano({ nome: 'Joana', telefone: '(51) 98888-7777', planoId: p.id }).ok);
  assert.ok(publico.pedirPlano({ nome: 'Joana', telefone: '(51) 98888-7777', planoId: p.id }).ok, 'repetido: mesma resposta');
  como('davi');
  const l = planos.listar();
  assert.equal(l.pedidos.length, 1, 'sem duplicar');
  const a = planos.aceitarPedido(l.pedidos[0].id);
  assert.ok(a.ok, JSON.stringify(a)); assert.equal(a.assinatura.status, 'pendente');
  assert.equal(planos.listar().pedidos.length, 0);
  assert.equal(planos.aceitarPedido(l.pedidos[0].id).ok, false, 'já resolvido');
});

test('API: saldo por telefone só mostra o número de cortes, com resposta genérica e limite de consultas', () => {
  como('davi');
  const p = umPlano().plano;
  const cli = store.getState().clientes[0];
  const c = planos.contratar({ clienteId: cli.id, planoId: p.id }).assinatura;
  assert.ok(planos.pagar(c.id, { forma: 'dinheiro' }).ok);
  auth.logout();
  const ok = publico.saldoDoPlano(cli.telefone);
  assert.ok(ok.ok); assert.deepEqual(Object.keys(ok.planos[0]).sort(), ['cortesPorMes', 'mes', 'pagoMes', 'plano', 'restantes']);
  assert.equal(ok.planos[0].restantes, 2);
  const nenhum = publico.saldoDoPlano('(51) 90000-0000');
  assert.deepEqual(nenhum.planos, []); assert.equal(nenhum.aviso, AS.GENERICO_SALDO);
  assert.equal(publico.saldoDoPlano('abc').ok === false || publico.saldoDoPlano('abc').planos.length === 0, true);
  let bloqueou = false;
  for (let i = 0; i < 8; i++) if (publico.saldoDoPlano('(51) 91111-2222').ok === false) bloqueou = true;
  assert.ok(bloqueou, 'passou de 5 consultas em 15 min: bloqueia');
});
