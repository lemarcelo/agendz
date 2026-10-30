/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso de reagendamento pelo WhatsApp: mensagem padrão (nome, serviço, novo dia e hora, endereço quando houver) e endereço wa.me com o número do cliente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { enderecosWhatsapp, numeroWhatsapp, textoReagendamento } from '../src/domain/whatsapp.js';

test('mensagem de reagendamento: nome, serviço, novo horário e endereço só quando existe', () => {
  const m = textoReagendamento({ nomeEstab: 'Dalforno', nomeCliente: 'Bruno Silva', servicos: 'Corte + Barba', dataHora: 'sábado, 31 de outubro, às 14:00', endereco: 'Rua A, 10 - Centro', mapaUrl: 'https://maps.google.com/?q=1,2' });
  assert.match(m, /^Olá, Bruno! Precisamos reagendar o seu horário na Dalforno \(Corte \+ Barba\)\./);
  assert.match(m, /O novo horário é sábado, 31 de outubro, às 14:00\./);
  assert.match(m, /📍 Rua A, 10 - Centro/); assert.match(m, /Como chegar: https:\/\/maps\.google\.com/);
  const sem = textoReagendamento({ nomeEstab: 'Dalforno', nomeCliente: 'Ana', servicos: 'Corte', dataHora: 'hoje', endereco: '', mapaUrl: 'javascript:alert(1)' });
  assert.ok(!sem.includes('📍') && !sem.includes('Como chegar') && !sem.includes('javascript'), 'sem endereço não há linha de endereço; mapa só https');
  assert.ok(textoReagendamento({ nomeEstab: 'x'.repeat(300), nomeCliente: 'y'.repeat(300), servicos: 'z'.repeat(500), dataHora: 'w'.repeat(500), endereco: 'e'.repeat(500) }).length <= 500);
});

test('número do wa.me: 55 + DDD + número, só de telefone brasileiro válido', () => {
  assert.equal(numeroWhatsapp('(53) 99900-0001'), '5553999000001');
  assert.equal(numeroWhatsapp('5553999000001'), '5553999000001');
  assert.equal(numeroWhatsapp('(53) 3222-1111'), '555332221111');
  for (const ruim of ['', '123', '(53) 8888-777', '+1 202 555 0100', null, undefined]) assert.equal(numeroWhatsapp(ruim), '', String(ruim));
  assert.equal(enderecosWhatsapp('oi', '(53) 99900-0001').wa, 'https://wa.me/5553999000001?text=oi');
  assert.equal(enderecosWhatsapp('oi').wa, 'https://wa.me/?text=oi', 'sem telefone o dono escolhe o contato');
  assert.ok(!enderecosWhatsapp('a', '53999000001').wa.startsWith('whatsapp:'), 'nunca o esquema whatsapp://');
});
