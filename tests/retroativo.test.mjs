/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atendimento esquecido (lançamento de dia anterior) e cancelamento de comissão: motivo obrigatório, quem pode, e a comissão de um período já pago
// entra no PRÓXIMO pagamento. Decisões do Marcelo em 28/10/2026 (prompt, histórico v84).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, comissoes } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { monthStart } from '../src/domain/time.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); const r = auth.login({ identificador: a, senha: '1234' }); assert.ok(r.ok, a); };
const ag = (id) => st().agendamentos.find((a) => a.id === id);
const DIA = 24 * 3600 * 1000;
const base = { servicoIds: ['s-lav-simples'], profissionalId: 'u-pablo' };
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi'); });

test('dia anterior exige o motivo; fica no histórico; hoje (hora anterior) não exige', () => {
  const ontem = store.agora() - DIA;
  const sem = agenda.atender({ ...base, inicio: ontem });
  assert.equal(sem.ok, false); assert.match(sem.erros[0], /motivo do lançamento/);
  assert.equal(agenda.atender({ ...base, inicio: ontem, motivoRetroativo: 'abc' }).ok, false, 'motivo curto demais');
  const r = agenda.atender({ ...base, inicio: ontem, motivoRetroativo: '  Esqueci de lançar  ' });
  assert.ok(r.ok, JSON.stringify(r));
  const a = ag(r.agendamento.id);
  assert.equal(a.retroativo.motivo, 'Esqueci de lançar'); assert.equal(a.retroativo.proximoPagamento, false); assert.equal(a.comissaoEm, undefined);
  assert.ok(a.log.some((l) => l.campo === 'lançamento retroativo' && /Esqueci de lançar/.test(l.para)));
  const hoje = agenda.atender({ ...base, inicio: store.agora() - 3600 * 1000 });
  assert.ok(hoje.ok, 'hoje, uma hora atrás, é atendimento comum'); assert.equal(ag(hoje.agendamento.id).retroativo, undefined);
  assert.equal(agenda.atender({ ...base, inicio: ontem, motivoRetroativo: 'x'.repeat(301) }).ok, false);
});

test('profissional só lança o que aconteceu hoje; recepção e proprietário lançam dia anterior', () => {
  como('pablo');
  const r = agenda.atender({ servicoIds: ['s-lav-simples'], inicio: store.agora() - DIA, motivoRetroativo: 'Esqueci de lançar' });
  assert.equal(r.ok, false); assert.match(r.erros[0], /proprietário ou a recepção/);
  assert.ok(agenda.atender({ servicoIds: ['s-lav-simples'], inicio: store.agora() - 3600 * 1000 }).ok, 'hoje pode');
  como('davi');
  assert.ok(agenda.atender({ ...base, inicio: store.agora() - DIA, motivoRetroativo: 'Esqueci de lançar' }).ok);
});

test('período da comissão já pago: o atendimento esquecido entra no próximo pagamento, sem reabrir o mês fechado', () => {
  const velho = store.agora() - 40 * DIA; // mês anterior
  const a1 = agenda.atender({ ...base, inicio: velho, motivoRetroativo: 'Esqueci de lançar' });
  assert.ok(a1.ok, JSON.stringify(a1)); assert.equal(ag(a1.agendamento.id).retroativo.proximoPagamento, false, 'período ainda aberto: segue a data normal');
  const mesVelho = monthStart(velho);
  assert.ok(comissoes.pagar('u-pablo', mesVelho).ok, 'paga o mês antigo');
  const a2 = agenda.atender({ ...base, inicio: velho + 3600 * 1000, motivoRetroativo: 'Também esqueci deste' });
  assert.ok(a2.ok, JSON.stringify(a2));
  const x = ag(a2.agendamento.id);
  assert.equal(x.retroativo.proximoPagamento, true); assert.equal(x.comissaoEm, store.agora());
  assert.ok(x.log.some((l) => l.campo === 'lançamento retroativo' && /próximo pagamento/.test(l.para)));
  const velhoRel = comissoes.relatorio(mesVelho);
  assert.equal(velhoRel.profissionais.find((p) => p.id === 'u-pablo').aPagar, 0, 'o mês fechado continua fechado');
  const atual = comissoes.relatorio(monthStart(store.agora()));
  const pablo = atual.profissionais.find((p) => p.id === 'u-pablo');
  assert.ok(pablo.aPagar > 0, 'aparece em aberto no mês atual');
  assert.ok(comissoes.pagar('u-pablo', monthStart(store.agora())).ok, 'e é paga no próximo pagamento');
  assert.equal(comissoes.relatorio(monthStart(store.agora())).profissionais.find((p) => p.id === 'u-pablo').aPagar, 0);
});

test('cancelar a comissão: só o proprietário, com motivo, não se já paga; a parte vira do estabelecimento; restaurar volta', () => {
  const r = agenda.atender({ ...base, inicio: store.agora() - 3600 * 1000 });
  const id = r.agendamento.id;
  const antes = comissoes.relatorio(monthStart(store.agora())).profissionais.find((p) => p.id === 'u-pablo');
  assert.ok(antes.comissao > 0);
  assert.equal(comissoes.cancelar(id, { motivo: '' }).ok, false, 'sem motivo');
  assert.equal(comissoes.cancelar(id, { motivo: 'abc' }).ok, false, 'motivo curto');
  como('pablo'); assert.equal(comissoes.cancelar(id, { motivo: 'Quero minha comissão cancelada' }).ok, false, 'profissional não cancela'); como('davi');
  const c = comissoes.cancelar(id, { motivo: 'Cliente pagou com cortesia' });
  assert.ok(c.ok, JSON.stringify(c));
  assert.equal(comissoes.cancelar(id, { motivo: 'Cliente pagou com cortesia' }).ok, false, 'já cancelada');
  const depois = comissoes.relatorio(monthStart(store.agora())).profissionais.find((p) => p.id === 'u-pablo');
  assert.equal(depois.comissao, +(antes.comissao - antes.linhas.find((l) => l.a.id === id).comissao).toFixed(2), 'a comissão do atendimento sai do total');
  assert.equal(depois.aPagar, depois.comissao);
  assert.ok(ag(id).log.some((l) => l.campo === 'comissão' && /Cancelada: Cliente pagou com cortesia/.test(l.para)));
  // o profissional vê a linha zerada, marcada como cancelada, com o motivo
  como('pablo');
  const meu = comissoes.meuMes(monthStart(store.agora())).linhas.find((l) => l.id === id);
  assert.equal(meu.receber, 0); assert.equal(meu.cancelada, true); assert.equal(meu.motivoCancelada, 'Cliente pagou com cortesia');
  como('davi');
  assert.ok(comissoes.restaurar(id).ok);
  assert.equal(comissoes.relatorio(monthStart(store.agora())).profissionais.find((p) => p.id === 'u-pablo').comissao, antes.comissao);
  assert.equal(comissoes.restaurar(id).ok, false, 'nada a restaurar');
  // paga: não cancela
  assert.ok(comissoes.pagar('u-pablo', monthStart(store.agora())).ok);
  const paga = comissoes.cancelar(id, { motivo: 'Tentando depois de pagar' });
  assert.equal(paga.ok, false); assert.match(paga.erros[0], /já paga/);
});

test('pagar a comissão ignora a parte cancelada (não vira "paga")', () => {
  const r = agenda.atender({ ...base, inicio: store.agora() - 3600 * 1000 });
  assert.ok(comissoes.cancelar(r.agendamento.id, { motivo: 'Cortesia da casa' }).ok);
  const p = comissoes.pagar('u-pablo', monthStart(store.agora()));
  assert.ok(p.ok, JSON.stringify(p)); // há outros atendimentos do mês em aberto
  assert.ok(!p.pagamento.agendamentoIds.includes(r.agendamento.id), 'o cancelado não entra no pagamento');
  assert.equal(ag(r.agendamento.id).comissaoPaga, undefined);
  assert.ok(ag(r.agendamento.id).comissaoCancelada, 'continua cancelado');
});
