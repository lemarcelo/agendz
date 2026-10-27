// Botão de link abre o WhatsApp: endereços gerados, texto da mensagem e detecção de celular.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { textoConvite, enderecosWhatsapp } from '../src/domain/whatsapp.js';

const LINK = 'https://exemplo.com/agenda/#agendar-u-kiko';

test('mensagem: nome da barbearia e link, sem quebrar com texto estranho', () => {
  assert.equal(textoConvite('Barbearia Dalforno', LINK), `Agende seu horário na Barbearia Dalforno: ${LINK}`);
  assert.equal(textoConvite('', LINK), `Agende seu horário: ${LINK}`);
  assert.ok(textoConvite('  Barbearia \n  do   Zé ', LINK).includes('Barbearia do Zé'));
  assert.ok(textoConvite('x'.repeat(5000), 'y'.repeat(5000)).length <= 400, 'mensagem limitada');
  assert.ok(textoConvite(null, undefined).startsWith('Agende seu horário'));
});

test('endereço: só https://wa.me, texto codificado, nunca número fixo', () => {
  const t = textoConvite('Barbearia & Cia', LINK);
  const { wa } = enderecosWhatsapp(t);
  assert.ok(wa.startsWith('https://wa.me/?text='));
  const q = wa.split('text=')[1];
  assert.equal(decodeURIComponent(q), t, 'o texto volta igual ao decodificar');
  assert.ok(!/[ &#\n]/.test(q), 'texto codificado (nada de espaço, & ou # solto)');
  assert.ok(!/phone=|wa\.me\/\d/.test(wa), 'sem número de telefone');
});

test('endereço: texto malicioso não escapa do parâmetro nem vira outro esquema', () => {
  for (const ruim of ['javascript:alert(1)', '"><script>x</script>', 'a&phone=5551999999999', 'a\r\nHost: x', '%0d%0a']) {
    const { wa } = enderecosWhatsapp(ruim);
    assert.ok(wa.startsWith('https://wa.me/?text='));
    assert.equal(wa.split('?')[1].split('&').length, 1, 'um só parâmetro');
    assert.equal(decodeURIComponent(wa.split('text=')[1]), ruim);
  }
});

test('front: o botão abre o WhatsApp em aba nova e copia como reserva, sem sair do painel', () => {
  const ag = readFileSync(new URL('../src/ui/Agenda.jsx', import.meta.url), 'utf8');
  assert.match(ag, /abrirWhatsapp\(textoConvite\(/, 'botão chama abrirWhatsapp');
  assert.match(ag, /copiarTexto\(link\)/, 'copia o link como reserva');
  const i = ag.indexOf('const copiarLink'); const bloco = ag.slice(i, ag.indexOf('const escolher', i));
  assert.ok(!/async|await/.test(bloco), 'nada de await: o navegador perderia o clique');
  const w = readFileSync(new URL('../src/ui/whatsapp.js', import.meta.url), 'utf8');
  assert.match(w, /target = '_blank'/, 'abre em aba nova');
  assert.match(w, /noopener/, 'sem acesso à página de origem');
  assert.ok(!/location\.(href|assign|replace)\s*=|location\.(assign|replace)\(/.test(w), 'nunca navega a própria página (perderia o painel)');
});

test('front: nenhum arquivo do app usa o esquema whatsapp:// (deixa a tela em branco sem aplicativo registrado)', () => {
  const ruins = [];
  const ler = (d) => { for (const n of readdirSync(d, { withFileTypes: true })) { const f = `${d}/${n.name}`; if (n.isDirectory()) ler(f); else if (/\.(jsx?|mjs)$/.test(n.name) && /['"`]whatsapp:/.test(readFileSync(f, 'utf8'))) ruins.push(f); } };
  ler(new URL('../src', import.meta.url).pathname);
  assert.deepEqual(ruins, []);
});
