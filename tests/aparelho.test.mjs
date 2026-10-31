/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ehCelular, rotuloDoAparelho } from '../src/domain/aparelho.js';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
  tabletAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

test('aparelho: nome curto a partir do navegador', () => {
  assert.equal(rotuloDoAparelho(UA.androidChrome), 'Celular Android · Chrome');
  assert.equal(rotuloDoAparelho(UA.androidSamsung), 'Celular Android · Samsung Internet');
  assert.equal(rotuloDoAparelho(UA.tabletAndroid), 'Tablet Android · Chrome');
  assert.equal(rotuloDoAparelho(UA.iphone), 'iPhone · Safari');
  assert.equal(rotuloDoAparelho(UA.iphoneChrome), 'iPhone · Chrome');
  assert.equal(rotuloDoAparelho(UA.ipad), 'iPad · Safari');
  assert.equal(rotuloDoAparelho(UA.windowsEdge), 'Computador Windows · Edge');
  assert.equal(rotuloDoAparelho(UA.windowsChrome), 'Computador Windows · Chrome');
  assert.equal(rotuloDoAparelho(UA.macSafari), 'Mac · Safari');
  assert.equal(rotuloDoAparelho(UA.linuxFirefox), 'Computador Linux · Firefox');
});

test('aparelho: sem pistas, vazio ou estranho vira "Este aparelho" e o nome nunca passa de 60 caracteres', () => {
  for (const v of ['', null, undefined, 0, {}, '???', 'curl/8.0']) assert.equal(rotuloDoAparelho(v), 'Este aparelho', String(v));
  assert.ok(rotuloDoAparelho('Android Mobile ' + 'x'.repeat(5000)).length <= 60);
  assert.doesNotMatch(rotuloDoAparelho('Windows\u0000\u001f Chrome/1'), /[\u0000-\u001f]/);
});

test('aparelho: celular x computador (sugere "aparelho" ou "rede" na pergunta do login)', () => {
  for (const k of ['androidChrome', 'androidSamsung', 'iphone', 'iphoneChrome']) assert.equal(ehCelular(UA[k]), true, k);
  for (const k of ['tabletAndroid', 'ipad', 'windowsEdge', 'windowsChrome', 'macSafari', 'linuxFirefox']) assert.equal(ehCelular(UA[k]), false, k);
  assert.equal(ehCelular(undefined), false);
});
