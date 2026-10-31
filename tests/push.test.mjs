/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso com o app fechado (v130): funções puras do navegador (estado do recurso, chave VAPID em bytes, corpo da inscrição, leitura da mensagem recebida).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chaveEmBytes, corpoDaInscricao, estadoDoPush, lerMensagem } from '../src/domain/push.js';

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const CHAVE = b64u([4, ...Array.from({ length: 64 }, (_, i) => i + 1)]); // 65 bytes, começa em 0x04

test('estado: sem service worker/PushManager/Notification = sem suporte; negado = bloqueado; senão desligado', () => {
  const ok = { navigator: { serviceWorker: {} }, PushManager: function PM() {}, Notification: { permission: 'default' } };
  assert.equal(estadoDoPush(ok), 'desligado');
  assert.equal(estadoDoPush({ ...ok, Notification: { permission: 'granted' } }), 'desligado');
  assert.equal(estadoDoPush({ ...ok, Notification: { permission: 'denied' } }), 'bloqueado');
  assert.equal(estadoDoPush({ ...ok, PushManager: undefined }), 'sem-suporte');
  assert.equal(estadoDoPush({ ...ok, Notification: undefined }), 'sem-suporte');
  assert.equal(estadoDoPush({ ...ok, navigator: {} }), 'sem-suporte');
  assert.equal(estadoDoPush(undefined), 'sem-suporte');
});

test('chave VAPID: 65 bytes começando em 4; qualquer outra coisa vira null', () => {
  const bytes = chaveEmBytes(CHAVE);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4);
  assert.equal(bytes[64], 64);
  assert.equal(chaveEmBytes(''), null);
  assert.equal(chaveEmBytes('curta'), null);
  assert.equal(chaveEmBytes(undefined), null);
  assert.equal(chaveEmBytes(b64u([5, ...Array.from({ length: 64 }, () => 1)])), null, 'ponto comprimido/errado');
  assert.equal(chaveEmBytes(b64u([4, ...Array.from({ length: 63 }, () => 1)]) + 'AAAA'), null, 'tamanho errado');
  assert.equal(chaveEmBytes(CHAVE.replace(/.$/, '+')), null, 'caractere fora do base64url');
});

const sub = (endpoint, p = new Uint8Array(65).fill(4), a = new Uint8Array(16).fill(7)) => ({ endpoint, getKey: (n) => (n === 'p256dh' ? p : n === 'auth' ? a : null) });

test('corpo da inscrição: só https, com as duas chaves em base64url; nome do aparelho limitado', () => {
  const c = corpoDaInscricao(sub('https://fcm.googleapis.com/fcm/send/abc'), 'Celular Android · Chrome');
  assert.equal(c.endpoint, 'https://fcm.googleapis.com/fcm/send/abc');
  assert.equal(Buffer.from(c.keys.p256dh, 'base64url').length, 65);
  assert.equal(Buffer.from(c.keys.auth, 'base64url').length, 16);
  assert.ok(!/[+/=]/.test(c.keys.p256dh + c.keys.auth));
  assert.equal(c.aparelho, 'Celular Android · Chrome');
  assert.equal(corpoDaInscricao(sub('https://x.example/a'), 'x'.repeat(200)).aparelho.length, 60);
  assert.equal(corpoDaInscricao(sub('https://x.example/a'), '').aparelho, undefined);
  assert.equal(corpoDaInscricao(sub('http://fcm.googleapis.com/x')), null, 'http puro nunca');
  assert.equal(corpoDaInscricao(sub('https://x.example/' + 'a'.repeat(700))), null, 'endpoint grande demais');
  assert.equal(corpoDaInscricao({ endpoint: 'https://x.example/a', getKey: () => null }), null, 'sem chaves');
  assert.equal(corpoDaInscricao(null), null);
  assert.equal(corpoDaInscricao({}), null);
});

test('mensagem recebida: texto limitado, sem controle; url só caminho do próprio site; lixo vira o padrão', () => {
  const m = lerMensagem(JSON.stringify({ titulo: 'Dalforno', texto: 'Alan marcou\n15:30', url: '/', tag: 'abc', tipo: 'pedido' }));
  assert.deepEqual(m, { titulo: 'Dalforno', texto: 'Alan marcou 15:30', url: '/', tag: 'abc', tipo: 'pedido' });
  assert.equal(lerMensagem(JSON.stringify({ titulo: 'x'.repeat(500) })).titulo.length, 80);
  assert.equal(lerMensagem(JSON.stringify({ texto: 'y'.repeat(900) })).texto.length, 200);
  for (const url of ['https://mal.example/', '//mal.example/', 'javascript:alert(1)', '/a b', '\\\\mal', 123, null]) {
    assert.equal(lerMensagem(JSON.stringify({ url })).url, '/', `url ${url}`);
  }
  assert.equal(lerMensagem(JSON.stringify({ url: '/agenda?dia=2026-10-31' })).url, '/agenda?dia=2026-10-31');
  for (const lixo of ['', 'não é json', 'null', '[]', '7']) {
    const r = lerMensagem(lixo);
    assert.equal(r.titulo, 'Agendz'); assert.equal(r.texto, ''); assert.equal(r.url, '/'); assert.equal(r.tag, 'agendz');
  }
});
