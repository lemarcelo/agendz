/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Endereço e localização (GPS) no simulador: validação, interruptores, endereço opcional na página do cliente e mapa só com https (espelho de LocalDaLoja).
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, auth, estabelecimento, publico } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';

const st = () => store.getState();
const como = (a) => { auth.logout(); assert.ok(auth.login({ identificador: a, senha: '1234' }).ok); };
test.beforeEach(() => { reiniciar(); como('davi'); });

test('latitude e longitude andam juntas e dentro da faixa; erros não alteram o estado', () => {
  const antes = JSON.stringify(st().estabelecimento);
  for (const ruim of [{ latitude: -25.4, longitude: null }, { latitude: 95, longitude: 10 }, { latitude: 10, longitude: 181 }, { latitude: 'x', longitude: 1 }]) assert.equal(estabelecimento.salvar(ruim).ok, false, JSON.stringify(ruim));
  assert.equal(JSON.stringify(st().estabelecimento), antes);
  assert.ok(estabelecimento.salvar({ latitude: -25.428356, longitude: -49.273251 }).ok);
  assert.equal(st().estabelecimento.latitude, -25.428356);
});

test('interruptores: enviar a localização no WhatsApp exige localização; mostrar o endereço exige endereço', () => {
  assert.equal(estabelecimento.salvar({ localizacaoNoWhatsapp: 'sim' }).ok, false);
  assert.match(estabelecimento.salvar({ localizacaoNoWhatsapp: true }).erros[0], /Informe a localização/);
  assert.match(estabelecimento.salvar({ endereco: '', enderecoNoLink: true }).erros[0], /Informe o endereço/);
  assert.ok(estabelecimento.salvar({ latitude: -25.4, longitude: -49.2, localizacaoNoWhatsapp: true }).ok);
  assert.equal(st().estabelecimento.localizacaoNoWhatsapp, true);
});

test('página do cliente: endereço e mapa só com o interruptor ligado; mapa pelas coordenadas, senão pelo endereço', () => {
  assert.ok(estabelecimento.salvar({ endereco: 'Rua A, 10 - Porto Alegre', enderecoNoLink: true }).ok);
  let cfg = publico.config();
  assert.equal(cfg.endereco, 'Rua A, 10 - Porto Alegre'); assert.match(cfg.mapaUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Rua%20A/);
  assert.ok(estabelecimento.salvar({ latitude: -25.4, longitude: -49.2 }).ok);
  assert.equal(publico.config().mapaUrl, 'https://maps.google.com/?q=-25.4,-49.2');
  assert.ok(estabelecimento.salvar({ enderecoNoLink: false }).ok);
  cfg = publico.config();
  assert.equal(cfg.endereco, ''); assert.equal(cfg.mapaUrl, '');
});
