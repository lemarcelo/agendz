/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Logo e tema da loja no site real: regras puras de tema.js (opção da tela ↔ par de cores, conferência da marca) e as rotas de api-real.js `marca`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETAS, corTemaDaPaleta, cssDaMarca, erroDaMarca, opcaoDoTema } from '../src/domain/tema.js';
import { configurar, marca } from '../src/services/api-real.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAAAAAAAAAAAAAAAAAA=';
const SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';
const FALSO = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAAAAAAAAAAAAAAAAAA='; // diz JPEG, o conteúdo é PNG

test('paleta ↔ par de cores: cada opção da tela volta a ser reconhecida depois de gravada', () => {
  assert.equal(corTemaDaPaleta('nao-existe'), null);
  for (const p of PALETAS) {
    const c = corTemaDaPaleta(p.id);
    assert.deepEqual([c.temaCor, c.temaCor2], p.cores);
    assert.equal(opcaoDoTema(c.temaCor, c.temaCor2), p.id);
    assert.equal(opcaoDoTema(c.temaCor.toUpperCase(), c.temaCor2.toUpperCase()), p.id, 'maiúsculas não mudam a opção');
  }
  assert.equal(opcaoDoTema(null, null), 'padrao');
  assert.equal(opcaoDoTema('lixo', '#112233'), 'padrao');
  assert.equal(opcaoDoTema('#123456', '#654321'), 'logo');
  assert.equal(opcaoDoTema('#123456', null), 'logo');
});

test('erroDaMarca: logo nula ou válida, cores #rrggbb juntas ou as duas nulas', () => {
  assert.equal(erroDaMarca({ logo: null, temaCor: null, temaCor2: null }), null);
  assert.equal(erroDaMarca({ logo: PNG, temaCor: '#112233', temaCor2: '#445566' }), null);
  assert.equal(erroDaMarca({ logo: PNG, temaCor: '#112233', temaCor2: null }), null);
  assert.match(erroDaMarca({ logo: SVG }), /Logo inválida/);
  assert.match(erroDaMarca({ logo: FALSO }), /Logo inválida/, 'o tipo vem do conteúdo, não do cabeçalho');
  assert.match(erroDaMarca({ logo: 'http://x/logo.png' }), /Logo inválida/);
  assert.match(erroDaMarca({ logo: null, temaCor: 'vermelho', temaCor2: null }), /Cor do tema inválida/);
  assert.match(erroDaMarca({ logo: null, temaCor: '#112233', temaCor2: 'azul' }), /Cor do tema inválida/);
  assert.match(erroDaMarca({ logo: null, temaCor: null, temaCor2: '#445566' }), /Cor do tema inválida/);
});

test('o tema gravado vira o CSS do topo e dos botões; sem cores e sem logo não há CSS', () => {
  assert.equal(cssDaMarca({ logo: null, corTema: null, corTema2: null, temaCor: 'padrao' }), '');
  const css = cssDaMarca({ logo: null, corTema: '#b45309', corTema2: '#f2a93b', temaCor: 'logo' });
  assert.match(css, /--tema-topo:/); assert.match(css, /--tema-btn:/);
  assert.ok(!/[<>]/.test(css));
});

let chamadas;
function servidor(resposta, status = 200) {
  chamadas = [];
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), metodo: init.method, corpo: init.body ? JSON.parse(init.body) : undefined });
    return { ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => resposta };
  };
}
test.beforeEach(() => configurar({ base: 'https://loja.teste' }));

test('marca.obter: lê só logo e as duas cores, com leitura defensiva', async () => {
  servidor({ logo: PNG, temaCor: '#112233', temaCor2: 'azul', extra: 'x' });
  const r = await marca.obter();
  assert.equal(chamadas[0].url, 'https://loja.teste/api/estabelecimento/marca');
  assert.deepEqual(r.marca, { logo: PNG, temaCor: '#112233', temaCor2: null });
  servidor({ logo: SVG, temaCor: null, temaCor2: null });
  assert.equal((await marca.obter()).marca.logo, null, 'logo que não passa na conferência nem é mostrada');
});

test('marca.gravar: PUT com o corpo inteiro; inválido nem sai do aparelho; sem cor 1 a cor 2 é descartada', async () => {
  servidor({ logo: PNG, temaCor: '#112233', temaCor2: '#445566' });
  const r = await marca.gravar({ logo: PNG, temaCor: '#112233', temaCor2: '#445566' });
  assert.equal(r.ok, true);
  assert.equal(chamadas[0].metodo, 'PUT'); assert.deepEqual(chamadas[0].corpo, { logo: PNG, temaCor: '#112233', temaCor2: '#445566' });
  await marca.gravar({});
  assert.deepEqual(chamadas[1].corpo, { logo: null, temaCor: null, temaCor2: null });
  const n = chamadas.length;
  assert.equal((await marca.gravar({ logo: SVG })).ok, false);
  assert.equal((await marca.gravar({ temaCor: 'x' })).ok, false);
  assert.equal(chamadas.length, n);
  servidor({ mensagem: 'Logo inválida: use PNG, JPEG ou WebP de até 100 KB.' }, 400);
  assert.equal((await marca.gravar({ logo: PNG })).erro, 'Logo inválida: use PNG, JPEG ou WebP de até 100 KB.');
  servidor({ mensagem: 'Sem acesso.' }, 403);
  assert.equal((await marca.gravar({ logo: PNG })).status, 403);
});
