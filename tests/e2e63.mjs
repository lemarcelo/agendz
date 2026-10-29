/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Aviso de agendamento novo e Meu perfil no site real: faixa no topo, 3 bipes e vibração, cartão pulsando, tocar na faixa leva ao cartão (outro dia),
// escolhas do perfil (som, faixa, vibração) valendo na hora e guardadas no aparelho, dados e foto próprios, troca de senha, profissional e 390 px.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const U = (s) => new Date(`${s}-03:00`).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), BRUNO = id(11);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=', 'base64');
const banco = [];
const ag = (n, inicio, min, prof, cli, status, nome, extra = {}) => banco.push({ id: id(100 + n), clienteId: cli, profissionalId: prof, inicio: U(inicio), fim: new Date(new Date(U(inicio)).getTime() + min * 60000).toISOString(), fimOcupado: new Date(new Date(U(inicio)).getTime() + (min + 10) * 60000).toISOString(), status, total: 40, encaixe: false, origem: 'painel', reagendado: false, servicos: [{ servicoId: id(50), nome, preco: 40, duracaoMin: min }], produtos: [], ...extra });
ag(1, '2026-10-28T09:00:00', 45, ALAN, BRUNO, 'confirmado', 'Corte');
const chamadas = [];
let avisosServidor = [{ id: id(899), tipo: 'pedido', texto: 'Aviso antigo que não pode apitar.', em: '2026-10-27T12:00:00Z', agendamentoId: id(101), lido: false }];
let papel = 'dono';
let eu = { id: ALAN, nome: 'Alan Dalforno', apelido: 'Alan', usuario: 'alan', papel: 'dono', email: '', telefone: '', nascimento: '', foto: null };
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, corpo: corpo ? JSON.parse(corpo) : null });
    const login = { token: 'tok', id: ALAN, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] };
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, login);
    if (u.pathname === '/api/clientes') return json(200, [{ id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '11999990001' }]);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]);
    if (u.pathname === '/api/estabelecimento/local') return json(200, {});
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) > de));
    }
    const m = /^\/api\/agendamentos\/([^/]+)$/.exec(u.pathname);
    if (m) { const a = banco.find((x) => x.id === m[1]); return a ? json(200, { ...a, historico: [] }) : json(404, { mensagem: 'Agendamento não encontrado.' }); }
    if (u.pathname === '/api/avisos') return json(200, avisosServidor);
    const l = /^\/api\/avisos\/([^/]+)\/lido$/.exec(u.pathname);
    if (l) { const a = avisosServidor.find((x) => x.id === l[1]); if (a) a.lido = true; return json(200, a || {}); }
    if (u.pathname === '/api/usuarios/me' && req.method === 'GET') return json(200, eu);
    if (u.pathname === '/api/usuarios/me' && req.method === 'PUT') {
      const c = JSON.parse(corpo);
      if (c.apelido === 'Kiko') return json(409, { mensagem: 'Já existe alguém com esses dados. Confira o apelido.' });
      eu = { ...eu, ...Object.fromEntries(['nome', 'apelido', 'email', 'telefone', 'nascimento'].filter((k) => typeof c[k] === 'string').map((k) => [k, c[k]])) };
      return json(200, eu);
    }
    if (u.pathname === '/api/usuarios/me/foto') { eu = { ...eu, foto: JSON.parse(corpo).foto || null }; return json(204); }
    if (u.pathname === '/api/usuarios/me/senha') { const c = JSON.parse(corpo); return c.senhaAtual === 'Minha-senha' ? json(200, login) : json(403, { mensagem: 'Senha atual incorreta.' }); }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
// Som e vibração de mentira: contam os toques e as vibrações.
const SIMULA = () => {
  window.__bipes = 0; window.__vib = [];
  window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); } createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() { window.__bipes++; }, stop() {} }; } createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } };
  navigator.vibrate = (p) => { window.__vib.push(p); return true; };
};
async function abrir(viewport = { width: 1280, height: 860 }, ctxExistente = null) {
  const touch = viewport.width < 700;
  const ctx = ctxExistente || await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  if (!ctxExistente) { await ctx.clock.install({ time: new Date('2026-10-28T10:00:00-03:00') }); await ctx.addInitScript(SIMULA); } // relógio controlado: os 9 s do pulso passam com runFor
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await entrar(p);
  return { ctx, p };
}
async function entrar(p) {
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('agenda-dia').waitFor();
}
const sinal = (p) => p.evaluate(() => window.dispatchEvent(new Event('focus')));
const lerContagem = (p) => p.evaluate(() => ({ bipes: window.__bipes, vib: window.__vib.length }));
const consultas = () => chamadas.filter((c) => c.u === '/api/avisos').length;
const novoAviso = (n, ag, extra = {}) => { avisosServidor = [{ id: id(n), tipo: 'pedido', texto: `Bruno pediu horário (${n}).`, em: new Date().toISOString(), agendamentoId: ag, lido: false, ...extra }, ...avisosServidor]; };
const semRolagem = async (p, onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };
const A200 = id(300), A201 = id(301), A202 = id(302); // ag(n) cria o id 100 + n

{
  const { ctx, p } = await abrir();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 1);
  assert.equal(await p.getByTestId('faixa-aviso').count(), 0, 'aviso antigo (já existia) não apita nem aparece');
  assert.deepEqual(await lerContagem(p), { bipes: 0, vib: 0 });
  ok('primeira consulta só aprende o que já existe');

  // cliente agenda pelo link: faixa, 3 bipes, vibração e cartão pulsando
  ag(200, '2026-10-30T15:00:00', 30, KIKO, BRUNO, 'a_confirmar', 'Barba', { origem: 'link' });
  novoAviso(901, A200);
  await sinal(p);
  await p.getByTestId('faixa-aviso').waitFor();
  assert.match(await p.getByTestId('faixa-aviso-texto').innerText(), /Bruno pediu horário \(901\)/);
  assert.deepEqual(await lerContagem(p), { bipes: 3, vib: 1 });
  const alvo = p.locator(`[data-id="${A200}"]`);
  await alvo.waitFor();
  assert.equal(await alvo.getAttribute('data-destaque'), 'sim');
  assert.match(await alvo.evaluate((el) => getComputedStyle(el).animationName), /pulsa-real/);
  await sinal(p); await p.waitForTimeout(300);
  assert.deepEqual(await lerContagem(p), { bipes: 3, vib: 1 }, 'o mesmo aviso não apita de novo');
  ok('agendamento novo: faixa no topo, 3 bipes, vibração e cartão pulsando');

  // longe do dia: tocar na faixa leva ao dia, abre o cartão e marca como lido
  await p.getByTestId('agenda-anterior').click(); await p.getByTestId('agenda-anterior').click();
  await p.getByTestId('faixa-aviso-ir').click();
  await p.waitForFunction((i) => document.querySelector(`[data-testid="cartao"][data-id="${i}"] button.cartao`)?.getAttribute('aria-expanded') === 'true', A200);
  assert.equal(await p.getByTestId('faixa-aviso').count(), 0);
  assert.match(await p.getByTestId('agenda-titulo').innerText(), /30/);
  assert.ok(chamadas.some((c) => c.m === 'PUT' && c.u === `/api/avisos/${id(901)}/lido`), 'marcou o aviso como lido');
  assert.equal(await p.evaluate((i) => document.activeElement?.closest('[data-id]')?.getAttribute('data-id') === i, A200), true, 'o foco foi para o cartão');
  ok('tocar na faixa abre o dia, o cartão e leva o foco');

  // o pulso acaba sozinho
  await p.clock.runFor(10000);
  await p.waitForFunction((i) => !document.querySelector(`[data-id="${i}"]`)?.hasAttribute('data-destaque'), A200);
  ok('o cartão para de pulsar depois de alguns segundos');

  // Meu perfil: escolhas valem na hora
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('meu-perfil').waitFor();
  assert.equal(await p.getByTestId('perfil-usuario').innerText(), 'alan');
  for (const k of ['som', 'aviso', 'vibracao']) assert.equal(await p.getByTestId(`perfil-aviso-${k}`).isChecked(), true);
  await p.getByTestId('perfil-aviso-testar').click();
  assert.deepEqual(await lerContagem(p), { bipes: 6, vib: 2 }, 'testar toca o bipe e vibra');
  await p.getByTestId('perfil-aviso-som').uncheck();
  await p.getByTestId('perfil-fechar').click();
  ag(201, '2026-10-30T16:00:00', 30, KIKO, BRUNO, 'a_confirmar', 'Barba', { origem: 'link' });
  novoAviso(902, A201);
  await sinal(p);
  await p.getByTestId('faixa-aviso').waitFor();
  assert.deepEqual(await lerContagem(p), { bipes: 6, vib: 3 }, 'sem som: faixa e vibração sim, bipe não');
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('perfil-aviso-aviso').uncheck();
  await p.waitForFunction(() => !document.querySelector('[data-testid="faixa-aviso"]'));
  await p.getByTestId('perfil-aviso-vibracao').uncheck();
  assert.equal(await p.getByTestId('perfil-aviso-testar').isDisabled(), true, 'tudo desligado: nada para testar');
  await p.getByTestId('perfil-fechar').click();
  ag(202, '2026-10-30T17:00:00', 30, KIKO, BRUNO, 'a_confirmar', 'Barba', { origem: 'link' });
  novoAviso(903, A202);
  await sinal(p);
  await p.waitForFunction((i) => document.querySelector(`[data-id="${i}"]`)?.getAttribute('data-destaque') === 'sim', A202);
  await p.waitForTimeout(300);
  assert.equal(await p.getByTestId('faixa-aviso').count(), 0);
  assert.deepEqual(await lerContagem(p), { bipes: 6, vib: 3 }, 'tudo desligado: silêncio');
  ok('som, faixa e vibração se desligam um a um e valem na hora (o cartão ainda pulsa)');

  // as escolhas ficam no aparelho: recarrega e continuam desligadas
  await p.reload(); await entrar(p);
  await p.getByTestId('abrir-perfil').click();
  for (const k of ['som', 'aviso', 'vibracao']) assert.equal(await p.getByTestId(`perfil-aviso-${k}`).isChecked(), false, `${k} continua desligado`);
  assert.equal(await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('agendz-aviso:')).length), 1);
  ok('as escolhas ficam guardadas neste aparelho');

  // dados próprios (espera o perfil carregar: no CI lento a resposta chegava depois e apagava o que foi digitado)
  await p.waitForFunction(() => document.querySelector('[data-testid="perfil-apelido"]')?.value === 'Alan');
  await p.getByTestId('perfil-apelido').fill('Alan B');
  await p.getByTestId('perfil-email').fill('alan@exemplo.com');
  await p.getByTestId('perfil-telefone').fill('11999990001');
  await p.getByTestId('perfil-nascimento').fill('1990-05-01');
  await p.getByTestId('perfil-salvar').click();
  await p.getByTestId('perfil-msg').waitFor();
  const put = chamadas.filter((c) => c.m === 'PUT' && c.u === '/api/usuarios/me').at(-1);
  assert.deepEqual(put.corpo, { nome: 'Alan Dalforno', apelido: 'Alan B', email: 'alan@exemplo.com', telefone: '11999990001', nascimento: '1990-05-01' });
  assert.equal(await p.getByTestId('topo-nome').innerText(), 'Alan B');
  await p.getByTestId('perfil-apelido').fill('Kiko');
  await p.getByTestId('perfil-salvar').click();
  assert.match(await p.getByTestId('perfil-erro').innerText(), /Já existe alguém/);
  assert.equal(await p.getByTestId('topo-nome').innerText(), 'Alan B', 'erro do servidor não muda o nome no topo');
  ok('dados próprios salvos; erro do servidor aparece com a mensagem dele');

  // foto
  await p.getByTestId('perfil-foto-arquivo').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
  await p.getByTestId('perfil-foto-tirar').waitFor({ timeout: 3000 }).catch(async () => { console.log('DEBUG', await p.getByTestId('perfil-erro').innerText().catch(() => 'sem erro'), chamadas.filter((c) => c.u.includes('foto')).length); throw new Error('x'); });
  const foto = chamadas.filter((c) => c.u === '/api/usuarios/me/foto').at(-1).corpo.foto;
  assert.match(foto, /^data:image\/jpeg;base64,/); assert.ok(foto.length <= 30000);
  assert.equal(await p.locator('.usuario-perfil-real img.avatar-foto').count(), 1, 'a foto aparece no topo');
  await p.getByTestId('perfil-foto-arquivo').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
  assert.match(await p.getByTestId('perfil-erro').innerText(), /imagem/);
  await p.getByTestId('perfil-foto-tirar').click();
  await p.waitForFunction(() => !document.querySelector('.usuario-perfil-real img.avatar-foto'));
  ok('foto: reduzida, mostrada no topo, arquivo errado recusado, remover');

  // senha
  await p.getByTestId('perfil-senha-atual').fill('errada'); await p.getByTestId('perfil-senha-nova').fill('Nova-senha-123'); await p.getByTestId('perfil-senha-repetir').fill('Nova-senha-123');
  await p.getByTestId('perfil-senha-trocar').click();
  assert.match(await p.getByTestId('perfil-senha-erro').innerText(), /Senha atual incorreta/);
  await p.getByTestId('perfil-senha-atual').fill('Minha-senha'); await p.getByTestId('perfil-senha-repetir').fill('outra');
  await p.getByTestId('perfil-senha-trocar').click();
  assert.match(await p.getByTestId('perfil-senha-erro').innerText(), /não é igual/);
  await p.getByTestId('perfil-senha-repetir').fill('Nova-senha-123');
  await p.getByTestId('perfil-senha-trocar').click();
  await p.getByTestId('perfil-senha-msg').waitFor();
  assert.equal(await p.getByTestId('perfil-senha-atual').inputValue(), '', 'campos de senha limpos');
  ok('troca de senha: erro do servidor, confirmação diferente e sucesso');

  // Esc fecha
  await p.keyboard.press('Escape');
  await p.getByTestId('meu-perfil').waitFor({ state: 'detached' });
  await ctx.close();
}
{
  // profissional: também recebe (o servidor já entrega só os dele)
  papel = 'profissional'; avisosServidor = []; eu = { ...eu, papel: 'profissional', apelido: 'Kiko', foto: null };
  localStorageLimpo: {
    const { ctx, p } = await abrir();
    await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 1);
    novoAviso(910, A200);
    await sinal(p);
    await p.getByTestId('faixa-aviso').waitFor();
    assert.deepEqual(await lerContagem(p), { bipes: 3, vib: 1 });
    ok('profissional também recebe a faixa, os 3 bipes e a vibração');
    await ctx.close();
  }
  papel = 'dono';
}
{
  // 390 px, fonte larga: faixa e perfil sem rolagem lateral
  avisosServidor = [];
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  novoAviso(920, A200, { texto: 'Bruno Albuquerque de Oliveira Santos pediu horário para sexta-feira, 30/10 às 15:00.' });
  await sinal(p);
  await p.getByTestId('faixa-aviso').waitFor();
  await semRolagem(p, 'faixa 390');
  const caixa = await p.getByTestId('faixa-aviso').boundingBox();
  assert.ok(caixa.x >= 0 && caixa.x + caixa.width <= 390, 'a faixa cabe na tela');
  await p.getByTestId('faixa-aviso-fechar').click();
  await p.getByTestId('abrir-perfil').click();
  await p.getByTestId('meu-perfil').waitFor();
  await semRolagem(p, 'perfil 390');
  const c = await p.getByTestId('meu-perfil').boundingBox();
  assert.ok(c.x >= 0 && c.x + c.width <= 390, 'o perfil cabe na tela');
  await ctx.close();
  ok('390 px com fonte larga: faixa e perfil sem rolagem lateral');
}
await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e63 ok');
