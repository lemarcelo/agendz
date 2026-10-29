/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Link da página do cliente: leitura do hash e montagem (loja só na demonstração; nada fora de letras, números e hífen).
import test from 'node:test';
import assert from 'node:assert/strict';
import { LINK_ARTEFATO, baseDoLink, lerHashAgendar, montarLinkAgendamento } from '../src/domain/link-publico.js';

test('lê #agendar, #agendar-<id>, #agendar@loja e #agendar-<id>@loja; o resto não é link', () => {
  assert.deepEqual(lerHashAgendar('#agendar'), { profissionalId: '', loja: '' });
  assert.deepEqual(lerHashAgendar('#agendar-u-pablo'), { profissionalId: 'u-pablo', loja: '' });
  assert.deepEqual(lerHashAgendar('#agendar@dalforno'), { profissionalId: '', loja: 'dalforno' });
  assert.deepEqual(lerHashAgendar('#agendar-u-pablo@offbox'), { profissionalId: 'u-pablo', loja: 'offbox' });
  for (const x of ['', '#', '#agendarx', '#agendar@', '#agendar@Apex', '#agendar@a b', '#agendar-@x', '#agendar/../x', '#agendar@a@b', null, undefined, '#agendar-' + 'x'.repeat(41)]) assert.equal(lerHashAgendar(x), null, String(x));
});

test('monta o link com a loja só quando pedida e ignora valores fora do padrão', () => {
  const base = 'https://x.test/a';
  assert.equal(montarLinkAgendamento({ base }), `${base}#agendar`);
  assert.equal(montarLinkAgendamento({ base, profissionalId: 'u-pablo', lojaNoLink: 'dalforno' }), `${base}#agendar-u-pablo@dalforno`);
  assert.equal(montarLinkAgendamento({ base, busca: '?loja=apex', lojaNoLink: 'apex' }), `${base}?loja=apex#agendar@apex`);
  assert.equal(montarLinkAgendamento({ base, profissionalId: 'a b', lojaNoLink: 'Apex!' }), `${base}#agendar`);
});

test('base do link: endereço real em http(s); quadro sem endereço (origem null, srcdoc) cai no endereço do Artifact', () => {
  assert.equal(baseDoLink({ protocol: 'https:', origin: 'https://x.claudeusercontent.com', pathname: '/a/b' }), 'https://x.claudeusercontent.com/a/b');
  assert.equal(baseDoLink({ protocol: 'https:', origin: 'null', pathname: '/a' }), LINK_ARTEFATO);
  assert.equal(baseDoLink({ protocol: 'about:', origin: 'null', pathname: 'srcdoc' }), LINK_ARTEFATO);
  assert.equal(baseDoLink({ protocol: 'file:', origin: 'null', pathname: '/tmp/agenda.html' }), '/tmp/agenda.html');
  assert.equal(baseDoLink({}), LINK_ARTEFATO);
});
