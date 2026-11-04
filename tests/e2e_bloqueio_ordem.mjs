/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, copyFileSync } from 'node:fs';
import { PADRAO_PAINEL } from '../src/domain/ordem-atender.js';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_ID = id(1);

let regrasSalvas = {
  formaPagamentoPadrao: 'pix',
  futuro: ['nome'],
  local: [],
  ordemServicos: 'uso',
  profissionalAutomatico: false,
  ordemAtender: JSON.parse(JSON.stringify(PADRAO_PAINEL)),
};

const chamadas = [];

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => {
      res.writeHead(st, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(pagina);
    }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, corpo: c });

    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Barbearia Teste', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok-ordem', id: DONO_ID, nome: 'Marcelo Dono', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes', 'estabelecimento', 'servicos', 'equipe', 'relatorios'] });
    if (u.pathname === '/api/estabelecimento/local') return json(200, { endereco: '', mapaUrl: '' });
    if (u.pathname === '/api/estabelecimento/escala') return json(200, { dias: {} });
    if (u.pathname === '/api/profissionais') return json(200, [{ id: DONO_ID, nome: 'Marcelo Dono', papel: 'dono', atende: true }]);
    if (u.pathname === '/api/servicos') return json(200, []);
    if (u.pathname === '/api/materiais') return json(200, []);
    if (u.pathname === '/api/usuarios/me/menu') return json(200, { recolhido: false });
    if (u.pathname === '/api/agendamentos/existem-futuros' || u.pathname === '/api/agendamentos/futuros') return json(200, { existem: false });
    if (u.pathname === '/api/agendamentos') return json(200, []);
    if (u.pathname === '/api/estabelecimento/comissao') return json(200, { comissaoPadrao: 50, comissaoParceiro: true });

    if (u.pathname === '/api/estabelecimento/regras-atendimento') {
      if (req.method === 'GET') {
        return json(200, regrasSalvas);
      }
      if (req.method === 'PUT') {
        regrasSalvas = { ...regrasSalvas, ...c };
        return json(200, regrasSalvas);
      }
    }

    json(404, { erro: 'Não encontrado' });
  });
});

servidor.listen(0, async () => {
  const porta = servidor.address().port;
  const baseUrl = `http://127.0.0.1:${porta}`;
  const browser = await chromium.launch({ headless: true });

  const artefatosDir = 'C:\\Users\\lemar\\.gemini\\antigravity\\brain\\d0629c7d-43d4-425e-9390-8f6622d78d33';

  try {
    for (const { largura, altura, sufixo } of [
      { largura: 1366, altura: 768, sufixo: '1366' },
      { largura: 390, altura: 844, sufixo: '390' },
    ]) {
      const touch = largura < 700;
      const ctx = await browser.newContext({
        viewport: { width: largura, height: altura },
        hasTouch: touch,
        isMobile: touch,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
      });
      const page = await ctx.newPage();

      await page.goto(baseUrl);
      await page.fill('[data-testid="login-id"]', 'dono');
      await page.fill('[data-testid="login-senha"]', '123456');
      await page.click('[data-testid="login-entrar"]');
      await page.waitForSelector('[data-testid="agenda-real"]');

      // Navega para Estabelecimento
      if (largura < 700) {
        await page.click('[data-testid="menu-alternar-real"]');
      }
      await page.click('button:has-text("Estabelecimento")');
      await page.waitForSelector('[data-testid="regras-real"]');
      await page.waitForSelector('[data-testid="ordem-atender"]');

      // Verifica aviso explicativo fixo
      const avisoFixo = await page.locator('.ordem-atender-grupo').first().locator('p.muted').innerText();
      assert.match(avisoFixo, /serviço deve sempre vir antes da escolha do horário/i);

      // Localiza alça de Serviços e de Quando no agendamento futuro
      const alcaSrv = page.locator('[data-testid="ordem-futuro-etapas-mover-servicos"]');
      const alcaQdo = page.locator('[data-testid="ordem-futuro-etapas-mover-quando"]');
      await alcaSrv.scrollIntoViewIfNeeded();

      // Posição inicial: cliente (0), servicos (1 - sem veiculo na barbearia), quando (2), produtos (3)
      // Tenta mover Serviços para baixo (posição de Quando)
      await alcaSrv.focus();
      await page.keyboard.press('ArrowDown');

      // Verifica se o aviso de bloqueio apareceu
      await page.waitForSelector('[data-testid="ordem-atender-bloqueio"]');
      const msgBloqueio = await page.locator('[data-testid="ordem-atender-bloqueio"]').innerText();
      assert.match(msgBloqueio, /não pode ficar depois da escolha do horário/i);

      // Verifica que a ordem das etapas NÃO mudou (Serviços continua antes de Quando)
      const etapasFuturo = await page.locator('[data-testid="ordem-futuro-etapas"] li').evaluateAll((itens) => itens.map((li) => li.getAttribute('data-ordem-id')));
      const idxSrv = etapasFuturo.indexOf('servicos');
      const idxQdo = etapasFuturo.indexOf('quando');
      assert.ok(idxSrv < idxQdo, `Serviços (${idxSrv}) deve permanecer antes de Quando (${idxQdo})`);

      // Tenta mover Quando para cima (posição de Serviços)
      await alcaQdo.focus();
      await page.keyboard.press('ArrowUp');

      const etapasFuturo2 = await page.locator('[data-testid="ordem-futuro-etapas"] li').evaluateAll((itens) => itens.map((li) => li.getAttribute('data-ordem-id')));
      const idxSrv2 = etapasFuturo2.indexOf('servicos');
      const idxQdo2 = etapasFuturo2.indexOf('quando');
      assert.ok(idxSrv2 < idxQdo2, `Quando não deve ultrapassar Serviços`);

      // Validação geométrica
      const semScrollH = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.ok(semScrollH, `Sem overflow horizontal em ${largura}px`);

      // Screenshot da tela com o aviso de bloqueio
      const printPath = `tests/ordem-bloqueio-${sufixo}.png`;
      await page.screenshot({ path: printPath, fullPage: true });
      copyFileSync(printPath, `${artefatosDir}\\ordem-bloqueio-${sufixo}.png`);

      await ctx.close();
      console.log(`✓ Validação de bloqueio em ${largura}px concluída com sucesso!`);
    }

    console.log('✓ Todos os testes E2E de bloqueio da ordem de atendimento passaram com sucesso!');
  } finally {
    await browser.close();
    servidor.close();
  }
});
