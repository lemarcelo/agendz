/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Assistente de início no site real (src/services/api-real.js, `onboarding`): corpos enviados de produtos, comissão geral e comissão por pessoa
// (só os campos que o servidor conhece: ele recusa campo desconhecido), leitura defensiva do estado e do histórico. 5d-3.
import test from 'node:test';
import assert from 'node:assert/strict';
import { configurar, onboarding } from '../src/services/api-real.js';

let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined }); return { ok: status < 400, status, json: async () => resposta }; };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('produtos: manda só nome, preço, comissão e estoque; sem comissão/estoque os campos nem vão', async () => {
  servidor({ criados: 2, jaExistiam: 1 });
  const r = await onboarding.produtos([{ nome: 'Pomada', preco: 45, comissaoPct: 10, estoque: 5, lojaId: 'x' }, { nome: 'Cera', preco: 30, comissaoPct: null }]);
  assert.deepEqual(r, { ok: true, resultado: { criados: 2, jaExistiam: 1 } });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/onboarding/produtos');
  assert.deepEqual(chamadas[0].corpo, { itens: [{ nome: 'Pomada', preco: 45, comissaoPct: 10, estoque: 5 }, { nome: 'Cera', preco: 30 }] });
});

test('comissão geral: POST com o número; a resposta vira o padrão vigente', async () => {
  servidor({ padrao: 40 });
  assert.deepEqual(await onboarding.comissao(40), { ok: true, padrao: 40 });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/onboarding/comissao');
  assert.deepEqual(chamadas[0].corpo, { padrao: 40 });
});

test('equipe: comissaoPct só vai quando a pessoa tem percentual próprio (vazio = usa a geral)', async () => {
  servidor({ pessoas: [] });
  await onboarding.equipe([{ nome: 'Zé', atende: true, comissaoPct: 30, senha: 'x' }, { nome: 'Ana', atende: false }]);
  assert.deepEqual(chamadas[0].corpo, { pessoas: [{ nome: 'Zé', atende: true, comissaoPct: 30 }, { nome: 'Ana', atende: false }] });
});

test('equipe: comissaoProdutoPct (v102) só vai quando a pessoa tem percentual próprio sobre produtos, junto do de serviços', async () => {
  servidor({ pessoas: [] });
  await onboarding.equipe([{ nome: 'Zé', atende: true, comissaoPct: 30, comissaoProdutoPct: 8.5, senha: 'x' }, { nome: 'Ana', atende: false, comissaoProdutoPct: 0 }, { nome: 'Bia', atende: true, comissaoProdutoPct: null }]);
  assert.deepEqual(chamadas[0].corpo, { pessoas: [{ nome: 'Zé', atende: true, comissaoPct: 30, comissaoProdutoPct: 8.5 }, { nome: 'Ana', atende: false, comissaoProdutoPct: 0 }, { nome: 'Bia', atende: true }] });
});

test('estado e histórico: leitura defensiva dos campos novos', async () => {
  servidor({ tipo: 'barbearia', passo: 'servicos', concluido: false, servicos: [], jaCadastrados: [], comissaoPadrao: 35, produtosCadastrados: ['Pomada', 7, null] });
  let r = await onboarding.carregar();
  assert.equal(r.estado.comissaoPadrao, 35);
  assert.deepEqual(r.estado.produtosCadastrados.slice(0, 1), ['Pomada']);
  servidor({ tipo: 'barbearia', passo: 'servicos', concluido: false, servicos: [] });
  r = await onboarding.carregar();
  assert.equal(r.estado.comissaoPadrao, 50, 'sem valor, vale o padrão de 50%');
  assert.deepEqual(r.estado.produtosCadastrados, []);
  servidor({ itens: [{ id: '00000000-0000-4000-8000-000000000001', criadaEm: '2026-10-28T12:00:00Z', por: 'Alan', servicosCriados: 1, pessoasCriadas: 0, produtosCriados: 2, expedienteTrocado: false, comissaoTrocada: true, podeDesfazer: true }] });
  const h = await onboarding.historico();
  assert.equal(h.itens[0].produtosCriados, 2); assert.equal(h.itens[0].comissaoTrocada, true);
});

test('boxes (v120): manda só os nomes (máx. 20, 30 letras); estado traz usaBox e os boxes ativos, com leitura defensiva', async () => {
  servidor({ criados: 2, jaExistiam: 1 });
  const r = await onboarding.boxes(['Box 1', 'x'.repeat(50), 'Box 3']);
  assert.deepEqual(r, { ok: true, resultado: { criados: 2, jaExistiam: 1 } });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/onboarding/boxes');
  assert.equal(chamadas[0].metodo, 'POST');
  assert.deepEqual(Object.keys(chamadas[0].corpo), ['nomes']);
  assert.ok(chamadas[0].corpo.nomes.every((n) => n.length <= 30));
  servidor({ tipo: 'estetica_automotiva', passo: 'equipe', concluido: false, servicos: [], usaBox: true, boxes: ['Box 1', 7, null] });
  let e = (await onboarding.carregar()).estado;
  assert.equal(e.usaBox, true);
  assert.equal(e.boxes[0], 'Box 1');
  servidor({ tipo: 'barbearia', passo: 'servicos', concluido: false, servicos: [] });
  e = (await onboarding.carregar()).estado;
  assert.equal(e.usaBox, false);
  assert.deepEqual(e.boxes, []);
  servidor({ mensagem: 'O limite de 3 agendas deste estabelecimento foi atingido.' }, 409);
  assert.equal((await onboarding.boxes(['A'])).ok, false);
});

test('link do cliente (B9a): manda só os campos informados; veículo repetido/desconhecido nem sai; histórico traz linkTrocado', async () => {
  servidor({ criados: 1, jaExistiam: 0 });
  assert.deepEqual(await onboarding.link({ nomeObrigatorio: false, telefoneObrigatorio: true, veiculoObrigatorio: ['placa', 'porte'], senha: 'não vai' }), { ok: true });
  assert.equal(chamadas[0].url, 'https://loja.teste/api/onboarding/link');
  assert.deepEqual(chamadas[0].corpo, { nomeObrigatorio: false, telefoneObrigatorio: true, veiculoObrigatorio: ['placa', 'porte'] });
  assert.deepEqual((await onboarding.link({})).ok, true);
  assert.deepEqual(chamadas[1].corpo, {}, 'sem campos = nada muda');
  const antes = chamadas.length;
  for (const mau of [{ nomeObrigatorio: 'sim' }, { telefoneObrigatorio: 1 }, { veiculoObrigatorio: ['placa', 'placa'] }, { veiculoObrigatorio: ['cor'] }, { veiculoObrigatorio: 'placa' }, { veiculoObrigatorio: ['placa', 'modelo', 'porte', 'x'] }]) {
    assert.equal((await onboarding.link(mau)).ok, false);
  }
  assert.equal(chamadas.length, antes, 'nada disso chega à rede');
  servidor({ itens: [{ id: '00000000-0000-4000-8000-000000000001', criadaEm: '2026-10-28T12:00:00Z', por: 'Alan', servicosCriados: 0, pessoasCriadas: 0, produtosCriados: 0, expedienteTrocado: false, comissaoTrocada: false, linkTrocado: true, podeDesfazer: true, podeRefazer: false }] });
  const h = await onboarding.historico();
  assert.equal(h.itens[0].linkTrocado, true);
  servidor({ itens: [{ id: '00000000-0000-4000-8000-000000000001', criadaEm: '2026-10-28T12:00:00Z', por: 'Alan', linkTrocado: 'sim' }] });
  assert.equal((await onboarding.historico()).itens[0].linkTrocado, false, 'só true de verdade conta');
});
