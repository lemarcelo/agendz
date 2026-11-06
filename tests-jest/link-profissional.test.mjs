/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B3: link com profissional pré-escolhido, por token assinado. Aqui: o token da demonstração (simulado), o hash com token e o cliente do site real
// (`agenda.meuLink`, `publico.linkProfissional`). A assinatura de verdade (HMAC) é do servidor: LinkDoProfissionalTest, só no CI.
import { test, beforeEach } from '@jest/globals';
import assert from 'node:assert/strict';
import { TOKEN_DEMO, VALIDADE_DIAS, conferirTokenProfissional, montarTokenProfissional } from '../src/domain/link-profissional.js';
import { TOKEN_PROFISSIONAL, lerHashAgendar, montarLinkAgendamento } from '../src/domain/link-publico.js';
import { agenda as agendaReal, configurar, publico as publicoReal } from '../src/services/api-real.js';
import { store, auth, agenda, publico } from '../src/services/api.js';

const AGORA = Date.UTC(2026, 10, 9, 12);
const tk = (loja = 'dalforno', id = 'u-kiko', agora = AGORA) => montarTokenProfissional({ loja, profissionalId: id, agora });

test('demonstração: o token válido devolve o profissional da própria loja', () => {
  const t = tk();
  assert.match(t, TOKEN_DEMO);
  assert.equal(conferirTokenProfissional({ loja: 'dalforno', token: t, agora: AGORA + 1000 }), 'u-kiko');
  assert.equal(conferirTokenProfissional({ loja: 'dalforno', token: t, agora: AGORA + (VALIDADE_DIAS - 1) * 86400000 }), 'u-kiko', 'ainda dentro da validade');
});

test('demonstração: vencido, adulterado, de outra loja e formato errado valem como "não é token" (sempre vazio, sem motivo)', () => {
  const t = tk();
  assert.equal(conferirTokenProfissional({ loja: 'dalforno', token: t, agora: AGORA + (VALIDADE_DIAS + 1) * 86400000 }), '', 'vencido');
  const outroProf = tk('dalforno', 'u-bruno');
  const trocado = t.slice(0, -22) + outroProf.slice(-22); // selo de outro profissional
  assert.equal(conferirTokenProfissional({ loja: 'dalforno', token: trocado, agora: AGORA }), '', 'selo trocado');
  const corpoOutro = outroProf.slice(0, -22) + t.slice(-22);
  assert.equal(conferirTokenProfissional({ loja: 'dalforno', token: corpoOutro, agora: AGORA }), '', 'id trocado mantendo o selo');
  const venc = t.slice(0, 1 + 'u-kiko'.length * 2 + 1) + 'ffffffff' + t.slice(-22);
  assert.equal(conferirTokenProfissional({ loja: 'dalforno', token: venc, agora: AGORA }), '', 'vencimento estendido à mão');
  assert.equal(conferirTokenProfissional({ loja: 'offbox', token: t, agora: AGORA }), '', 'token de outra loja');
  for (const x of ['', 'u-kiko', 't', t + 'x', t.slice(1), null, undefined, 'a'.repeat(62), '<script>']) assert.equal(conferirTokenProfissional({ loja: 'dalforno', token: x, agora: AGORA }), '', String(x));
});

test('demonstração: a resposta não distingue o motivo (vencido, adulterado e outra loja são idênticos)', () => {
  const t = tk();
  const respostas = [
    conferirTokenProfissional({ loja: 'dalforno', token: t, agora: AGORA + 400 * 86400000 }),
    conferirTokenProfissional({ loja: 'dalforno', token: t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'), agora: AGORA }),
    conferirTokenProfissional({ loja: 'outra', token: t, agora: AGORA }),
  ];
  assert.deepEqual(respostas, ['', '', '']);
});

test('hash: o token cabe no #agendar-<token> (até 80 caracteres) e id cru de link antigo continua lendo', () => {
  const real = 'a1'.repeat(20) + 'AbCdEfGhIjKlMnOpQrStUv';
  assert.match(real, TOKEN_PROFISSIONAL);
  assert.equal(lerHashAgendar(`#agendar-${real}`).profissionalId, real);
  assert.equal(lerHashAgendar('#agendar-00000000-0000-4000-8000-000000000001').profissionalId, '00000000-0000-4000-8000-000000000001');
  assert.equal(lerHashAgendar(`#agendar-${'x'.repeat(81)}`), null, 'acima de 80 não é link');
  assert.equal(montarLinkAgendamento({ base: 'https://x.test/', profissionalId: real }), `https://x.test/#agendar-${real}`);
  for (const ruim of [`${real}x`.slice(1), 'a'.repeat(61), real + 'x', real.replace(/.$/, '.'), '']) assert.doesNotMatch(ruim, TOKEN_PROFISSIONAL);
});

test('demonstração (api): quem atende gera o token do próprio link; recepção e visitante não; a página confere sem revelar', () => {
  store.reiniciar();
  auth.logout();
  assert.equal(agenda.meuLink().ok, false, 'sem login');
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok);
  const r = agenda.meuLink();
  assert.ok(r.ok && TOKEN_DEMO.test(r.token));
  auth.logout();
  const id = publico.linkProfissional(r.token).profissionalId;
  assert.ok(id && store.getState().usuarios.some((u) => u.id === id), 'o visitante resolve o token para quem o gerou');
  assert.equal(publico.linkProfissional(r.token.slice(0, -1) + (r.token.endsWith('A') ? 'B' : 'A')).profissionalId, '');
  assert.equal(publico.linkProfissional('u-kiko').profissionalId, '', 'id cru não é token');
});

// ---- site real
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined, cab: init.headers });
    return { ok: status < 400, status, json: async () => resposta, text: async () => JSON.stringify(resposta), headers: { get: () => 'application/json' } };
  };
}
beforeEach(() => configurar({ base: 'https://loja.teste' }));
const PROF = '00000000-0000-4000-8000-000000000001';
const REAL = 'a1'.repeat(20) + 'AbCdEfGhIjKlMnOpQrStUv';

test('site real: linkProfissional manda só o token no corpo (POST, sem login) e devolve o id só se for UUID', async () => {
  servidor({ profissionalId: PROF });
  const r = await publicoReal.linkProfissional(REAL);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url, chamadas[0].corpo], ['POST', 'https://loja.teste/api/publico/link-profissional', { token: REAL }]);
  assert.equal(r.profissionalId, PROF);
  assert.ok(!JSON.stringify(chamadas[0].cab || {}).toLowerCase().includes('authorization'), 'rota pública nunca leva o token do painel');
  servidor({ profissionalId: '<script>' });
  assert.equal((await publicoReal.linkProfissional(REAL)).profissionalId, '', 'lixo vira vazio');
  servidor({ profissionalId: null });
  assert.equal((await publicoReal.linkProfissional(REAL)).profissionalId, '', 'null = ignorado');
});

test('site real: falha do servidor ou token fora do formato nunca vira erro na tela e nem sai do aparelho', async () => {
  servidor({}, 500);
  assert.deepEqual(await publicoReal.linkProfissional(REAL), { ok: true, profissionalId: '' });
  servidor({ profissionalId: PROF });
  for (const x of ['', 'u-kiko', PROF, REAL + 'x', null, undefined]) assert.deepEqual(await publicoReal.linkProfissional(x), { ok: true, profissionalId: '' });
  assert.equal(chamadas.length, 0, 'nenhum pedido para token fora do formato');
});

test('site real: meuLink lê só um token no formato certo', async () => {
  servidor({ token: REAL });
  const r = await agendaReal.meuLink();
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', 'https://loja.teste/api/agenda/meu-link']);
  assert.deepEqual(r, { ok: true, token: REAL });
  servidor({ token: '<script>' });
  assert.equal((await agendaReal.meuLink()).ok, false);
});
