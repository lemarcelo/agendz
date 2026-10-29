/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estabelecimento no site real (dist/index-real.html) contra um servidor falso: endereço e localização (colar link do Maps, GPS do aparelho, interruptores
// desligados de fábrica, mensagens do servidor), comissão geral, localização no WhatsApp do botão Link, endereço opcional na página do cliente e 390 px.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const chamadas = [];
let papel = 'dono';
const MAPA = (l, g) => `https://maps.google.com/?q=${l},${g}`;
let salvo = { enderecoNoLink: false, localizacaoNoWhatsapp: false };
let comissao = null;
const montar = (c) => {
  const r = { ...c };
  if (c.logradouro) r.enderecoTexto = `${c.logradouro}${c.numero ? `, ${c.numero}` : ''} - ${c.cidade}${c.uf ? `/${c.uf}` : ''}`;
  if (c.latitude !== undefined) r.localizacaoUrl = MAPA(c.latitude, c.longitude);
  if (c.latitude !== undefined && c.localizacaoNoWhatsapp) r.localizacaoWhatsappUrl = MAPA(c.latitude, c.longitude);
  return r;
};
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, corpo: c ? structuredClone(c) : c, auth: req.headers.authorization || '' });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: papel === 'dono' ? ALAN : KIKO, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'] });
    if (u.pathname === '/api/avisos') return json(200, []);
    if (u.pathname.startsWith('/api/agendamentos') || u.pathname === '/api/profissionais' || u.pathname === '/api/clientes') return json(200, []);
    if (u.pathname === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, servicos: [], profissionais: [], ...(salvo.enderecoNoLink && salvo.logradouro ? { endereco: montar(salvo).enderecoTexto, mapaUrl: montar(salvo).localizacaoUrl || 'https://www.google.com/maps/search/?api=1&query=x' } : {}) });
    if (u.pathname === '/api/estabelecimento/local' && req.method === 'GET') {
      if (papel !== 'dono') return json(200, salvo.localizacaoNoWhatsapp && salvo.latitude !== undefined ? { localizacaoWhatsappUrl: MAPA(salvo.latitude, salvo.longitude) } : {});
      return json(200, montar(salvo));
    }
    if (u.pathname === '/api/estabelecimento/local' && req.method === 'PUT') {
      if ((c.latitude === undefined) !== (c.longitude === undefined)) return json(400, { mensagem: 'Informe latitude e longitude juntas (ou deixe as duas vazias).' });
      if (c.localizacaoNoWhatsapp && c.latitude === undefined) return json(400, { mensagem: 'Informe a localização (latitude e longitude) para enviá-la no WhatsApp.' });
      if (c.enderecoNoLink && !c.logradouro) return json(400, { mensagem: 'Informe o endereço (rua e cidade) para mostrá-lo no link de agendamento.' });
      if (c.cep) c.cep = c.cep.replace(/\D/g, '');
      if (c.uf) c.uf = c.uf.toUpperCase();
      salvo = c; return json(200, montar(salvo));
    }
    if (u.pathname === '/api/estabelecimento/comissao' && req.method === 'GET') return json(200, { comissaoPadrao: comissao ?? 50 });
    if (u.pathname === '/api/estabelecimento/comissao' && req.method === 'PUT') { comissao = c.comissaoPadrao; return json(200, { comissaoPadrao: comissao }); }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 860 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(AGORA);
  await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  return { ctx, p };
}
const textoDe = (p, t) => p.getByTestId(t).innerText();
const semRolagem = async (p, onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };


const ultimo = (m, rota) => chamadas.filter((c) => c.m === m && c.u === rota).at(-1);
{
  const { ctx, p } = await abrir();
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: -25.428356, longitude: -49.273251 });
  await p.getByTestId('nav-estabelecimento').click();
  await p.getByTestId('loc-form').waitFor();
  assert.equal(await p.getByTestId('loc-no-link').isChecked(), false, 'interruptores nascem desligados');
  assert.equal(await p.getByTestId('loc-no-whatsapp').isChecked(), false);
  // liga o envio sem localização: o servidor recusa e a tela mostra a mensagem dele
  await p.getByTestId('loc-no-whatsapp').check(); await p.getByTestId('loc-salvar').click();
  assert.match(await textoDe(p, 'loc-erro'), /Informe a localização \(latitude e longitude\)/);
  // cola um link do Maps: latitude e longitude preenchidas
  await p.getByTestId('loc-colar').fill('https://www.google.com/maps/@-25.428356,-49.273251,17z');
  assert.equal(await p.getByTestId('loc-lat').inputValue(), '-25,428356'); assert.equal(await p.getByTestId('loc-lng').inputValue(), '-49,273251');
  await p.getByTestId('loc-colar').fill('rua das flores');
  assert.match(await textoDe(p, 'loc-gps-msg'), /Não achei coordenadas/);
  ok('interruptores desligados de fábrica, mensagem do servidor e link do Maps lido');
  // GPS do aparelho
  await p.getByTestId('loc-lat').fill(''); await p.getByTestId('loc-lng').fill('');
  await p.getByTestId('loc-usar-gps').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="loc-lat"]').value !== '');
  assert.equal(await p.getByTestId('loc-lat').inputValue(), '-25,428356');
  // endereço e salvar
  await p.getByTestId('loc-logradouro').fill('Rua das Flores'); await p.getByTestId('loc-numero').fill('120'); await p.getByTestId('loc-cidade').fill('Curitiba');
  await p.getByTestId('loc-uf').fill('pr'); await p.getByTestId('loc-cep').fill('80010-000'); await p.getByTestId('loc-no-link').check();
  await p.getByTestId('loc-salvar').click();
  await p.getByTestId('loc-ok').waitFor();
  assert.deepEqual(ultimo('PUT', '/api/estabelecimento/local').corpo, { enderecoNoLink: true, localizacaoNoWhatsapp: true, logradouro: 'Rua das Flores', numero: '120', cidade: 'Curitiba', uf: 'pr', cep: '80010-000', latitude: -25.428356, longitude: -49.273251 });
  assert.equal(await p.getByTestId('loc-ver-mapa').getAttribute('href'), MAPA(-25.428356, -49.273251));
  assert.equal(await p.getByTestId('loc-uf').inputValue(), 'PR'); assert.equal(await p.getByTestId('loc-cep').inputValue(), '80010-000');
  ok('GPS do aparelho, endereço e interruptores salvos');
  // comissão geral
  assert.equal(await p.getByTestId('com-geral').inputValue(), '50');
  await p.getByTestId('com-geral').fill('150'); await p.getByTestId('com-geral-salvar').click();
  assert.match(await textoDe(p, 'com-geral-erro'), /vai de 0 a 100%/);
  await p.getByTestId('com-geral').fill('42,5'); await p.getByTestId('com-geral-salvar').click(); await p.getByTestId('com-geral-ok').waitFor();
  assert.deepEqual(ultimo('PUT', '/api/estabelecimento/comissao').corpo, { comissaoPadrao: 42.5 });
  ok('comissão geral');
  // o botão Link da Agenda manda a localização no WhatsApp
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  await p.waitForTimeout(200);
  const aba = ctx.waitForEvent('page', { timeout: 6000 });
  await p.getByTestId('agenda-link').click();
  const pop = await aba; const msg = decodeURIComponent(pop.url().split('text=')[1]);
  assert.ok(msg.endsWith(`\n📍 Como chegar: ${MAPA(-25.428356, -49.273251)}`), msg); assert.match(msg, /#agendar/);
  await pop.close();
  ok('o convite do WhatsApp leva o link da localização');
  // desliga o envio: o convite volta a ser só o link
  salvo = { ...salvo, localizacaoNoWhatsapp: false };
  await p.reload(); await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('agenda-dia').waitFor(); await p.waitForTimeout(300);
  const aba2 = ctx.waitForEvent('page', { timeout: 6000 });
  await p.getByTestId('agenda-link').click();
  const pop2 = await aba2; assert.doesNotMatch(decodeURIComponent(pop2.url().split('text=')[1]), /Como chegar/); await pop2.close();
  ok('com o envio desligado o convite não leva a localização');
  await ctx.close();
}
{
  // página do cliente: endereço só com o interruptor ligado
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  await p.goto(url + '#agendar');
  await p.getByTestId('pub-contato').waitFor();
  assert.match(await textoDe(p, 'pub-endereco'), /Rua das Flores, 120 - Curitiba\/PR/);
  assert.match(await p.getByTestId('pub-mapa').getAttribute('href'), /^https:\/\/maps\.google\.com/);
  assert.equal(await p.getByTestId('pub-mapa').getAttribute('rel'), 'noopener noreferrer');
  assert.ok(chamadas.filter((c) => c.u === '/api/publico/agendar').every((c) => c.auth === ''), 'a página do cliente nunca manda o token do painel');
  await semRolagem(p, 'página do cliente 390');
  await ctx.close();
  salvo = { ...salvo, enderecoNoLink: false };
  const c2 = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p2 = await c2.newPage(); p2.setDefaultTimeout(8000);
  await p2.goto(url + '#agendar'); await p2.getByTestId('pagina-publica').waitFor(); await p2.waitForTimeout(400);
  assert.equal(await p2.getByTestId('pub-contato').count(), 0, 'interruptor desligado: sem endereço na página do cliente');
  await c2.close();
  salvo = { ...salvo, enderecoNoLink: true };
  ok('endereço opcional na página do cliente');
}
{
  const n = await abrir({ width: 390, height: 800 });
  await n.p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await n.p.getByTestId('nav-estabelecimento').click();
  await n.p.getByTestId('loc-form').waitFor();
  await n.p.getByTestId('com-geral').waitFor();
  await semRolagem(n.p, 'estabelecimento 390');
  await n.ctx.close();
  ok('390 px com fonte larga: sem rolagem lateral');
}
{
  // quem só usa a agenda não tem o menu e só recebe o link do mapa
  papel = 'profissional';
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-agenda').waitFor();
  assert.equal(await p.getByTestId('nav-estabelecimento').count(), 0);
  await ctx.close();
  papel = 'dono';
  ok('sem permissão, sem menu');
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e61 ok');
