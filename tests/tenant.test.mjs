/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// A loja vem SÓ do endereço (DNS/URL). Casos de ataque: host parecido, vários rótulos, maiúsculas, porta, slug reservado ou inválido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverLoja, slugValido } from '../src/domain/tenant.js';
import { CONFIG_DNS, LOJAS_DEMO, lojaDemo } from '../src/services/lojas-demo.js';

const CFG = { dominiosBase: ['agendz.com.br'], dominios: { 'agenda.apexestetica.com.br': 'apex' }, permitirQuery: false };
const r = (hostname, pathname = '/', search = '', cfg = CFG) => resolverLoja({ hostname, pathname, search }, cfg);

test('domínio próprio cadastrado escolhe a loja', () => {
  assert.deepEqual(r('agenda.apexestetica.com.br'), { slug: 'apex', via: 'dominio' });
  assert.deepEqual(r('AGENDA.ApexEstetica.com.br.'), { slug: 'apex', via: 'dominio' }, 'maiúsculas e ponto final');
  assert.deepEqual(r('agenda.apexestetica.com.br:8443'), { slug: 'apex', via: 'dominio' }, 'porta');
});
test('subdomínio da plataforma escolhe a loja', () => {
  assert.deepEqual(r('dalforno.agendz.com.br'), { slug: 'dalforno', via: 'subdominio' });
});
test('host parecido, vários rótulos e reservados não escolhem loja', () => {
  for (const h of ['dalforno.agendz.com.br.evil.com', 'evilagendz.com.br', 'a.b.agendz.com.br', 'www.agendz.com.br', 'api.agendz.com.br', 'admin.agendz.com.br', '-x.agendz.com.br', 'agendz.com.br', 'outro.com']) {
    assert.equal(r(h).slug, null, h);
  }
});
test('caminho /agendar/{slug} (link público compartilhável)', () => {
  assert.deepEqual(r('agendz.com.br', '/agendar/apex'), { slug: 'apex', via: 'caminho' });
  assert.deepEqual(r('agendz.com.br', '/agendar/Apex/'), { slug: 'apex', via: 'caminho' });
  assert.equal(r('agendz.com.br', '/agendar/../admin').slug, null);
  assert.equal(r('agendz.com.br', '/agendar/api').slug, null, 'slug reservado');
});
test('?loja= só vale quando a configuração permite (demonstração); produção ignora', () => {
  assert.equal(r('localhost', '/', '?loja=apex').slug, null);
  assert.deepEqual(r('localhost', '/', '?loja=apex', { ...CFG, permitirQuery: true }), { slug: 'apex', via: 'query' });
  assert.equal(r('localhost', '/', '?loja=<script>', { ...CFG, permitirQuery: true }).slug, null);
});
test('domínio próprio ganha de qualquer outra pista', () => {
  assert.equal(r('agenda.apexestetica.com.br', '/agendar/dalforno', '?loja=dalforno', { ...CFG, permitirQuery: true }).slug, 'apex');
});
test('slug: formato e reservados', () => {
  for (const s of ['apex', 'barbearia-dalforno', 'a1']) assert.ok(slugValido(s), s);
  for (const s of ['', 'A', '-a', 'a-', 'a_b', 'a.b', 'www', 'admin', 'x'.repeat(41), null, 7]) assert.ok(!slugValido(s), String(s));
});
test('lojas de demonstração: slugs válidos, únicos, um tipo cada; domínios apontam para lojas que existem', () => {
  const slugs = LOJAS_DEMO.map((l) => l.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const l of LOJAS_DEMO) { assert.ok(slugValido(l.slug)); assert.equal(l.criar(Date.now()).estabelecimento.tipo, l.tipo, 'o seed grava o tipo da loja'); }
  for (const s of Object.values(CONFIG_DNS.dominios)) assert.ok(lojaDemo(s), s);
});
test('cada loja nasce com estado próprio (nada compartilhado)', () => {
  const a = lojaDemo('apex').criar(Date.now()), b = lojaDemo('dalforno').criar(Date.now());
  a.clientes.push({ id: 'c-so-da-apex', nome: 'X' });
  assert.ok(!b.clientes.some((c) => c.id === 'c-so-da-apex'));
  assert.notEqual(a.estabelecimento.nome, b.estabelecimento.nome);
  assert.ok(b.estabelecimento.logo && b.estabelecimento.logo !== a.estabelecimento.logo, 'a Dalforno tem logo própria, não herda a da Apex');
});

test('offbox: segunda barbearia com nome próprio e sem rastro da Dalforno', () => {
  const o = lojaDemo('offbox').criar(Date.now());
  assert.equal(o.estabelecimento.tipo, 'barbearia');
  assert.equal(o.estabelecimento.nome, 'Offbox Barbearia');
  assert.ok(!/dalforno/i.test(JSON.stringify(o)), 'nenhum texto da Dalforno na Offbox');
  assert.ok(/dalforno/i.test(JSON.stringify(lojaDemo('dalforno').criar(Date.now()))), 'a Dalforno continua com o nome dela');
});
