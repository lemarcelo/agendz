/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F2 parte 5b: agenda no site real (dist/index-real.html) contra um servidor falso: Horários (dia + próximos por dia), seletor de profissional, status
// (confirmar, concluir, cancelar com confirmação na tela, reativar), remarcar com a mensagem do servidor, histórico, Calendário e 390 px com fonte larga.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const U = (s) => new Date(`${s}-03:00`).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), BRUNO = id(11), CAIO = id(12), DEBORA = id(13);
const banco = [];
const ag = (n, inicio, min, prof, cli, status, nome, extra = {}) => banco.push({ id: id(100 + n), clienteId: cli, profissionalId: prof, inicio: U(inicio), fim: new Date(new Date(U(inicio)).getTime() + min * 60000).toISOString(), fimOcupado: new Date(new Date(U(inicio)).getTime() + (min + 10) * 60000).toISOString(), status, encaixe: false, total: 45, servicos: [{ servicoId: id(50), nome, preco: 45, duracaoMin: min }], conflitosPendentes: [], origem: 'painel', reagendado: false, statusManual: false, historico: [], ...extra });
ag(1, '2026-10-28T09:00:00', 45, ALAN, BRUNO, 'confirmado', 'Corte');
ag(2, '2026-10-28T11:00:00', 30, KIKO, CAIO, 'a_confirmar', 'Barba');
ag(3, '2026-10-28T15:00:00', 30, ALAN, BRUNO, 'cancelado', 'Corte', { motivoCancelamento: 'cliente' });
ag(4, '2026-10-29T10:00:00', 45, ALAN, CAIO, 'confirmado', 'Corte');
ag(5, '2026-10-31T14:00:00', 30, KIKO, BRUNO, 'a_confirmar', 'Barba', { origem: 'link' });
ag(6, '2026-11-03T09:00:00', 45, ALAN, CAIO, 'confirmado', 'Corte');
ag(7, '2026-11-10T09:00:00', 45, ALAN, CAIO, 'confirmado', 'Corte'); // fora dos 7 dias: só aparece com "Ver mais"
const chamadas = [];
const pedidosWa = [];
let papel = 'dono';
let comMapa = false; // só o teste do aviso em 390 px liga o link do mapa
let ocupadoEm = null; // remarcar para este horário responde 409
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: corpo ? JSON.parse(corpo) : null });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: ALAN, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/clientes') return json(200, [{ id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '11999990001' }, { id: CAIO, nome: 'Caio Souza', apelido: '', telefone: '11999990002' }, { id: DEBORA, nome: 'Débora Reis', apelido: '', telefone: '' }]);
    if (u.pathname === '/api/estabelecimento/local' && comMapa) return json(200, { enderecoNoLink: false, localizacaoNoWhatsapp: true, enderecoTexto: 'Rua das Flores, 100', localizacaoUrl: '', localizacaoWhatsappUrl: 'https://maps.example.com/' + 'a'.repeat(150) });
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]);
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) > de && (papel !== 'profissional' || a.profissionalId === ALAN)));
    }
    const m = /^\/api\/agendamentos\/([^/]+)(\/status|\/remarcar)?$/.exec(u.pathname);
    if (m) {
      const a = banco.find((x) => x.id === m[1]);
      if (!a) return json(404, { mensagem: 'Agendamento não encontrado.' });
      if (!m[2]) return json(200, { ...a, historico: [{ em: new Date().toISOString(), autor: 'Alan', campo: 'criação', para: 'Corte' }] });
      const c = JSON.parse(corpo);
      if (m[2] === '/status') { a.status = c.status; return json(200, a); }
      if (c.inicio === ocupadoEm) return json(409, { mensagem: 'Esse horário já está ocupado por um agendamento confirmado.' });
      a.inicio = c.inicio; a.fim = new Date(Date.parse(c.inicio) + 45 * 60000).toISOString(); a.fimOcupado = new Date(Date.parse(c.inicio) + 55 * 60000).toISOString(); a.reagendado = true;
      return json(200, a);
    }
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
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => { pedidosWa.push(r.request().url()); return r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }); });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  return { ctx, p };
}
const ultimo = (m, rota) => chamadas.filter((c) => c.m === m && c.u.endsWith(rota)).at(-1);
const textoDe = (p, t) => p.getByTestId(t).innerText();

// 1. Horários: cartões do dia (inclusive o cancelado) e próximos agendamentos por dia, sem cancelados
{
  const { ctx, p } = await abrir();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length === 2);
  assert.match(await textoDe(p, 'agenda-titulo'), /quarta, 28 de outubro/i);
  assert.equal(await p.locator('[data-testid="cartao-proximo"]').count(), 3, 'próximos: 29/10, 31/10 e 03/11; o de 10/11 só com "Ver mais"');
  assert.equal(await p.locator('[data-testid="proximo-dia"]').count(), 3);
  assert.match(await textoDe(p, 'agenda-proximos'), /Amanhã/);
  const primeiro = p.locator('[data-testid="cartao"]').first();
  assert.match(await primeiro.innerText(), /09:00/); assert.match(await primeiro.innerText(), /Bruno/); assert.match(await primeiro.innerText(), /Corte/);
  assert.match(await p.locator('[data-testid="cartao"]').nth(1).innerText(), /Caio Souza/, 'sem apelido: o nome');
  assert.equal(await p.locator('[data-testid="cartao"][data-status="cancelado"]').count(), 0, 'cancelado sai da lista do dia');
  assert.equal((await textoDe(p, 'cancelados-resumo')).trim(), 'Cancelado (1)', 'e vira uma linha no fim');
  await p.getByTestId('cancelados-resumo').click();
  assert.equal(await p.locator('[data-testid="cartao"][data-status="cancelado"]').count(), 1, 'ao tocar na linha, abre o cartão');
  await p.getByTestId('cancelados-resumo').click();
  assert.match(await p.locator('[data-testid="cartao-proximo"]').nth(1).innerText(), /Cliente agendou/, 'pedido pelo link');
  const lis = ultimo('GET', '/api/agendamentos');
  assert.match(lis.q, /de=2026-10-28T03%3A00%3A00\.000Z/); // meia-noite de Brasília
  ok('Horários: dia com 2 cartões + linha de cancelados, próximos por dia sem cancelados, cliente por apelido ou nome, "Cliente agendou" pelo link');

  // 2. seletor de profissional (dono vê todos; escolher um mostra só a agenda dele)
  await p.getByTestId('seletor-profissionais').waitFor();
  await p.getByTestId(`sel-${KIKO}`).click();
  assert.equal(await p.locator('[data-testid="cartao"]').count(), 1);
  assert.match(await p.locator('[data-testid="cartao"]').first().innerText(), /Caio Souza/);
  await p.getByTestId('sel-todos').click();
  assert.equal(await p.locator('[data-testid="cartao"]').count(), 2);
  ok('seletor: um profissional por vez e Todos');

  // 3. confirmar: PUT status; aviso; lista recarregada
  await p.locator('[data-testid="cartao-abrir"]').nth(1).click();
  await p.getByTestId('acao-confirmar').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.deepEqual(ultimo('PUT', '/status').corpo, { status: 'confirmado' });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"][data-status="confirmado"]').length === 2);
  assert.match(await textoDe(p, 'agenda-aviso'), /confirmado/);
  ok('confirmar muda o status e recarrega');

  // 4. cancelar com confirmação na tela: "Voltar" não envia; "Sim" envia
  const antes = chamadas.filter((c) => c.u.endsWith('/status')).length;
  await p.locator('[data-testid="cartao-abrir"]').first().click();
  await p.getByTestId('acao-cancelar').click();
  await p.getByTestId('cancelar-confirmacao').waitFor();
  await p.getByTestId('cancelar-nao').click();
  assert.equal(chamadas.filter((c) => c.u.endsWith('/status')).length, antes, 'voltar não cancela');
  await p.getByTestId('acao-cancelar').click(); await p.getByTestId('cancelar-sim').click();
  await p.waitForFunction(() => document.querySelector('[data-testid="cancelados-resumo"]')?.textContent.trim() === 'Cancelados (2)');
  assert.deepEqual(ultimo('PUT', '/status').corpo, { status: 'cancelado' });
  await p.getByTestId('cancelados-resumo').click();
  ok('cancelar pede confirmação na própria tela (nada de diálogo do navegador)');

  // 5. reativar o cancelado
  await p.locator('[data-testid="cartao"][data-status="cancelado"]').last().locator('[data-testid="cartao-abrir"]').click();
  await p.getByTestId('acao-reativar').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"][data-status="cancelado"]').length === 1);
  assert.deepEqual(ultimo('PUT', '/status').corpo, { status: 'a_confirmar' });
  ok('reativar volta a "a confirmar"');

  // 6. remarcar: erro do servidor aparece; depois certo; histórico
  ocupadoEm = U('2026-10-29T16:00:00');
  await p.locator('[data-testid="cartao-proximo-abrir"]').first().click();
  await p.getByTestId('acao-remarcar').click();
  await p.getByTestId('remarcar-quando').fill('2026-10-29T16:00');
  await p.getByTestId('remarcar-salvar').click();
  await p.getByTestId('agendamento-erro').waitFor();
  assert.match(await textoDe(p, 'agendamento-erro'), /já está ocupado/);
  assert.equal(ultimo('PUT', '/remarcar').corpo.inicio, ocupadoEm, 'envia o instante em UTC');
  await p.getByTestId('remarcar-quando').fill('2026-10-29T17:00');
  await p.getByTestId('remarcar-salvar').click();
  await p.getByTestId('agenda-aviso').waitFor();
  await p.waitForFunction(() => /remarcado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  assert.equal(ultimo('PUT', '/remarcar').corpo.inicio, U('2026-10-29T17:00:00'));
  await p.waitForFunction(() => /17:00/.test(document.querySelector('[data-testid="cartao-proximo"]')?.textContent || ''));
  ok('remarcar: mensagem do servidor na tela, depois certo; horário novo na lista');
  // 6b. horário mudou e o cliente tem telefone: a tela pergunta se avisa pelo WhatsApp; "Avisar" abre o wa.me com a mensagem pronta
  await p.getByTestId('avisar-whats-pergunta').waitFor();
  assert.match(await textoDe(p, 'avisar-whats-texto'), /reagendar/i);
  await p.getByTestId('avisar-whats-sim').click();
  await p.waitForFunction(() => !document.querySelector('[data-testid="avisar-whats"]'));
  await p.waitForTimeout(300);
  assert.equal(pedidosWa.length, 1, 'abriu o WhatsApp uma vez');
  assert.match(pedidosWa[0], /^https:\/\/wa\.me\/5511999990\d{3}\?text=/, 'wa.me com o telefone do cliente: ' + pedidosWa[0]);
  ok('remarcar: pergunta se avisa o cliente e abre o WhatsApp com a mensagem');

  // 7. ver mais 7 dias
  await p.getByTestId('proximos-mais').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao-proximo"]').length === 4);
  ok('ver mais 7 dias traz o agendamento de 10/11');

  // 8. calendário: contagem sem cancelados; clicar no dia abre o dia
  await p.getByTestId('aba-calendario').click();
  await p.getByTestId('calendario').waitFor();
  await p.waitForFunction(() => document.querySelector('[data-testid="mes-cont-2026-10-28"]'));
  assert.equal(await textoDe(p, 'mes-cont-2026-10-28'), '2');
  assert.match(await textoDe(p, 'agenda-titulo'), /outubro de 2026/i);
  await p.getByTestId('mes-dia-2026-10-31').click();
  await p.getByTestId('agenda-dia').waitFor();
  assert.match(await textoDe(p, 'agenda-titulo'), /31 de outubro/);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length === 1);
  ok('calendário: contagem por dia e clique abre o dia');
  await ctx.close();
}

// 8b. aviso depois de remarcar em TODAS as situações (o bug: o aviso sumia quando o cartão saía da lista, e cliente sem telefone não era avisado)
{
  const antes = banco.length;
  ag(20, '2026-10-28T16:00:00', 30, ALAN, CAIO, 'confirmado', 'Corte');   // com telefone
  ag(21, '2026-10-28T17:00:00', 30, ALAN, DEBORA, 'confirmado', 'Corte'); // cadastro sem telefone
  ag(22, '2026-10-28T18:00:00', 30, ALAN, null, 'confirmado', 'Corte', { nomeAvulso: 'Passante' }); // sem cadastro
  const remarcarDe = async (p, horaCartao, destino) => {
    await p.locator('[data-testid="cartao"]', { hasText: horaCartao }).first().locator('[data-testid="cartao-abrir"]').click();
    await p.getByTestId('acao-remarcar').click();
    await p.getByTestId('remarcar-quando').fill(destino);
    await p.getByTestId('remarcar-salvar').click();
  };
  const semAviso = async (p) => assert.equal(await p.locator('[data-testid="avisar-whats"], [data-testid="avisar-sem-telefone-bloco"]').count(), 0, 'nenhum aviso aberto');
  // a) com telefone, para OUTRO dia: o cartão sai da lista do dia e o aviso continua na tela
  {
    const { ctx, p } = await abrir();
    await remarcarDe(p, '16:00', '2026-11-20T10:00');
    await p.getByTestId('avisar-whats-pergunta').waitFor();
    await p.waitForFunction(() => !/16:00/.test(document.querySelector('[data-testid="agenda-dia"]')?.textContent || ''));
    assert.equal(await p.getByTestId('avisar-whats-pergunta').count(), 1, 'o aviso sobrevive à saída do cartão da lista');
    await p.getByTestId('avisar-whats-nao').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid="avisar-whats"]'));
    await semAviso(p);
    ok('remarcar para outro dia (cartão sai da lista): o aviso de WhatsApp continua na tela');
    // b) cliente sem telefone: avisa "sem telefone"
    await remarcarDe(p, '17:00', '2026-10-28T19:00');
    await p.getByTestId('avisar-sem-telefone').waitFor();
    assert.match(await textoDe(p, 'avisar-sem-telefone'), /sem telefone|não há telefone/i);
    assert.equal(await p.getByTestId('avisar-whats-pergunta').count(), 0, 'não oferece WhatsApp sem telefone');
    await p.getByTestId('avisar-sem-telefone-ok').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid="avisar-sem-telefone"]'));
    ok('remarcar cliente sem telefone: avisa que não há telefone');
    await ctx.close();
    // c) cliente sem telefone e para outro dia (abaixo)
  }
  {
    ag(23, '2026-10-28T20:00:00', 30, ALAN, DEBORA, 'confirmado', 'Corte');
    const { ctx, p } = await abrir();
    await remarcarDe(p, '20:00', '2026-11-21T10:00');
    await p.getByTestId('avisar-sem-telefone').waitFor();
    ok('remarcar sem telefone para outro dia: o aviso também aparece');
    await ctx.close();
  }
  // d) atendimento sem cadastro
  {
    const { ctx, p } = await abrir();
    await remarcarDe(p, '18:00', '2026-10-28T19:30');
    await p.getByTestId('avisar-sem-telefone').waitFor();
    assert.match(await textoDe(p, 'avisar-sem-telefone'), /sem cadastro/i);
    ok('remarcar atendimento sem cadastro: avisa que não há como avisar o cliente');
    await ctx.close();
  }
  banco.splice(antes);
}

// 9. profissional: sem seletor; o servidor só devolve a agenda dele
{
  papel = 'profissional';
  const { ctx, p } = await abrir();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length === 1);
  assert.equal(await p.getByTestId('seletor-profissionais').count(), 0);
  assert.equal((await p.getByTestId('agenda-link').innerText()).trim(), 'Link Agenda', 'computador: o botão diz "Link Agenda", não só "Link"');
  const abaP = ctx.waitForEvent('page', { timeout: 6000 });
  await p.getByTestId('agenda-link').click();
  const pop = await abaP; assert.ok(pop.url().startsWith('https://wa.me/?text='), pop.url());
  assert.match(decodeURIComponent(pop.url().split('text=')[1]), /#agendar-[\w-]+$/, 'o link do profissional leva o id dele'); await pop.close();
  ok('profissional: sem seletor e só a própria agenda; o botão Link leva o link da agenda dele');
  await ctx.close();
  papel = 'dono';
}

// 10. celular (390 px) com fonte larga: sem rolagem lateral em Horários (com detalhe aberto) e no Calendário
{
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length === 2);
  const semRolagem = async (n) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${n}: rolagem horizontal`);
  await semRolagem('horários');
  assert.equal((await p.getByTestId('agenda-link').innerText()).trim(), 'Link Agenda', 'celular: o botão diz "Link Agenda"');
  const bl = await p.getByTestId('agenda-link').boundingBox(); const bat = await p.getByTestId('atender-abrir').boundingBox();
  assert.ok(bl.x >= 0 && bl.x + bl.width <= 390 && bat.x + bat.width <= 390, 'Link e Atender dentro da tela');
  assert.ok(bl.x + bl.width <= bat.x + 0.5 || bl.y + bl.height <= bat.y + 0.5, 'Link e Atender não se sobrepõem');
  const abaD = ctx.waitForEvent('page', { timeout: 6000 }); await p.getByTestId('agenda-link').tap();
  const popD = await abaD; assert.match(decodeURIComponent(popD.url().split('text=')[1]), /Agende seu horário.*#agendar$/); await popD.close();
  await p.locator('[data-testid="cartao"][data-status="confirmado"]').first().locator('[data-testid="cartao-abrir"]').click(); await p.getByTestId('acao-remarcar').click(); await semRolagem('remarcar');
  await p.getByTestId('aba-calendario').click(); await p.getByTestId('calendario').waitFor(); await semRolagem('calendário');
  ok('390 px com fonte larga: sem rolagem lateral');
  await ctx.close();
}

// 10b. celular: o aviso de remarcar tem o link do mapa (sem espaços, 170 caracteres): o botão "Avisar" tem que ficar dentro da tela (bug: o modal chegava a 1000 px)
{
  comMapa = true;
  const fotoDoBanco = JSON.stringify(banco); // o teste remarca um horário: devolve o banco ao que era para não mexer nos testes seguintes
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 1);
  await p.locator('[data-testid="cartao"][data-status="confirmado"]').first().locator('[data-testid="cartao-abrir"]').click();
  await p.getByTestId('acao-remarcar').click();
  await p.getByTestId('remarcar-quando').fill('2026-10-28T18:30');
  await p.getByTestId('remarcar-salvar').click();
  await p.getByTestId('avisar-whats-sim').waitFor();
  assert.match(await textoDe(p, 'avisar-whats-texto'), /Como chegar: https:\/\/maps\.example\.com\//, 'a mensagem leva o link do mapa');
  const bs = await p.getByTestId('avisar-whats-sim').boundingBox();
  assert.ok(bs && bs.x >= 0 && bs.x + bs.width <= 390 && bs.y + bs.height <= 780, 'o botão Avisar está dentro da tela: ' + JSON.stringify(bs));
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sem rolagem horizontal com o aviso aberto');
  ok('390 px: aviso de remarcar com link longo cabe na tela');
  comMapa = false;
  banco.splice(0, banco.length, ...JSON.parse(fotoDoBanco));
  await ctx.close();
}

// 5. computador: cartões do dia em grade de colunas iguais (não ocupam a linha inteira), mesma altura na linha, cartão do dia com a data; 390 px uma coluna
for (const [w, h] of [[1366, 820], [1920, 1000], [390, 800]]) {
  const { ctx, p } = await abrir({ width: w, height: h });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length === 2);
  const m = await p.evaluate(() => ({ lista: [...document.querySelectorAll('[data-testid="cartao"]')].map((e) => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), data: e.querySelector('[data-testid="cartao-data"]')?.textContent || '' }; }), largo: document.documentElement.scrollWidth > window.innerWidth + 1 }));
  assert.ok(!m.largo, `${w}: rolagem lateral`);
  assert.equal(new Set(m.lista.map((c) => c.w)).size, 1, `${w}: mesma largura ${JSON.stringify(m.lista)}`);
  assert.equal(new Set(m.lista.map((c) => c.h)).size, 1, `${w}: mesma altura ${JSON.stringify(m.lista)}`);
  for (const c of m.lista) assert.match(c.data, /^[a-zç]{3} \d\d\/\d\d$/i, `${w}: o cartão do dia mostra a data, não "Hoje"`);
  const linhas = new Set(m.lista.map((c) => c.y)).size;
  if (w >= 1000) { assert.equal(linhas, 1, `${w}: os cartões cabem numa linha`); assert.ok(m.lista[0].w < w * 0.5, `${w}: cartão não ocupa a linha inteira (${m.lista[0].w})`); }
  else assert.equal(linhas, 2, `${w}: no celular uma coluna`);
  ok(`${w} px: cartões do dia em grade igual (${m.lista[0].w} px, ${linhas} linha(s))`);
  await ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e46 ok');
