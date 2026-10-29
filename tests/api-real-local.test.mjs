/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Endereço e localização da loja e comissão geral no site real (src/services/api-real.js, `local` e `comissaoGeral`): rotas e corpos, validação antes da rede,
// leitura defensiva (só https no link do mapa) e o endereço opcional na página pública.
import test from 'node:test';
import assert from 'node:assert/strict';
import { comissaoGeral, configurar, local, publico } from '../src/services/api-real.js';

let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => { chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined }); return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => resposta, text: async () => JSON.stringify(resposta) }; };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('local.gravar: só manda o que foi preenchido, localização junta, faixa conferida antes da rede', async () => {
  servidor({ logradouro: 'Rua A', cidade: 'Curitiba', uf: 'PR', cep: '80010000', latitude: -25.4, longitude: -49.2, enderecoNoLink: true, localizacaoNoWhatsapp: false, localizacaoUrl: 'https://maps.google.com/?q=-25.4,-49.2' });
  const r = await local.gravar({ logradouro: ' Rua A ', numero: '', cidade: 'Curitiba', uf: 'PR', cep: '80010-000', latitude: -25.4, longitude: -49.2, enderecoNoLink: true, lixo: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/estabelecimento/local', metodo: 'PUT', corpo: { enderecoNoLink: true, localizacaoNoWhatsapp: false, logradouro: 'Rua A', cidade: 'Curitiba', uf: 'PR', cep: '80010-000', latitude: -25.4, longitude: -49.2 } });
  assert.equal(r.local.cep, '80010000');
  assert.equal((await local.gravar({ latitude: -25.4 })).ok, false);
  assert.equal((await local.gravar({ latitude: 91, longitude: 0 })).ok, false);
  assert.equal((await local.gravar({ latitude: 0, longitude: -181 })).ok, false);
  assert.equal((await local.gravar({ latitude: NaN, longitude: 0 })).ok, false);
  assert.equal(chamadas.length, 1);
});

test('local.obter: link do mapa só https, texto cortado, campo extra some', async () => {
  servidor({ logradouro: 'R'.repeat(500), localizacaoUrl: 'javascript:alert(1)', enderecoNoLink: 'sim', senha: 'x' });
  const l = (await local.obter()).local;
  assert.equal(l.logradouro.length, 120); assert.equal(l.localizacaoUrl, ''); assert.equal(l.enderecoNoLink, false); assert.ok(!('senha' in l));
  servidor({ localizacaoUrl: 'https://maps.google.com/?q=1,2', localizacaoWhatsappUrl: 'https://maps.google.com/?q=1,2' });
  assert.equal((await local.obter()).local.localizacaoUrl, 'https://maps.google.com/?q=1,2');
  assert.equal((await local.obter()).local.localizacaoWhatsappUrl, 'https://maps.google.com/?q=1,2');
  servidor({ localizacaoWhatsappUrl: 'http://inseguro.com' });
  assert.equal((await local.obter()).local.localizacaoWhatsappUrl, '');
  servidor({ mensagem: 'Sem permissão.' }, 403);
  assert.equal((await local.obter()).status, 403);
});

test('comissaoGeral: 0 a 100 conferido antes da rede; sem valor gravado vale 50', async () => {
  servidor({});
  assert.equal((await comissaoGeral.obter()).comissaoPadrao, 50);
  for (const ruim of [-1, 101, NaN, '40', null]) assert.equal((await comissaoGeral.gravar(ruim)).ok, false);
  assert.equal(chamadas.length, 1);
  servidor({ comissaoPadrao: 35.5 });
  assert.equal((await comissaoGeral.gravar(35.5)).comissaoPadrao, 35.5);
  assert.deepEqual(chamadas[0], { url: 'https://loja.teste/api/estabelecimento/comissao', metodo: 'PUT', corpo: { comissaoPadrao: 35.5 } });
});

test('página pública: endereço e mapa só quando o servidor mandou, mapa só https', async () => {
  servidor({ ativo: true, diasMax: 30, servicos: [], profissionais: [], endereco: 'Rua A, 10 - Curitiba/PR', mapaUrl: 'https://maps.google.com/?q=1,2' });
  let p = (await publico.pagina()).pagina;
  assert.equal(p.endereco, 'Rua A, 10 - Curitiba/PR'); assert.equal(p.mapaUrl, 'https://maps.google.com/?q=1,2');
  servidor({ ativo: true, diasMax: 30, servicos: [], profissionais: [], endereco: 'Rua A', mapaUrl: 'http://x.com' });
  p = (await publico.pagina()).pagina;
  assert.equal(p.mapaUrl, '');
  servidor({ ativo: true, diasMax: 30, servicos: [], profissionais: [] });
  p = (await publico.pagina()).pagina;
  assert.equal(p.endereco, ''); assert.equal(p.mapaUrl, '');
});
