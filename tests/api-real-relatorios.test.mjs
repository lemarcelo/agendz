/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Relatórios do site real (src/services/api-real.js, `relatorios`): rota e período, validação antes da rede e leitura defensiva da resposta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configurar, relatorios } from '../src/services/api-real.js';

let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), metodo: init.method }); return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => resposta, text: async () => JSON.stringify(resposta) }; };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('obter: mês e De/Até vão na consulta; período ruim nem sai do cliente', async () => {
  servidor({ de: '2026-10-01', ate: '2026-10-31' });
  assert.equal((await relatorios.obter({ mes: '2026-10' })).ok, true);
  assert.equal(chamadas[0].url, 'https://loja.teste/api/relatorios?mes=2026-10');
  assert.equal(chamadas[0].metodo, 'GET');
  await relatorios.obter({ de: '2026-10-01', ate: '2026-10-15' });
  assert.equal(chamadas[1].url, 'https://loja.teste/api/relatorios?de=2026-10-01&ate=2026-10-15');
  assert.equal((await relatorios.obter({ de: '2026-10-15', ate: '2026-10-01' })).ok, false);
  assert.equal((await relatorios.obter({ mes: 'outubro' })).ok, false);
  assert.equal((await relatorios.obter(null)).ok, false);
  assert.equal(chamadas.length, 2);
});

test('leitura defensiva: números ruins viram zero, listas longas são cortadas, campo extra some', async () => {
  servidor({ de: '2026-10-01', ate: '2026-10-31', extra: 'x', totais: { atendimentos: 'muitos', total: 120.5, ticketMedio: 60.25, servicos: 100, produtos: 30, descontos: 9.5 },
    previsto: { atendimentos: 2, total: 80 },
    porProfissional: [{ id: 'a'.repeat(100), nome: 'N'.repeat(400), atendimentos: 2, servicos: 100, produtos: 20.5, total: 120.5, senha: 'x' }],
    porServico: Array.from({ length: 500 }, (_, i) => ({ nome: `S${i}`, qtd: 1, valor: 10 })), porProduto: 'lixo', porForma: [{ forma: 'pix', atendimentos: 2, total: 120.5 }], porDia: [{ dia: '2026-10-27', atendimentos: 2, total: 120.5 }] });
  const r = await relatorios.obter({ mes: '2026-10' });
  assert.equal(r.totais.atendimentos, 0); assert.equal(r.totais.total, 120.5); assert.equal(r.totais.descontos, 9.5);
  assert.equal(r.previsto.total, 80);
  assert.equal(r.porProfissional[0].nome.length, 150); assert.ok(!('senha' in r.porProfissional[0])); assert.ok(r.porProfissional[0].id.length <= 40);
  assert.equal(r.porServico.length, 200); assert.deepEqual(r.porProduto, []);
  assert.deepEqual(r.porForma, [{ forma: 'pix', atendimentos: 2, total: 120.5 }]);
  assert.ok(!('extra' in r));
});

test('erro do servidor (403 de quem não é o proprietário) volta com a mensagem dele', async () => {
  servidor({ mensagem: 'Sem permissão.' }, 403);
  const r = await relatorios.obter({ mes: '2026-10' });
  assert.equal(r.ok, false); assert.equal(r.status, 403); assert.match(r.erro, /Sem permissão/);
});
