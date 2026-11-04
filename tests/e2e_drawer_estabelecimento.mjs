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
  local: ['nome'],
  ordemServicos: 'uso',
  profissionalAutomatico: false,
  ordemAtender: JSON.parse(JSON.stringify(PADRAO_PAINEL)),
};

let linkSalvo = {
  ativo: true,
  diasMax: 30,
  limiteAbertos: 3,
  intervaloMin: 20,
  telefoneObrigatorio: true,
  nomeObrigatorio: true,
  veiculoObrigatorio: ['placa', 'porte'],
  recaptchaChaveSite: '',
  recaptchaSegredoConfigurado: false,
  disponivel: true,
  pendencias: [],
  barrados: { total: 0, porMotivo: {} },
};

const putRegrasChamadas = [];

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

    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Apex Estética', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok-dono', id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes', 'estabelecimento', 'servicos', 'equipe', 'relatorios'] });
    if (u.pathname === '/api/estabelecimento/local') return json(200, { endereco: 'Rua 1', mapaUrl: '' });
    if (u.pathname === '/api/estabelecimento/escala') return json(200, { dias: {} });
    if (u.pathname === '/api/profissionais') return json(200, [{ id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono', atende: true }]);
    if (u.pathname === '/api/servicos') return json(200, [{ id: 'srv-1', nome: 'Lavagem Detalhada', preco: 150, duracaoMin: 60, ativo: true, ordem: 1 }]);
    if (u.pathname === '/api/materiais') return json(200, []);
    if (u.pathname === '/api/usuarios/me/menu') return json(200, { recolhido: false });
    if (u.pathname === '/api/usuarios/me') return json(200, { id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono' });
    if (u.pathname === '/api/portes') return json(200, { portes: [{ id: 'p', nome: 'Pequeno' }, { id: 'm', nome: 'Médio' }, { id: 'g', nome: 'Grande' }] });
    if (u.pathname === '/api/agendamentos/existem-futuros' || u.pathname === '/api/agendamentos/futuros') return json(200, { existem: false });
    if (u.pathname === '/api/agendamentos') return json(200, []);
    if (u.pathname === '/api/estabelecimento/comissao') return json(200, { comissaoPadrao: 50, comissaoParceiro: true });
    if (u.pathname === '/api/suporte/chamados/nao-lidas') return json(200, { naoLidas: 0 });

    if (u.pathname === '/api/estabelecimento/regras-atendimento') {
      if (req.method === 'GET') {
        return json(200, regrasSalvas);
      }
      if (req.method === 'PUT') {
        putRegrasChamadas.push(c);
        regrasSalvas = { ...regrasSalvas, ...c };
        return json(200, regrasSalvas);
      }
    }

    if (u.pathname === '/api/estabelecimento/link-agendamento') {
      if (req.method === 'GET') {
        return json(200, linkSalvo);
      }
      if (req.method === 'PUT') {
        linkSalvo = { ...linkSalvo, ...c };
        return json(200, linkSalvo);
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
      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
      page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

      await page.goto(baseUrl);
      await page.fill('[data-testid="login-id"]', 'dono');
      await page.fill('[data-testid="login-senha"]', '123456');
      await page.click('[data-testid="login-entrar"]');

      await page.waitForSelector('[data-testid="marca-inicio-real"]');

      if (largura <= 900) {
        // Valida drawer mobile
        const menuAlternar = page.locator('[data-testid="menu-alternar-real"]');
        await assert.equal(await menuAlternar.isVisible(), true);

        // Abre drawer
        await menuAlternar.click();
        await page.waitForTimeout(350); // espera animação cubic-bezier

        // Valida que nav está visível e nav-estabelecimento existe
        const navEstab = page.locator('[data-testid="nav-estabelecimento"]');
        await assert.equal(await navEstab.isVisible(), true);

        // Screenshot do menu mobile aberto
        const shotMenu = `tests/menu-drawer-${sufixo}.png`;
        await page.screenshot({ path: shotMenu });
        copyFileSync(shotMenu, `${artefatosDir}\\menu-drawer-${sufixo}.png`);

        // Navega para Estabelecimento
        await navEstab.click();
        await page.waitForTimeout(350);
      } else {
        await page.click('[data-testid="nav-estabelecimento"]');
      }

      await page.waitForSelector('[data-testid="link-real"]');

      // 1. Valida se o box unificado de campos obrigatórios no link existe
      const boxLinkObrigatorio = page.locator('[data-testid="link-campos-obrigatorios"]');
      await assert.equal(await boxLinkObrigatorio.count(), 1, 'Box de campos obrigatórios do link deve existir');
      
      const nomeObrig = page.locator('[data-testid="link-nome-obrigatorio"]');
      const telObrig = page.locator('[data-testid="link-telefone-obrigatorio"]');
      await assert.equal(await nomeObrig.isVisible(), true);
      await assert.equal(await telObrig.isVisible(), true);

      // 2. Valida persistência imediata ao alterar select de ordem dos serviços
      const selectOrdem = page.locator('[data-testid="regras-ordem-servicos"]');
      await selectOrdem.scrollIntoViewIfNeeded();
      const chamadasAntes = putRegrasChamadas.length;
      await selectOrdem.selectOption('manual');
      await page.waitForTimeout(200);

      assert.ok(putRegrasChamadas.length > chamadasAntes, 'Alterar select de ordem dos serviços deve disparar PUT imediato');
      assert.equal(putRegrasChamadas[putRegrasChamadas.length - 1].ordemServicos, 'manual');

      // 3. Valida persistência imediata ao alterar select de forma de pagamento padrão
      const selectForma = page.locator('[data-testid="regras-forma"]');
      await selectForma.selectOption('dinheiro');
      await page.waitForTimeout(200);
      assert.equal(putRegrasChamadas[putRegrasChamadas.length - 1].formaPagamentoPadrao, 'dinheiro');

      // Valida ausência de overflow horizontal
      const semOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.ok(semOverflow, `Tela em ${largura}px não pode ter overflow horizontal`);

      // Screenshot da página Estabelecimento com os boxes padronizados
      const shotEstab = `tests/estabelecimento-boxes-${sufixo}.png`;
      await page.screenshot({ path: shotEstab, fullPage: true });
      copyFileSync(shotEstab, `${artefatosDir}\\estabelecimento-boxes-${sufixo}.png`);
      console.log(`Sucesso em ${largura}px! Screenshot: ${shotEstab}`);
    }

    console.log('Todos os testes de drawer e estabelecimento passaram com 100% de sucesso!');
  } finally {
    await browser.close();
    servidor.close();
  }
});
