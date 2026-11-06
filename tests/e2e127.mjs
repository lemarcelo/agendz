/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco B3 no SITE REAL contra um servidor falso: link com profissional pré-escolhido por token assinado.
// (1) Agenda > Link Agenda do profissional monta `#agendar-<token>` (token buscado ao montar a tela; falhou = link com o id, como antes).
// (2) #agendar-<token>: o servidor confere; válido pré-seleciona quem gerou e mostra TODOS os serviços; serviço que ele não faz tira a pré-seleção, avisa e "Com quem?" lista só quem faz.
// (3) token inválido/vencido/de outra loja é ignorado, sem aviso nem erro; id cru de link antigo continua valendo e nem consulta o servidor.
// 1366 e 390 px (fonte larga), sem rolagem lateral. E2E_CAPTURAS=pasta grava as imagens.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const pasta = process.env.E2E_CAPTURAS || '';
if (pasta) mkdirSync(pasta, { recursive: true });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const KIKO = id(2), BRUNO = id(3), CORTE = id(50), BARBA = id(51), SOBR = id(52);
const TOK = 'a1'.repeat(20) + 'AbCdEfGhIjKlMnOpQrStUv'; // formato do token (62)
const TOK_RUIM = 'a1'.repeat(20) + 'ZzCdEfGhIjKlMnOpQrStUv'; // adulterado: o servidor falso não o reconhece
const servicos = [{ id: CORTE, nome: 'Corte', duracao: 40, preco: 50, antecedenciaH: 0 }, { id: BARBA, nome: 'Barba', duracao: 30, preco: 35, antecedenciaH: 0 }, { id: SOBR, nome: 'Sobrancelha', duracao: 15, preco: 20, antecedenciaH: 0 }];
const vinc = { [KIKO]: [CORTE, SOBR], [BRUNO]: [BARBA, SOBR] };
let confere = []; // tokens consultados em /api/publico/link-profissional
let meuLinkOk = true;

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    if (p === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Barbearia Dalforno', tipo: 'barbearia' });
    if (p === '/api/publico/agendar') return json(200, { ativo: true, diasMax: 30, exigeTelefone: true, exigeNome: true, tipo: 'barbearia', servicos, profissionais: [{ id: KIKO, nome: 'Kiko', servicoIds: vinc[KIKO] }, { id: BRUNO, nome: 'Bruno', servicoIds: vinc[BRUNO] }], profissionalAutomatico: false, selo: '1.' + 'a'.repeat(32) });
    if (p === '/api/publico/link-profissional' && req.method === 'POST') { const d = JSON.parse(corpo); confere.push(d.token); return json(200, { profissionalId: d.token === TOK ? KIKO : null }); }
    if (p === '/api/publico/dias' || p === '/api/publico/horarios') return json(200, []);
    // painel (profissional Kiko)
    if (p === '/api/auth/login') return json(200, { token: 'tok', id: KIKO, nome: 'Kiko Gindri', papel: 'profissional', secoes: ['agenda'] });
    if (p === '/api/agenda/meu-link') return meuLinkOk ? json(200, { token: TOK }) : json(404, {});
    if (p === '/api/profissionais') return json(200, [{ id: KIKO, nome: 'Kiko Gindri', papel: 'profissional', atende: true, podeVender: true }]);
    if (p === '/api/ausencias') return json(200, []);
    if (p === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
    if (p === '/api/agendamentos') return json(200, []);
    if (p === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [], ordemServicos: 'uso' });
    if (p === '/api/estabelecimento/link-agendamento') return json(200, { ativo: true, diasMax: 30, limiteAbertos: 3, intervaloMin: 0, telefoneObrigatorio: true, nomeObrigatorio: true, veiculoObrigatorio: [], pendencias: [], barrados: [] });
    if (p === '/api/estabelecimento/local') return json(200, {});
    if (p === '/api/estabelecimento/comissao') return json(200, { comissaoPadrao: 50 });
    if (p === '/api/onboarding') return json(200, { tipo: 'barbearia', passo: 'servicos', concluido: true, servicos: [], jaCadastrados: [], expedienteSugerido: {} });
    if (p === '/api/avisos') return json(200, []);
    if (p === '/api/usuarios/me/menu') return json(200, { recolhido: false });
    if (p === '/api/usuarios/me') return json(200, { id: KIKO, nome: 'Kiko Gindri', papel: 'profissional' });
    if (p === '/api/suporte/nao-lidas') return json(200, { total: 0 });
    if (p === '/api/clientes') return json(200, []);
    json(404, {});
  });
});

const FONTE_LARGA = '* { font-family: "DejaVu Sans", sans-serif !important; }';
const erros = [];
await new Promise((r) => servidor.listen(0, r));
const url = `http://127.0.0.1:${servidor.address().port}`;
const b = await chromium.launch();
try {
  // ---- (1) Link Agenda do profissional
  for (const tokenOk of [true, false]) {
    meuLinkOk = tokenOk;
    const ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.clock.setFixedTime(new Date('2026-11-09T07:00:00-03:00'));
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(url);
    await p.fill('[data-testid="login-id"]', 'kiko'); await p.fill('[data-testid="login-senha"]', '12345678'); await p.click('[data-testid="login-entrar"]');
    await p.getByTestId('agenda-link').waitFor();
    await p.waitForTimeout(400); // o token é buscado ao montar a tela; o clique não espera rede
    const aba = ctx.waitForEvent('page', { timeout: 6000 });
    await p.getByTestId('agenda-link').click();
    const pop = await aba; const msg = decodeURIComponent(pop.url().split('text=')[1]);
    if (tokenOk) {
      assert.ok(msg.includes(`#agendar-${TOK}`), msg);
      assert.ok(!msg.includes(KIKO), 'o link novo não leva o id cru do profissional');
    } else {
      assert.ok(msg.includes(`#agendar-${KIKO}`), 'sem token (servidor falhou), cai no link com o id, como antes');
    }
    await pop.close(); await ctx.close();
    ok(tokenOk ? 'Link Agenda: o profissional envia #agendar-<token>' : 'Link Agenda: se o token falhar, o link antigo ainda funciona');
  }

  // ---- (2) e (3) página pública
  for (const vp of [{ nome: '1366', width: 1366, height: 800 }, { nome: '390', width: 390, height: 780 }]) {
    const touch = vp.width < 700;
    const abrir = async (hash) => {
      const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
      await ctx.clock.setFixedTime(new Date('2026-11-09T07:00:00-03:00'));
      const p = await ctx.newPage(); p.setDefaultTimeout(8000);
      p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
      p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
      await p.goto(`${url}/${hash}`);
      if (touch) await p.addStyleTag({ content: FONTE_LARGA });
      await p.getByTestId(`pub-srv-${CORTE}`).waitFor();
      return { ctx, p };
    };
    const semLateral = async (p, onde) => { const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(w[0] <= w[1], `${onde}: sem rolagem lateral (${w[0]} <= ${w[1]})`); };
    const marcado = async (p, idp) => (await p.getByTestId(idp).getAttribute('aria-pressed')) === 'true';

    // válido: pré-seleciona quem gerou, todos os serviços aparecem
    confere = [];
    let { ctx, p } = await abrir(`#agendar-${TOK}`);
    assert.deepEqual(confere, [TOK], 'o servidor foi consultado com o token (e só ele)');
    assert.ok(await marcado(p, `pub-barb-${KIKO}`), 'Kiko pré-selecionado pelo link');
    assert.equal(await p.getByTestId(`pub-srv-${BARBA}`).count(), 1, 'a Barba (que o Kiko não faz) continua na lista');
    if (pasta) await p.screenshot({ path: `${pasta}/b3-link-1-preselecionado-${vp.nome}.png`, fullPage: true });
    await semLateral(p, 'link válido');
    // serviço que ele não faz: sai a pré-seleção, aviso, só quem faz
    await p.getByTestId(`pub-srv-${BARBA}`).check({ force: true });
    await p.getByTestId('pub-aviso-prof').waitFor();
    assert.match(await p.getByTestId('pub-aviso-prof').innerText(), /Kiko não faz esse serviço/);
    assert.equal(await p.getByTestId(`pub-barb-${KIKO}`).count(), 0, 'Kiko sai da lista de "Com quem?"');
    assert.ok(await p.getByTestId(`pub-barb-${BRUNO}`).isVisible(), 'só quem faz a Barba');
    assert.ok(await marcado(p, 'pub-barb-qualquer'));
    if (pasta) await p.screenshot({ path: `${pasta}/b3-link-2-servico-de-outro-${vp.nome}.png`, fullPage: true });
    await semLateral(p, 'serviço de outro profissional');
    await p.getByTestId(`pub-srv-${BARBA}`).uncheck({ force: true });
    assert.equal(await p.getByTestId('pub-aviso-prof').count(), 0, 'tirando o serviço, o aviso some');
    await ctx.close();
    ok(`${vp.nome}px: token válido pré-seleciona, mostra todos os serviços e troca por quem faz`);

    // inválido: ignorado sem aviso nem erro
    confere = [];
    ({ ctx, p } = await abrir(`#agendar-${TOK_RUIM}`));
    await p.waitForTimeout(300);
    assert.deepEqual(confere, [TOK_RUIM]);
    assert.ok(await marcado(p, 'pub-barb-qualquer') || (await p.getByTestId('pub-barb-qualquer').count()) === 1);
    assert.equal(await p.getByTestId(`pub-barb-${KIKO}`).getAttribute('aria-pressed'), 'false', 'ninguém pré-selecionado');
    assert.equal(await p.getByTestId('pub-aviso-prof').count(), 0);
    assert.equal(await p.getByTestId('pub-erro-pagina').count(), 0, 'nada revela que o token era inválido');
    await ctx.close();
    ok(`${vp.nome}px: token inválido é ignorado, sem aviso`);

    // link antigo com o id cru: continua pré-selecionando e não consulta o servidor
    confere = [];
    ({ ctx, p } = await abrir(`#agendar-${KIKO}`));
    assert.deepEqual(confere, [], 'id cru não vai ao servidor');
    assert.ok(await marcado(p, `pub-barb-${KIKO}`));
    await ctx.close();
    ok(`${vp.nome}px: link antigo com o id continua valendo`);
  }
  assert.deepEqual(erros, [], 'sem erros de página nem diálogos nativos');
} finally {
  await b.close();
  servidor.close();
}
console.log('e2e127 ok');
