/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Suporte no site real (src/services/api-real.js, `suporte.*`): rotas e corpos, loja e usuário NUNCA vão no corpo, id ruim nem sai do cliente,
// e a leitura é defensiva (nota interna, prioridade e campos soltos são descartados).
import test from 'node:test';
import assert from 'node:assert/strict';
import { configurar, suporte } from '../src/services/api-real.js';

const ID = '00000000-0000-4000-8000-000000000201';
let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined });
    return { ok: status < 400, status, json: async () => resposta, text: async () => JSON.stringify(resposta), headers: { get: () => 'application/json' } };
  };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('listar: GET /api/suporte/chamados; lê só o necessário e descarta lixo', async () => {
  servidor([{ id: ID, usuarioNome: 'Ana', assunto: 'Ajuda', categoria: 'duvida', status: 'aguardando_cliente', criadoEm: '2026-10-29T10:00:00Z', atualizadoEm: '2026-10-29T11:00:00Z', naoLidas: 2,
    prioridade: 'urgente', atribuidoA: 'x', notaInterna: 'segredo', msgs: [{ id: 1, autorTipo: 'suporte', autorNome: 'Suporte', texto: 'Oi', interna: true, criadoEm: '2026-10-29T11:00:00Z' }] },
  { id: '', assunto: 'sem id' }]);
  const r = await suporte.listar();
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', 'https://loja.teste/api/suporte/chamados']);
  assert.equal(r.chamados.length, 1);
  const c = r.chamados[0];
  assert.equal(c.naoLidas, 2); assert.equal(c.status, 'aguardando_cliente');
  for (const k of ['prioridade', 'atribuidoA', 'notaInterna']) assert.ok(!(k in c), k);
  assert.ok(!('interna' in c.msgs[0]), 'a mensagem não carrega o campo interna');
  servidor([{ id: ID, status: 'inventado', categoria: 'fofoca', naoLidas: -5 }]);
  const x = (await suporte.listar()).chamados[0];
  assert.equal(x.status, 'aberto'); assert.equal(x.categoria, 'outro'); assert.equal(x.naoLidas, 0);
});

test('abrir: POST só com assunto, categoria e texto (loja e usuário vêm do servidor)', async () => {
  servidor({ id: ID, assunto: 'a', categoria: 'problema', status: 'aberto', msgs: [] }, 201);
  const r = await suporte.abrir({ assunto: '  Não abre  ', categoria: 'problema', texto: ' Trava ', loja: 'outra', usuarioId: 'u', todos: true });
  assert.equal(r.ok, true);
  assert.deepEqual(chamadas[0].corpo, { assunto: 'Não abre', categoria: 'problema', texto: 'Trava' });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/suporte/chamados');
});

test('obter e responder: id que não é UUID nem sai; rotas certas', async () => {
  servidor({});
  for (const id of ['abc', '../x', '', undefined, `${ID}/mensagens`]) { assert.equal((await suporte.obter(id)).ok, false); assert.equal((await suporte.responder(id, 'oi')).ok, false); }
  assert.equal(chamadas.length, 0, 'nada foi enviado');
  servidor({ id: ID, status: 'aberto', msgs: [{ id: 7, autorTipo: 'cliente', autorNome: 'Ana', texto: 'oi', criadoEm: '2026-10-29T10:00:00Z' }] });
  assert.equal((await suporte.obter(ID)).chamado.msgs.length, 1);
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url], ['GET', `https://loja.teste/api/suporte/chamados/${ID}`]);
  servidor({ id: ID, status: 'em_atendimento', msgs: [] }, 201);
  await suporte.responder(ID, ' Obrigado ');
  assert.deepEqual([chamadas[0].metodo, chamadas[0].url, chamadas[0].corpo], ['POST', `https://loja.teste/api/suporte/chamados/${ID}/mensagens`, { texto: 'Obrigado' }]);
});

test('erro do servidor volta com a mensagem; não lidas lê número seguro', async () => {
  servidor({ mensagem: 'Você abriu muitos chamados em pouco tempo. Aguarde um pouco.' }, 429);
  const r = await suporte.abrir({ assunto: 'a', categoria: 'duvida', texto: 'b' });
  assert.equal(r.ok, false); assert.equal(r.status, 429); assert.match(r.erro, /muitos chamados/);
  servidor({ naoLidas: 3 }); assert.equal((await suporte.naoLidas()).naoLidas, 3);
  servidor({ naoLidas: 'três' }); assert.equal((await suporte.naoLidas()).naoLidas, 0);
});
