// Autoagendamento pelo link: horários sem vazar ocupação, status "Cliente agendou", acesso do cliente, limites e lembretes de 24 h e 2 h.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, agenda, estabelecimento, publico } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { addDays, startOfDay, fmtHM } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';
import { statusVisual } from '../src/domain/rules.js';
import { contarMarcadores, marcadoresDe } from '../src/domain/marcadores.js';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok); };
const ag = (id) => st().agendamentos.find((a) => a.id === id);
const H = 3600 * 1000;
const dia = (n = 3) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const SV = ['s-lav-simples'];
const slots = (n = 3, profissionalId = 'u-pablo') => publico.horarios({ profissionalId, servicoIds: SV, dayTs: dia(n) });
const tel = (i) => `(51) 9${String(8000 + i).padStart(4, '0')}-${String(1000 + i).padStart(4, '0')}`;
const pedir = (i, inicio, extra = {}) => publico.agendar({ nome: `Cliente Teste ${i}`, telefone: tel(i), servicoIds: SV, profissionalId: 'u-pablo', inicio, ...extra });
const msgs = (chave) => st().mensagensCliente.filter((m) => m.modeloId === `m-${chave.replace(/_/g, '-')}`);
test.beforeEach(() => { mock.timers.reset(); mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-12T07:00:00-03:00') }); reiniciar(); como('davi'); });

test('horários públicos: só { inicio, profissionalId }, sem quem ocupa; horário ocupado some', () => {
  const antes = slots();
  assert.ok(antes.length > 3);
  for (const h of antes) assert.deepEqual(Object.keys(h).sort(), ['inicio', 'profissionalId']);
  const alvo = antes[2].inicio;
  const r = agenda.criar({ clienteId: st().clientes[0].id, profissionalId: 'u-pablo', servicoIds: SV, inicio: alvo });
  assert.ok(r.ok, JSON.stringify(r));
  const depois = slots();
  assert.ok(!depois.some((h) => h.inicio === alvo), 'o horário ocupado não aparece');
  const texto = JSON.stringify(depois) + JSON.stringify(publico.config());
  for (const c of st().clientes) assert.ok(!texto.includes(c.nome) && !texto.includes(c.telefone), 'nenhum dado de cliente');
});

test('pedido pelo link: nasce "Cliente agendou", salva o contato, avisa o painel e o cliente, devolve o token', () => {
  const n = st().clientes.length;
  const h = slots()[0];
  const r = pedir(1, h.inicio);
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.token.length, 48);
  const a = ag(r.agendamentoId);
  assert.equal(a.status, 'a_confirmar'); assert.equal(a.origem, 'link'); assert.equal(a.clienteAgendou, true);
  assert.equal(statusVisual(a, store.agora()).rotulo, 'Cliente agendou');
  assert.deepEqual(marcadoresDe(a, store.agora()), ['cliente-agendou']);
  assert.equal(st().clientes.length, n + 1);
  const c = st().clientes.find((x) => x.id === a.clienteId);
  assert.equal(c.telefone, '(51) 98001-1001'); assert.equal(c.origemCadastro, 'link');
  assert.equal(msgs('cliente_agendou').length, 1);
  assert.ok(st().avisosPainel.some((x) => x.agendamentoId === a.id && /Cliente agendou/.test(x.texto)));
  assert.equal(a.plano.length, 0, 'sem pergunta de confirmação ao cliente');
  assert.equal(contarMarcadores(st().agendamentos, store.agora())['cliente-agendou'], 1);
});

test('ninguém disputa horário: o segundo pedido no mesmo horário é recusado; "qualquer esteticista" escolhe quem está livre', () => {
  const h = slots()[0].inicio;
  assert.ok(pedir(1, h).ok);
  const r2 = pedir(2, h);
  assert.equal(r2.ok, false); assert.match(r2.erros[0], /acabou de ser ocupado/);
  const r3 = publico.agendar({ nome: 'Outra Pessoa', telefone: tel(3), servicoIds: SV, profissionalId: '', inicio: h });
  if (r3.ok) assert.notEqual(ag(r3.agendamentoId).profissionalId, 'u-pablo', 'foi para outro esteticista');
  // sobreposição parcial também conta
  assert.equal(pedir(4, h + 30 * 60000).ok, false, 'o horário seguinte ainda está dentro do corte anterior');
});

test('entradas inválidas: DDD, telefone, nome, serviço, isca, data, link desligado', () => {
  const h = slots()[0].inicio;
  assert.match(publico.agendar({ nome: 'Ana Lima', telefone: '(11) 98888-7777', servicoIds: SV, profissionalId: 'u-pablo', inicio: h }).erros[0], /DDD/);
  assert.equal(pedir(1, h, { telefone: '123' }).ok, false);
  assert.equal(pedir(1, h, { nome: 'A' }).ok, false);
  assert.equal(pedir(1, h, { servicoIds: ['x'] }).ok, false);
  assert.equal(pedir(1, h, { servicoIds: [] }).ok, false);
  assert.equal(pedir(1, h, { site: 'http://robo' }).ok, false, 'campo isca preenchido');
  assert.equal(pedir(1, h, { inicio: store.agora() + 90 * 24 * H }).ok, false, 'além do limite de dias');
  assert.equal(pedir(1, 'amanhã').ok, false);
  assert.equal(publico.agendar({ nome: { $gt: '' }, telefone: tel(1), servicoIds: SV, inicio: h }).ok, false);
  assert.equal(st().agendamentos.filter((a) => a.origem === 'link').length, 0, 'nada foi gravado');
  assert.ok(estabelecimento.salvar({ linkAgendamento: { ativo: false, diasMax: 30 } }).ok);
  assert.equal(pedir(1, h).ok, false); assert.deepEqual(slots(), []);
  assert.equal(estabelecimento.salvar({ linkAgendamento: { ativo: 'sim', diasMax: 99 } }).ok, false);
});

test('limites: 3 horários em aberto por cliente e 5 pedidos por minuto por telefone', () => {
  const hs = slots();
  for (let i = 0; i < 3; i++) assert.ok(pedir(1, hs[i * 3].inicio).ok, 'pedido ' + i);
  assert.match(pedir(1, hs[10].inicio).erros[0], /3 horários/);
  reiniciar(); como('davi');
  const h = slots()[0].inicio;
  let recusas = 0;
  for (let i = 0; i < 8; i++) if (/Muitas tentativas/.test(publico.agendar({ nome: 'Rob Ot', telefone: tel(9), servicoIds: SV, profissionalId: 'u-pablo', inicio: h, site: 'x' }).erros?.[0] || '')) recusas++;
  assert.ok(recusas >= 3, 'tentativas em excesso são barradas');
});

test('acesso só aos próprios agendamentos: token de outro, inválido ou forjado nunca abre nada', () => {
  const hs = slots();
  const a = pedir(1, hs[0].inicio); const b = pedir(2, hs[4].inicio);
  assert.ok(a.ok && b.ok);
  const minha = publico.meus(a.token);
  assert.ok(minha.ok); assert.equal(minha.futuros.length, 1); assert.equal(minha.futuros[0].id, a.agendamentoId);
  assert.ok(!JSON.stringify(minha).includes('Cliente Teste 2') && !JSON.stringify(minha).includes('98002'));
  assert.equal(publico.cancelar(a.token, b.agendamentoId).ok, false, 'não cancela o de outro');
  assert.equal(publico.remarcar(a.token, b.agendamentoId, hs[8].inicio).ok, false, 'não remarca o de outro');
  assert.deepEqual(publico.horariosParaRemarcar(a.token, b.agendamentoId, dia()), []);
  assert.equal(ag(b.agendamentoId).status, 'a_confirmar');
  for (const t of [undefined, null, '', 'abc', 'x'.repeat(48), 'a'.repeat(47), 12345, {}, [a.token]]) assert.equal(publico.meus(t).ok, false);
  assert.equal(publico.lembretes('x'.repeat(48), true).ok, false);
});

test('código de acesso: resposta igual com ou sem cadastro; 5 tentativas; uso único; vale 30 minutos', () => {
  const hs = slots();
  assert.ok(pedir(1, hs[0].inicio).ok);
  const n0 = st().mensagensCliente.length;
  const desconhecido = publico.pedirCodigo('(51) 90000-0000');
  assert.deepEqual(desconhecido, { ok: true }); assert.equal(st().mensagensCliente.length, n0, 'nada enviado a quem não tem cadastro');
  assert.deepEqual(publico.pedirCodigo(tel(1)), { ok: true });
  const m = msgs('codigo_acesso'); assert.equal(m.length, 1);
  const codigo = m[0].texto.match(/\b(\d{6})\b/)[1];
  for (let i = 0; i < 5; i++) assert.equal(publico.entrar({ telefone: tel(1), codigo: '000000' === codigo ? '111111' : '000000' }).ok, false);
  assert.equal(publico.entrar({ telefone: tel(1), codigo }).ok, false, 'depois de 5 erros nem o certo vale');
  publico.pedirCodigo(tel(1));
  const c2 = msgs('codigo_acesso')[0].texto.match(/\b(\d{6})\b/)[1];
  const ok = publico.entrar({ telefone: tel(1), codigo: c2 });
  assert.ok(ok.ok, JSON.stringify(ok)); assert.ok(publico.meus(ok.token).ok);
  assert.equal(publico.entrar({ telefone: tel(1), codigo: c2 }).ok, false, 'uso único');
  publico.pedirCodigo(tel(1));
  const c3 = msgs('codigo_acesso')[0].texto.match(/\b(\d{6})\b/)[1];
  store.avancar(31 * 60000);
  assert.equal(publico.entrar({ telefone: tel(1), codigo: c3 }).ok, false, 'vencido');
});

test('cancelar: só com 24 h ou mais; dentro do prazo, recusado', () => {
  const cedo = pedir(1, slots(1)[0].inicio); // próximo dia útil: menos de 24 h só se for amanhã cedo; força depois
  assert.ok(cedo.ok);
  const longe = pedir(2, slots(6)[0].inicio);
  assert.ok(longe.ok);
  assert.ok(publico.cancelar(longe.token, longe.agendamentoId).ok); assert.equal(ag(longe.agendamentoId).status, 'cancelado'); assert.equal(ag(longe.agendamentoId).motivoCancelamento, 'cliente');
  store.avancar(ag(cedo.agendamentoId).inicio - store.agora() - 5 * H); // faltam 5 h
  const r = publico.cancelar(cedo.token, cedo.agendamentoId);
  assert.equal(r.ok, false); assert.match(r.erros[0], /24 horas/);
  assert.equal(ag(cedo.agendamentoId).status === 'cancelado', false);
  assert.equal(publico.cancelar(longe.token, longe.agendamentoId).ok, false, 'já cancelado');
});

test('remarcar: libera o horário antigo, volta a "Cliente agendou", recalcula os lembretes; horário ocupado é recusado', () => {
  const hs = slots();
  const r = pedir(1, hs[0].inicio); publico.lembretes(r.token, true);
  assert.ok(pedir(2, hs[6].inicio).ok);
  const a = ag(r.agendamentoId);
  assert.ok(agenda.alterarStatus(a.id, 'confirmado').ok);
  assert.equal(statusVisual(ag(a.id), store.agora()).rotulo, 'Confirmado');
  assert.equal(publico.remarcar(r.token, a.id, hs[6].inicio).ok, false, 'ocupado por outro');
  const novo = hs[12].inicio;
  const m = publico.remarcar(r.token, a.id, novo);
  assert.ok(m.ok, JSON.stringify(m));
  const b = ag(a.id);
  assert.equal(b.inicio, novo); assert.equal(b.status, 'a_confirmar'); assert.equal(b.clienteAgendou, true); assert.equal(b.reagendado, true);
  assert.equal(b.lembretes[0].enviarEm, novo - 24 * H);
  assert.ok(publico.horarios({ profissionalId: 'u-pablo', servicoIds: SV, dayTs: dia() }).some((h) => h.inicio === hs[0].inicio), 'o horário antigo voltou a ficar livre');
  assert.ok(!publico.horariosParaRemarcar(r.token, a.id, dia()).some((h) => h.inicio === hs[6].inicio));
  assert.ok(st().avisosPainel.some((x) => /remarcou pelo link/.test(x.texto)));
});

test('dono confirma (deixa de ser "Cliente agendou") ou recusa (o cliente é avisado)', () => {
  const hs = slots();
  const a = pedir(1, hs[0].inicio); const b = pedir(2, hs[5].inicio);
  assert.ok(agenda.alterarStatus(a.agendamentoId, 'confirmado').ok);
  store.avancar(1000);
  assert.equal(ag(a.agendamentoId).clienteAgendou, false);
  assert.equal(statusVisual(ag(a.agendamentoId), store.agora()).chave, 'azul');
  assert.ok(agenda.cancelar(b.agendamentoId).ok);
  assert.equal(msgs('recusado').length, 1);
  assert.equal(ag(b.agendamentoId).status, 'cancelado');
});

test('lembretes: só com aceite; 24 h e 2 h antes; uma vez cada; reagendar recalcula; cancelar encerra', () => {
  const hs = slots(5);
  const a = pedir(1, hs[0].inicio);
  const ini = ag(a.agendamentoId).inicio;
  assert.equal(ag(a.agendamentoId).lembretes.length, 2);
  store.avancar(ini - 24 * H - store.agora() + 60000);
  assert.equal(msgs('lembrete_24h').length, 0, 'sem aceite, nada é enviado');
  publico.lembretes(a.token, true);
  const b = pedir(2, hs[6].inicio); publico.lembretes(b.token, true);
  const iniB = ag(b.agendamentoId).inicio;
  store.avancar(iniB - 24 * H - store.agora() + 60000);
  assert.equal(msgs('lembrete_24h').length, 1);
  store.avancar(60000); store.avancar(60000);
  assert.equal(msgs('lembrete_24h').length, 1, 'nunca duplica');
  store.avancar(iniB - 2 * H - store.agora() + 60000);
  assert.equal(msgs('lembrete_2h').length, 1);
  assert.match(msgs('lembrete_2h')[0].texto, /2 horas/);
});

test('lembretes: cancelado não recebe; relógio adiantado manda só o mais próximo; recusar aceite antes do horário corta o envio', () => {
  const hs = slots(5);
  const a = pedir(1, hs[0].inicio); publico.lembretes(a.token, true);
  const b = pedir(2, hs[6].inicio); publico.lembretes(b.token, true);
  const ini = ag(a.agendamentoId).inicio;
  assert.ok(publico.cancelar(a.token, a.agendamentoId).ok);
  store.avancar(ini - 24 * H - store.agora() + 60000);
  assert.equal(msgs('lembrete_24h').length, 0, 'cancelado não recebe');
  const iniB = ag(b.agendamentoId).inicio;
  store.avancar(iniB - 90 * 60000 - store.agora()); // pulou as duas marcas de uma vez
  assert.equal(msgs('lembrete_24h').length, 0); assert.equal(msgs('lembrete_2h').length, 1);
  const c = pedir(3, hs[10].inicio); publico.lembretes(c.token, true); publico.lembretes(c.token, false);
  store.avancar(ag(c.agendamentoId).inicio - 3 * H - store.agora());
  assert.equal(msgs('lembrete_2h').length, 1, 'quem recusou não recebe');
});

test('fuzz: pedidos, remarcações e cancelamentos aleatórios nunca duplicam horário do mesmo esteticista', () => {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tokens = [];
  const dias = [dia(2), dia(3), dia(4)];
  for (let i = 0; i < 160; i++) {
    const op = rnd();
    if (op < 0.55 || !tokens.length) {
      const h = publico.horarios({ profissionalId: rnd() < 0.5 ? 'u-pablo' : '', servicoIds: SV, dayTs: dias[Math.floor(rnd() * 3)] });
      if (!h.length) continue;
      const alvo = h[Math.floor(rnd() * h.length)];
      const r = pedir(Math.floor(rnd() * 25), alvo.inicio, { profissionalId: rnd() < 0.5 ? alvo.profissionalId : '' });
      if (r.ok) tokens.push([r.token, r.agendamentoId]);
    } else if (op < 0.8) {
      const [t, id] = tokens[Math.floor(rnd() * tokens.length)];
      const h = publico.horariosParaRemarcar(t, id, dias[Math.floor(rnd() * 3)]);
      if (h.length) publico.remarcar(t, id, h[Math.floor(rnd() * h.length)].inicio);
    } else { const [t, id] = tokens[Math.floor(rnd() * tokens.length)]; publico.cancelar(t, id); }
  }
  const ativos = st().agendamentos.filter((a) => ['a_confirmar', 'confirmado'].includes(a.status));
  for (let i = 0; i < ativos.length; i++) for (let j = i + 1; j < ativos.length; j++) {
    const x = ativos[i]; const y = ativos[j];
    if (x.profissionalId !== y.profissionalId) continue;
    const dx = 50 * 60000;
    assert.ok(x.inicio + dx <= y.inicio || y.inicio + dx <= x.inicio, `sobreposição ${fmtHM(x.inicio)} x ${fmtHM(y.inicio)}`);
  }
});
