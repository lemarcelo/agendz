/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Avaliações no site real (F5 fase 2): estrela no atendimento concluído (Preparar → Abrir no WhatsApp, link com token no fragmento), motivos de "não dá para pedir",
// menu Avaliações (resumo, filtros, ocultar/reexibir com motivo), página do cliente (#avaliar/<token>) e profissional sem a seção vendo só as dele.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const U = (s) => new Date(`${s}-03:00`).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), BRUNO = id(11);
const TOKEN = 'ab'.repeat(24);
const banco = [];
const ag = (n, inicio, prof, status) => banco.push({ id: id(100 + n), clienteId: BRUNO, profissionalId: prof, inicio: U(inicio), fim: U(inicio.replace(':00:00', ':45:00')), fimOcupado: U(inicio.replace(':00:00', ':55:00')), status, encaixe: false, total: 45, servicos: [{ servicoId: id(50), nome: 'Corte', preco: 45, duracaoMin: 45 }], conflitosPendentes: [], origem: 'painel', reagendado: false, statusManual: false, historico: [] });
ag(1, '2026-10-28T08:00:00', ALAN, 'concluido'); // pode pedir
ag(2, '2026-10-28T09:00:00', KIKO, 'concluido'); // sem telefone
ag(3, '2026-10-28T11:00:00', ALAN, 'confirmado');
const SITUACAO = {
  [id(101)]: { motivo: 'ok', aviso: '', jaAvaliou: false, pedidaEm: null },
  [id(102)]: { motivo: 'sem_telefone', aviso: 'Este cliente não tem telefone cadastrado.', jaAvaliou: false, pedidaEm: null },
};
const avs = [
  { id: id(301), em: U('2026-10-27T12:00:00'), nota: 5, texto: 'Ótimo atendimento!', servicos: ['Corte'], profissionalId: ALAN, profissional: 'Alan', anonimo: false, oculta: false, motivoOculta: '', cliente: 'Bruno Lima', revelado: false },
  { id: id(302), em: U('2026-10-26T12:00:00'), nota: 3, texto: 'Demorou um pouco.', servicos: ['Corte'], profissionalId: KIKO, profissional: 'Kiko', anonimo: true, oculta: false, motivoOculta: '', cliente: '', revelado: false },
];
const chamadas = [];
let papel = 'dono', secoes = ['agenda', 'clientes', 'avaliacoes'], enviada = null;
const resumoDe = (l) => { const v = l.filter((x) => !x.oculta); const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; v.forEach((x) => { d[x.nota]++; }); return { total: v.length, media: v.length ? Math.round(v.reduce((s, x) => s + x.nota, 0) / v.length * 10) / 10 : null, distribuicao: d }; };
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: corpo ? JSON.parse(corpo) : null, acesso: req.headers['x-acesso'] || null });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: papel === 'profissional' ? KIKO : ALAN, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes });
    if (u.pathname === '/api/clientes') return json(200, [{ id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '11999990001' }]);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]);
    if (u.pathname === '/api/servicos') return json(200, [{ id: id(50), nome: 'Corte', preco: 45, duracaoMin: 45, ativo: true, combo: false }]);
    if (u.pathname === '/api/avisos') return json(200, []);
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') return json(200, banco);
    let m = /^\/api\/agendamentos\/([^/]+)\/avaliacao$/.exec(u.pathname);
    if (m) return json(200, SITUACAO[m[1]] || { motivo: 'nao_concluido', aviso: '', jaAvaliou: false });
    m = /^\/api\/agendamentos\/([^/]+)\/avaliacao\/pedido$/.exec(u.pathname);
    if (m) return json(200, { token: TOKEN, numero: '5511999990001', nome: 'Bruno', loja: 'Dalforno' });
    if (u.pathname === '/api/avaliacoes') {
      let l = avs.filter((x) => papel === 'dono' || !x.oculta);
      if (papel === 'profissional' && !secoes.includes('avaliacoes')) l = l.filter((x) => x.profissionalId === KIKO);
      const prof = u.searchParams.get('profissionalId'); if (prof) l = l.filter((x) => x.profissionalId === prof);
      return json(200, { avaliacoes: l, mostraAnonimo: false, soMinhas: papel === 'profissional' && !secoes.includes('avaliacoes') });
    }
    if (u.pathname === '/api/avaliacoes/resumo') {
      let l = avs.filter((x) => !x.oculta);
      if (papel === 'profissional' && !secoes.includes('avaliacoes')) l = l.filter((x) => x.profissionalId === KIKO);
      return json(200, resumoDe(l));
    }
    m = /^\/api\/avaliacoes\/([^/]+)\/(ocultar|reexibir)$/.exec(u.pathname);
    if (m) {
      const c = JSON.parse(corpo);
      if (!c.motivo || c.motivo.length < 3) return json(400, { mensagem: 'Informe o motivo.' });
      avs.find((x) => x.id === m[1]).oculta = m[2] === 'ocultar';
      return json(200, {});
    }
    if (u.pathname === '/api/publico/avaliacoes' && req.method === 'GET') return req.headers['x-acesso'] === TOKEN ? json(200, { loja: 'Dalforno', servicos: ['Corte'], profissional: 'Alan', quando: U('2026-10-28T08:00:00') }) : json(404, {});
    if (u.pathname === '/api/publico/avaliacoes' && req.method === 'POST') { enviada = JSON.parse(corpo); return json(200, { ok: true }); }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
const textoDe = (p, t) => p.getByTestId(t).innerText();
async function abrir(viewport = { width: 1280, height: 860 }, hash = '') {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com|api\.whatsapp\.com)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url + hash);
  return { ctx, p };
}
async function entrar(p) {
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
}

// 1) Agenda: estrela só no concluído; Preparar → Abrir no WhatsApp com o link no fragmento
{
  const { ctx, p } = await abrir();
  await entrar(p);
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  const c1 = p.locator(`[data-testid="cartao"][data-id="${id(101)}"]`);
  const c3 = p.locator(`[data-testid="cartao"][data-id="${id(103)}"]`);
  assert.equal(await c1.getByTestId('cartao-avaliar').count(), 1, 'concluído tem a estrela');
  assert.equal(await c3.getByTestId('cartao-avaliar').count(), 0, 'confirmado não tem');
  // a estrela fica no canto do cartão, não do bloco inteiro
  const caixa = async () => { const q = await c1.getByTestId('cartao-avaliar').boundingBox(), c = await c1.boundingBox(); return { q, c }; };
  const g = await caixa();
  assert.ok(g.q.y + g.q.height <= g.c.y + g.c.height + 1 && g.q.x + g.q.width <= g.c.x + g.c.width + 1, 'estrela dentro do cartão');
  await c1.getByTestId('cartao-avaliar').click();
  await p.getByTestId('pedir-av-real').waitFor();
  await p.getByTestId('pedir-av-preparar').click();
  await p.getByTestId('pedir-av-abrir').waitFor();
  const g2 = await caixa();
  assert.ok(Math.abs(g2.q.y - g.q.y) < 2, 'com o painel aberto a estrela continua no canto do cartão');
  const texto = await textoDe(p, 'pedir-av-texto');
  assert.match(texto, /Bruno/); assert.match(texto, /Dalforno/); assert.match(texto, new RegExp(`#avaliar.*${TOKEN}`));
  assert.ok(!texto.includes('?' + TOKEN), 'token nunca na consulta da URL');
  const pedido = chamadas.filter((c) => c.u.endsWith('/avaliacao/pedido'));
  assert.equal(pedido.length, 1);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), p.getByTestId('pedir-av-abrir').click()]);
  assert.match(pop.url(), /wa\.me\/5511999990001/);
  ok('estrela só no concluído; Preparar → Abrir no WhatsApp com o link pessoal no fragmento');
  // sem telefone: o motivo aparece e não há botão de preparar
  await p.getByTestId('pedir-av-fechar').click();
  const c2 = p.locator(`[data-testid="cartao"][data-id="${id(102)}"]`);
  await c2.getByTestId('cartao-avaliar').click();
  await p.getByTestId('pedir-av-sem-sem_telefone').waitFor();
  assert.equal(await p.getByTestId('pedir-av-preparar').count(), 0);
  assert.equal(chamadas.filter((c) => c.u.endsWith('/avaliacao/pedido')).length, 1, 'não chamou o servidor para pedir');
  ok('sem telefone: diz o motivo, nunca silêncio');
  await ctx.close();
}

// 1b) v134: a estrela do cartão mostra a nota (número dentro da estrela, na cor da nota) e, ao tocar, o comentário; só quando o servidor traz o agendamento da avaliação
{
  avs[0].agendamentoId = id(101); // nota 5, "Ótimo atendimento!" (o servidor omite o agendamento de avaliação anônima sem a regra do Admin: o cartão fica só com a estrela)
  const { ctx, p } = await abrir();
  await entrar(p);
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  const c1 = p.locator(`[data-testid="cartao"][data-id="${id(101)}"]`);
  const c2 = p.locator(`[data-testid="cartao"][data-id="${id(102)}"]`);
  await c1.getByTestId('cartao-avaliar-nota').waitFor();
  assert.equal((await c1.getByTestId('cartao-avaliar-nota').innerText()).trim(), '5');
  assert.equal(await c2.getByTestId('cartao-avaliar-nota').count(), 0, 'sem avaliação visível: estrela comum');
  await c1.getByTestId('cartao-avaliar').click();
  await p.getByTestId('nota-av-real').waitFor();
  assert.equal(await p.getByTestId('avaliacao-estrelas').getAttribute('data-nota'), '5');
  assert.equal(await p.getByTestId('avaliacao-comentario').innerText(), 'Ótimo atendimento!');
  assert.equal(await p.getByTestId('pedir-av-preparar').count(), 0, 'avaliado: não oferece pedir de novo');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'sem rolagem lateral');
  await p.getByTestId('nota-av-fechar').click();
  await p.getByTestId('nota-av-real').waitFor({ state: 'detached' });
  delete avs[0].agendamentoId;
  ok('estrela do cartão: nota dentro da estrela, comentário ao tocar, sem pedir de novo');
  await ctx.close();
}

// 2) Menu Avaliações: resumo, filtro por profissional, ocultar/reexibir com motivo
{
  const { ctx, p } = await abrir();
  await entrar(p);
  await p.getByTestId('nav-avaliacoes').click();
  await p.getByTestId('av-lista').waitFor();
  assert.equal(await p.getByTestId('av-item').count(), 2);
  assert.equal(await textoDe(p, 'av-media'), '4');
  assert.equal(await textoDe(p, 'av-total'), '2 avaliações');
  const anon = p.getByTestId('av-item').nth(1);
  assert.equal(await anon.getByTestId('av-cliente').innerText(), 'Anônimo', 'anônimo sem nome');
  await p.getByTestId('av-filtro-prof').selectOption(ALAN);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="av-item"]').length === 1);
  await p.getByTestId('av-limpar').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="av-item"]').length === 2);
  // ocultar exige motivo, na própria tela
  await p.getByTestId(`av-ocultar-${id(302)}`).click();
  await p.getByTestId('av-motivo-ok').click();
  await p.getByTestId('av-motivo-erro').waitFor();
  await p.getByTestId('av-motivo').fill('Ofensiva e fora do assunto.');
  await p.getByTestId('av-motivo-ok').click();
  await p.getByTestId('av-aviso').waitFor();
  await p.waitForFunction(() => document.querySelector('[data-testid="av-total"]')?.textContent === '1 avaliação');
  assert.equal(await p.getByTestId('av-oculta').count(), 1);
  assert.deepEqual(chamadas.filter((c) => c.u.endsWith('/ocultar')).at(-1).corpo, { motivo: 'Ofensiva e fora do assunto.' });
  await p.getByTestId(`av-reexibir-${id(302)}`).click();
  await p.getByTestId('av-motivo').fill('Foi engano.');
  await p.getByTestId('av-motivo-ok').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="av-total"]')?.textContent === '2 avaliações');
  ok('resumo, filtro, ocultar e reexibir com motivo (nada apagado)');
  await ctx.close();
}

// 3) Profissional sem a seção: só as dele, sem ocultar nem lote
{
  papel = 'profissional'; secoes = ['agenda', 'clientes'];
  const { ctx, p } = await abrir();
  await entrar(p);
  await p.getByTestId('nav-avaliacoes').click();
  await p.getByTestId('av-lista').waitFor();
  assert.equal(await p.getByTestId('av-item').count(), 1);
  assert.match(await p.locator('h1').innerText(), /Minhas avaliações/);
  assert.equal(await p.locator('[data-testid^="av-ocultar-"]').count(), 0);
  assert.equal(await p.getByTestId('av-aba-lote').count(), 0);
  assert.equal(await p.getByTestId('av-filtro-prof').count(), 0);
  ok('profissional sem a seção: só as próprias, sem ocultar nem lote');
  await ctx.close();
  papel = 'dono'; secoes = ['agenda', 'clientes', 'avaliacoes'];
}

// 4) Página do cliente: token do fragmento vai no cabeçalho, nunca na URL; envia a nota
{
  const { ctx, p } = await abrir({ width: 390, height: 800 }, `#avaliar@dalforno/${TOKEN}`);
  await p.getByTestId('av-formulario').waitFor();
  const carga = chamadas.filter((c) => c.u === '/api/publico/avaliacoes' && c.m === 'GET').at(-1);
  assert.equal(carga.acesso, TOKEN); assert.ok(!carga.q.includes(TOKEN));
  await p.getByRole('radio', { name: '4 estrelas' }).click();
  await p.getByTestId('av-texto').fill('Gostei muito.');
  await p.getByTestId('av-enviar').click();
  await p.getByTestId('av-obrigado').waitFor();
  assert.equal(enviada.nota, 4); assert.equal(enviada.texto, 'Gostei muito.'); assert.equal(enviada.site, '');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, '390 px sem rolagem lateral');
  ok('página do cliente: token só no cabeçalho, nota enviada');
  await ctx.close();
}


assert.deepEqual(erros, [], erros.join('\n'));
await b.close(); servidor.close();
console.log('e2e100 ok');
