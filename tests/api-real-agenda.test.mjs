/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda do site real (src/services/api-real.js, `agenda` e `profissionais`): rotas e corpos, validação antes da rede, leitura defensiva da resposta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agenda, configurar, profissionais } from '../src/services/api-real.js';
import { agruparPorDia } from '../src/domain/agenda-grupos.js';

const ID = '00000000-0000-4000-8000-000000000101';
const PROF = '00000000-0000-4000-8000-000000000001';
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined }); return { ok: status < 400, status, json: async () => resposta }; };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('listar: período em UTC na consulta; período inválido nem sai do cliente', async () => {
  servidor([]);
  const de = Date.parse('2026-10-28T03:00:00Z'), ate = Date.parse('2026-11-04T03:00:00Z');
  assert.deepEqual(await agenda.listar({ de, ate }), { ok: true, agendamentos: [] });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/agendamentos?de=2026-10-28T03%3A00%3A00.000Z&ate=2026-11-04T03%3A00%3A00.000Z');
  assert.equal((await agenda.listar({ de: ate, ate: de })).ok, false);
  assert.equal((await agenda.listar({ de: NaN, ate })).ok, false);
  assert.equal(chamadas.length, 1);
});

test('leitura defensiva: status desconhecido vira "a confirmar", id ruim some, instante inválido vira nulo, texto é cortado', async () => {
  servidor([{ id: ID, clienteId: 'x', profissionalId: PROF, inicio: 'ontem', status: 'hackeado', total: 'muito', servicos: [{ nome: 'x'.repeat(500), preco: 10, duracaoMin: 30 }],
    conflitosPendentes: [ID, 'lixo'], origem: 'link', historico: [{ em: '2026-10-28T12:00:00Z', autor: 'Alan', campo: 'status', de: 'A confirmar', para: 'Confirmado' }], extra: 'ignorado' }]);
  const r = await agenda.listar({ de: 1, ate: 2 });
  const a = r.agendamentos[0];
  assert.equal(a.clienteId, null); assert.equal(a.inicio, null); assert.equal(a.status, 'a_confirmar'); assert.equal(a.total, 0);
  assert.equal(a.servicos[0].nome.length, 100); assert.deepEqual(a.conflitosPendentes, [ID]); assert.equal(a.origem, 'link');
  assert.equal(a.historico[0].em, Date.parse('2026-10-28T12:00:00Z')); assert.ok(!('extra' in a));
});

test('mudarStatus e remarcar: rota e corpo certos; id, status e data inválidos não saem do cliente', async () => {
  servidor({ id: ID, clienteId: null, profissionalId: PROF, inicio: '2026-10-29T13:00:00Z', status: 'confirmado' });
  assert.equal((await agenda.mudarStatus(ID, 'confirmado')).agendamento.status, 'confirmado');
  assert.deepEqual(chamadas[0], { url: `https://loja.teste/api/agendamentos/${ID}/status`, metodo: 'PUT', corpo: { status: 'confirmado' } });
  const ts = Date.parse('2026-10-29T17:00:00-03:00');
  await agenda.remarcar(ID, { inicio: ts, profissionalId: PROF, encaixe: true, status: 'confirmado', lixo: 1 });
  assert.deepEqual(chamadas[1].corpo, { inicio: '2026-10-29T20:00:00.000Z', profissionalId: PROF, encaixe: true, status: 'confirmado' });
  await agenda.remarcar(ID, { inicio: ts });
  assert.deepEqual(chamadas[2].corpo, { inicio: '2026-10-29T20:00:00.000Z' }, 'sem profissional nem status: só a data');
  const antes = chamadas.length;
  for (const r of [await agenda.mudarStatus('1; drop', 'confirmado'), await agenda.mudarStatus(ID, 'qualquer'), await agenda.remarcar(ID, { inicio: 'amanhã' }), await agenda.remarcar(ID, { inicio: ts, profissionalId: 'x' }), await agenda.remarcar(ID, { inicio: ts, status: 'x' }), await agenda.obter('x')]) assert.equal(r.ok, false);
  assert.equal(chamadas.length, antes);
});

test('erro do servidor chega com a mensagem dele (conflito, expediente, permissão)', async () => {
  servidor({ mensagem: 'Esse horário já está ocupado por um agendamento confirmado.' }, 409);
  const r = await agenda.remarcar(ID, { inicio: Date.parse('2026-10-29T17:00:00-03:00') });
  assert.deepEqual([r.ok, r.status, r.erro], [false, 409, 'Esse horário já está ocupado por um agendamento confirmado.']);
});

test('profissionais: só id válido, papel conhecido e atende', async () => {
  servidor([{ id: PROF, nome: 'Alan', papel: 'dono', atende: true }, { id: 'ruim', nome: 'X', papel: 'dono', atende: true }, { id: ID, nome: 'Kiko', papel: 'chefe', atende: false }]);
  const r = await profissionais.listar();
  assert.deepEqual(r.profissionais, [{ id: PROF, nome: 'Alan', papel: 'dono', atende: true }, { id: ID, nome: 'Kiko', papel: 'profissional', atende: false }]);
});

test('agruparPorDia junta por dia mantendo a ordem', () => {
  const dia = Date.parse('2026-10-29T12:00:00-03:00');
  const g = agruparPorDia([{ inicio: dia }, { inicio: dia + 3600000 }, { inicio: dia + 86400000 }]);
  assert.equal(g.length, 2); assert.equal(g[0].lista.length, 2);
});
