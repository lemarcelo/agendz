/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import net from 'node:net';
import { criarProxy, destinoPermitido, ipPublico } from '../deploy/homologacao/proxy-push.mjs';

test('proxy de homologação permite apenas provedores de push em TLS', () => {
  assert.equal(destinoPermitido('fcm.googleapis.com',443),true);
  assert.equal(destinoPermitido('web.push.apple.com',443),true);
  for (const [host,porta] of [['api',443],['localhost',443],['fcm.googleapis.com.evil.invalid',443],['fcm.googleapis.com',80]]) assert.equal(destinoPermitido(host,porta),false);
});
test('proxy recusa conexão real a endereços fora da lista', async () => {
  const servidor=criarProxy();
  await new Promise((resolve) => servidor.listen(0,'127.0.0.1',resolve));
  try {
    const resposta=await new Promise((resolve,reject) => {
      const c=net.connect(servidor.address().port,'127.0.0.1', () => c.write('CONNECT localhost:443 HTTP/1.1\r\nHost: localhost\r\n\r\n'));
      let dados=''; c.on('data',(x) => { dados+=x; }); c.on('end',() => resolve(dados)); c.on('error',reject);
    });
    assert.match(resposta,/^HTTP\/1\.1 403/);
  } finally { await new Promise((resolve) => servidor.close(resolve)); }
});
test('proxy não conecta em endereços internos, loopback ou reservados', () => {
  for (const ip of ['127.0.0.1','10.0.0.1','172.18.0.2','192.168.1.1','169.254.169.254','100.64.0.1','::1']) assert.equal(ipPublico(ip),false,ip);
  assert.equal(ipPublico('8.8.8.8'),true);
});
