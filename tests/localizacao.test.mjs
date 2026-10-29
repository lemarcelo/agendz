/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Localização da loja: lê latitude e longitude de um texto colado (links do Google Maps ou "lat, lng") e recusa o que está fora da faixa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coordenadasDeTexto, latitudeValida, longitudeValida } from '../src/domain/localizacao.js';

const ESPERADO = { lat: -25.428356, lng: -49.273251 };

test('lê os formatos de link do Google Maps e o par colado direto', () => {
  assert.deepEqual(coordenadasDeTexto('-25.428356, -49.273251'), ESPERADO);
  assert.deepEqual(coordenadasDeTexto('  -25.428356,-49.273251  '), ESPERADO);
  assert.deepEqual(coordenadasDeTexto('https://www.google.com/maps/@-25.428356,-49.273251,17z'), ESPERADO);
  assert.deepEqual(coordenadasDeTexto('https://www.google.com/maps/place/Rua+X/@-25.4,-49.2,15z/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d-25.428356!4d-49.273251'), ESPERADO, 'o ponto marcado vence a vista do mapa');
  assert.deepEqual(coordenadasDeTexto('https://maps.google.com/?q=-25.428356,-49.273251'), ESPERADO);
  assert.deepEqual(coordenadasDeTexto('https://www.google.com/maps/search/?api=1&query=-25.428356%2C-49.273251'), ESPERADO);
  assert.deepEqual(coordenadasDeTexto('23.55052; -46.633308'), { lat: 23.55052, lng: -46.633308 });
});

test('recusa vazio, texto sem coordenadas e valores fora da faixa', () => {
  for (const ruim of ['', '   ', null, undefined, 'Rua das Flores, 120', 'abc, def', '95, 10', '10, 181', '-91.5, 20', 'https://maps.app.goo.gl/AbCdEf']) assert.equal(coordenadasDeTexto(ruim), null, String(ruim));
  assert.equal(coordenadasDeTexto('1,2,3'), null);
  assert.equal(coordenadasDeTexto('x'.repeat(5000)), null);
});

test('faixas de latitude e longitude', () => {
  assert.ok(latitudeValida(90) && latitudeValida(-90) && !latitudeValida(90.0001) && !latitudeValida(NaN));
  assert.ok(longitudeValida(180) && longitudeValida(-180) && !longitudeValida(180.1) && !longitudeValida(Infinity));
});

test('caminhoHttps só devolve link https sem espaço', async () => {
  const { caminhoHttps } = await import('../src/domain/localizacao.js');
  assert.equal(caminhoHttps('https://maps.google.com/?q=1,2'), 'maps.google.com/?q=1,2');
  for (const ruim of ['http://x.com', 'javascript:alert(1)', 'https://a b', '', null, undefined, 'HTTPS://x.com']) assert.equal(caminhoHttps(ruim), '', String(ruim));
});
