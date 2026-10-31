/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Avaliações no site real (src/services/api-real.js, `avaliacoes` e `publico`): rotas, token só em cabeçalho, ids e token conferidos antes da rede, leitura defensiva.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configurar, avaliacoes, publico } from '../src/services/api-real.js';

const ID = '00000000-0000-4000-8000-000000000101';
const TOKEN = 'cd'.repeat(24);
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined, cab: init.headers || {} });
    return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => resposta };
  };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('situacao e pedir: id conferido antes da rede; token só na resposta do pedido', async () => {
  servidor({});
  assert.equal((await avaliacoes.situacao('../x')).ok, false);
  assert.equal((await avaliacoes.pedir('nao-uuid')).ok, false);
  assert.equal(chamadas.length, 0);
  servidor({ motivo: 'sem_telefone', aviso: 'Sem telefone.', jaAvaliou: false, pedidaEm: null });
  const s = await avaliacoes.situacao(ID);
  assert.equal(chamadas[0].url, `https://loja.teste/api/agendamentos/${ID}/avaliacao`);
  assert.equal(s.situacao.motivo, 'sem_telefone');
  servidor({ token: TOKEN, numero: '5511999990001', nome: 'Bruno', loja: 'Dalforno', hash: 'x' });
  const p = await avaliacoes.pedir(ID);
  assert.equal(chamadas[0].metodo, 'POST'); assert.equal(chamadas[0].url, `https://loja.teste/api/agendamentos/${ID}/avaliacao/pedido`);
  assert.deepEqual(p.pedido, { token: TOKEN, numero: '5511999990001', nome: 'Bruno', loja: 'Dalforno' });
  servidor({ token: 'curto', numero: '5511999990001' });
  assert.equal((await avaliacoes.pedir(ID)).ok, false, 'token fora do formato é recusado');
});

test('listar e resumo: filtros na consulta, leitura defensiva, sem campo de identidade extra', async () => {
  servidor({ avaliacoes: [{ id: ID, em: '2026-10-27T12:00:00Z', nota: 5, texto: 'Ótimo', servicos: ['Corte'], anonimo: true, cliente: 'Anônimo', clienteId: ID, cpf: '1' }, { id: ID, nota: 9 }], mostraAnonimo: false, soMinhas: true });
  const l = await avaliacoes.listar({ profissionalId: ID, de: '2026-10-01', ate: '2026-10-31' });
  assert.match(chamadas[0].url, /^https:\/\/loja\.teste\/api\/avaliacoes\?/);
  assert.match(chamadas[0].url, /profissionalId=/); assert.equal(l.avaliacoes.length, 1, 'nota fora de 1 a 5 some');
  assert.ok(!('clienteId' in l.avaliacoes[0]) && !('cpf' in l.avaliacoes[0]));
  assert.equal(l.soMinhas, true);
  servidor({ total: 2, media: 4.5, distribuicao: { 5: 1, 4: 1 } });
  const r = await avaliacoes.resumo({});
  assert.equal(chamadas[0].url, 'https://loja.teste/api/avaliacoes/resumo');
  assert.deepEqual([r.resumo.total, r.resumo.media, r.resumo.distribuicao[3]], [2, 4.5, 0]);
});

test('ocultar e reexibir: POST com motivo; id inválido não vai à rede', async () => {
  servidor({});
  assert.equal((await avaliacoes.ocultar('x', 'motivo bom')).ok, false);
  assert.equal(chamadas.length, 0);
  assert.equal((await avaliacoes.ocultar(ID, 'Ofensiva e fora do assunto.')).ok, true);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url, chamadas[0].corpo], ['POST', `https://loja.teste/api/avaliacoes/${ID}/ocultar`, { motivo: 'Ofensiva e fora do assunto.' }]);
  await avaliacoes.reexibir(ID, 'Foi engano.');
  assert.ok(chamadas[1].url.endsWith('/reexibir'));
});

test('página do cliente: token vai em X-Acesso, nunca na URL; token inválido não vai à rede', async () => {
  servidor({});
  assert.equal((await publico.dadosAvaliacao('curto')).ok, false);
  assert.equal((await publico.avaliar({ token: 'curto', nota: 5 })).ok, false);
  assert.equal(chamadas.length, 0);
  servidor({ loja: 'Dalforno', servicos: ['Corte'], profissional: 'Alan', quando: '2026-10-28T11:00:00Z', cliente: 'Bruno' });
  const d = await publico.dadosAvaliacao(TOKEN);
  assert.ok(!chamadas[0].url.includes(TOKEN)); assert.equal(JSON.stringify(chamadas[0].cab).includes(TOKEN), true);
  assert.ok(!('cliente' in d.dados), 'nunca o nome do cliente');
  servidor({}, 404);
  const e = await publico.dadosAvaliacao(TOKEN);
  assert.equal(e.ok, false); assert.match(e.erro, /não é válido ou já foi usado/);
  servidor({ ok: true });
  assert.equal((await publico.avaliar({ token: TOKEN, nota: 4, texto: 'ok', anonimo: true, site: '' })).ok, true);
  assert.deepEqual(chamadas[0].corpo, { nota: 4, texto: 'ok', anonimo: true, site: '' });
  assert.ok(!chamadas[0].url.includes(TOKEN));
});
