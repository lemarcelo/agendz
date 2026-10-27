// Correções da revisão de coerência e segurança (v41): remarcar+cancelar, alterar serviços, crédito por conta, modelos automáticos, entradas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as API from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { store, auth, agenda, estabelecimento, equipe, whatsapp } from '../src/services/api.js';
import * as F from '../src/domain/financeiro.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const H = 3600 * 1000;
const TEL = '(55) 99711-4020';
const dia = (n) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
function marcar(n = 5, hora = '10:00', servicoIds = ['s-lav-detalhada']) {
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const r = agenda.criar({ clienteId: 'c-marcelo', profissionalId: 'u-pablo', servicoIds, inicio: tsAt(dia(n), hora) });
  assert.ok(r.ok, JSON.stringify(r));
  return r.agendamento;
}
test.beforeEach(() => reiniciar());

test('remarcar dentro das 24 h e cancelar em seguida não contorna a regra', () => {
  const a = marcar(5);
  store.avancar(a.inicio - 10 * H - store.agora());
  const novo = tsAt(dia(8), '11:00');
  const r = whatsapp.remarcar(a.id, novo, TEL);
  assert.ok(r.ok, JSON.stringify(r));
  const x = st().agendamentos.find((y) => y.id === a.id);
  assert.ok(x.inicio - store.agora() > 24 * H);
  assert.equal(whatsapp.podeCancelar(a.id, TEL), false);
  const c = whatsapp.cancelar(a.id, TEL);
  assert.equal(c.ok, false);
  assert.notEqual(st().agendamentos.find((y) => y.id === a.id).status, 'cancelado');
});

test('remarcar com antecedência de 24 h ou mais mantém o direito de cancelar', () => {
  const a = marcar(6);
  assert.ok(whatsapp.remarcar(a.id, tsAt(dia(9), '11:00'), TEL).ok);
  assert.equal(whatsapp.podeCancelar(a.id, TEL), true);
  assert.ok(whatsapp.cancelar(a.id, TEL).ok);
});

test('alterar serviços pelo WhatsApp deixa o horário com a pergunta enviada e os lembretes remontados', () => {
  const a = marcar(6);
  const r = whatsapp.editarServicos(a.id, ['s-lav-detalhada', 's-lav-motor'], TEL);
  assert.ok(r.ok, JSON.stringify(r));
  const x = st().agendamentos.find((y) => y.id === a.id);
  assert.equal(x.status, 'a_confirmar');
  assert.ok(x.plano.length >= 1);
  assert.equal(x.plano[0].estado, 'enviada');
  assert.equal(x.plano[0].tipo, 'pergunta');
  assert.ok(x.plano.slice(1).every((p) => ['pendente', 'pulada'].includes(p.estado)));
});

test('valores mostrados ao cliente são os congelados no agendamento, não os do catálogo atual', () => {
  const a = marcar(6);
  const antes = whatsapp.valoresDoHorario(a.id, TEL);
  assert.equal(antes.itens.length, 1);
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const sv = st().servicos.find((s) => s.id === 's-lav-detalhada');
  assert.ok(API.servicos.salvar({ ...sv, preco: sv.preco + 20 }).ok);
  const depois = whatsapp.valoresDoHorario(a.id, TEL);
  assert.equal(depois.total, antes.total, 'o preço do catálogo mudou, o do horário não');
  assert.equal(whatsapp.valoresDoHorario(a.id, '(51) 98765-4321').total, 0, 'só o dono do número vê');
});

test('crédito de outra conta não é oferecido nem usado: só vale o da conta que falta cobrar', () => {
  const a = marcar(6);
  const cli = st().clientes.find((c) => c.id === 'c-marcelo');
  const contaQualquer = (st().financeiro.contas[0] || {}).id;
  assert.ok(contaQualquer);
  const s = structuredClone(st());
  s.financeiro.creditos.unshift({ id: 'cr-x', clienteId: cli.id, contaId: 'conta-que-nao-existe', valor: 50, usos: [], criadoEm: store.agora(), expiraEm: store.agora() + 10 * 24 * H, motivo: 'teste' });
  assert.equal(F.creditoUsavelNoAgendamento(s, s.agendamentos.find((x) => x.id === a.id), store.agora()), 0);
});

test('crédito vale até o fim do dia da data informada e expira depois', () => {
  const t0 = new Date(2026, 0, 10, 9, 30).getTime();
  const cr = { criadoEm: t0, expiraEm: new Date(2026, 2, 10, 9, 30).getTime(), valor: 30, usos: [] };
  const fim = new Date(2026, 2, 10, 23, 59, 59, 999).getTime();
  assert.equal(F.venceEm(cr), fim);
  assert.equal(F.creditoExpirado(cr, new Date(2026, 2, 10, 20, 0).getTime()), false, 'ainda vale à noite do último dia');
  assert.equal(F.creditoExpirado(cr, fim + 1), true);
});

test('modelos que só o sistema envia não saem pelo envio manual', () => {
  const a = marcar(6);
  for (const id of ['m-credito', 'm-ddd']) {
    const m = st().modelos.find((x) => x.id === id);
    if (!m) continue;
    const r = agenda.enviarMensagem(a.id, m.id, []);
    assert.equal(r.ok, false);
  }
});

test('DDDs do estabelecimento viram número de 11 a 99, sem repetir; texto inválido é recusado', () => {
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  assert.ok(estabelecimento.salvar({ ddds: ['51', 55, '51'] }).ok);
  assert.deepEqual(st().estabelecimento.ddds, [51, 55]);
  for (const ruim of [['5'], ['abc'], [0], [100], ['01'], [51.5], 'x']) assert.equal(estabelecimento.salvar({ ddds: ruim }).ok, false, JSON.stringify(ruim));
  assert.deepEqual(st().estabelecimento.ddds, [51, 55]);
});

test('logo entre o limite novo e o antigo é recusada com mensagem clara', () => {
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const grande = 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(150000);
  const r = estabelecimento.salvar({ logo: grande });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /100 KB/);
});

test('editar a equipe exige senha de 4 a 100 caracteres também na alteração', () => {
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const u = st().usuarios.find((x) => x.id === 'u-pablo');
  const base = { ...u };
  assert.equal(equipe.salvar({ ...base, senha: 'a' }).ok, false);
  assert.equal(equipe.salvar({ ...base, senha: 'x'.repeat(101) }).ok, false);
  assert.ok(equipe.salvar({ ...base, senha: 'nova1234' }).ok);
});

test('números como texto livre ("0x10", "1e3", vírgula) não passam como valor válido', () => {
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const sv = st().servicos[0];
  for (const preco of ['0x10', '1e3', '12,5', ' ', 'Infinity', [5], true]) assert.equal(API.servicos.salvar({ ...sv, preco }).ok, false, String(preco));
  assert.ok(API.servicos.salvar({ ...sv, preco: '35.50' }).ok);
});

test('pedidos de código de recuperação têm teto por CPF (existente ou não) e o contador de erros não é zerado sem limite', () => {
  const pedido = { cpf: '391.847.260-40', telefone: '(55) 99701-1122', canal: 'whatsapp' };
  for (let i = 0; i < 5; i++) assert.ok(auth.iniciarRecuperacao(pedido).ok);
  const r = auth.iniciarRecuperacao(pedido);
  assert.equal(r.ok, false); assert.match(r.erros[0], /Muitos pedidos/);
  for (let i = 0; i < 5; i++) auth.iniciarRecuperacao({ cpf: '000.000.000-00', telefone: '(55) 1' });
  assert.match(auth.iniciarRecuperacao({ cpf: '000.000.000-00', telefone: '(55) 1' }).erros[0], /Muitos pedidos/);
});

test('o bloqueio de login ativo sobrevive ao descarte das chaves antigas', () => {
  // 5 erros bloqueiam; milhares de tentativas com outros nomes não podem soltar quem está bloqueado
  for (let i = 0; i < 5; i++) auth.login({ identificador: 'davi', senha: 'errada' });
  assert.match(auth.login({ identificador: 'davi', senha: '1234' }).erros?.[0] || '', /Muitas tentativas/);
  for (let i = 0; i < 5100; i++) auth.login({ identificador: `fantasma${i}`, senha: 'x' });
  assert.match(auth.login({ identificador: 'davi', senha: '1234' }).erros?.[0] || '', /Muitas tentativas/);
});
