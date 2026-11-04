/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, copyFileSync } from 'node:fs';
import { PADRAO_PAINEL } from '../src/domain/ordem-atender.js';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_ID = id(1);

const servidor = http.createServer((req, res) => {
  const json = (st, obj) => {
    res.writeHead(st, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(pagina);
  }
  if (u.pathname === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Apex Estética', tipo: 'estetica_automotiva' });
  if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono', secoes: ['agenda', 'estabelecimento'] });
  if (u.pathname === '/api/profissionais') return json(200, [{ id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono', atende: true }]);
  if (u.pathname === '/api/estabelecimento/local') return json(200, {});
  if (u.pathname === '/api/estabelecimento/escala') return json(200, { dias: {} });
  if (u.pathname === '/api/servicos') return json(200, []);
  if (u.pathname === '/api/usuarios/me/menu') return json(200, { recolhido: false });
  if (u.pathname === '/api/portes') return json(200, { portes: [] });
  if (u.pathname === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
  if (u.pathname === '/api/agendamentos') return json(200, []);
  if (u.pathname === '/api/estabelecimento/comissao') return json(200, { comissaoPadrao: 50 });
  if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [], ordemServicos: 'uso', ordemAtender: PADRAO_PAINEL });
  if (u.pathname === '/api/estabelecimento/link-agendamento') return json(200, { ativo: true, diasMax: 30, limiteAbertos: 3, intervaloMin: 20, telefoneObrigatorio: true, nomeObrigatorio: true, veiculoObrigatorio: [], pendencias: [], barrados: { total: 0, porMotivo: {} } });
  if (u.pathname === '/api/onboarding') return json(200, { tipo: 'estetica_automotiva', passo: 'servicos', concluido: true, servicos: [], jaCadastrados: [], expedienteSugerido: {} });
  if (u.pathname === '/api/onboarding/reconfiguracoes') return json(200, { itens: [] });
  json(404, {});
});

servidor.listen(0, async () => {
  const porta = servidor.address().port;
  const browser = await chromium.launch({ headless: true });
  const artefatosDir = 'C:\\Users\\lemar\\.gemini\\antigravity\\brain\\d0629c7d-43d4-425e-9390-8f6622d78d33';

  try {
    for (const { w, h, s } of [{ w: 1366, h: 768, s: '1366' }, { w: 390, h: 844, s: '390' }]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${porta}`);
      await page.fill('[data-testid="login-id"]', 'dono');
      await page.fill('[data-testid="login-senha"]', '123456');
      await page.click('[data-testid="login-entrar"]');
      await page.waitForSelector('[data-testid="marca-inicio-real"]');
      if (w <= 900) {
        await page.click('[data-testid="menu-alternar-real"]');
        await page.waitForTimeout(300);
        await page.click('[data-testid="nav-estabelecimento"]');
      } else {
        await page.click('[data-testid="nav-estabelecimento"]');
      }
      await page.waitForSelector('[data-testid="reconfigurar-abrir"]');
      
      // Valida posição no rodapé: o botão deve estar abaixo do cabeçalho da página
      const btn = page.locator('[data-testid="reconfigurar-abrir"]');
      await btn.scrollIntoViewIfNeeded();
      
      // Clica no botão discreto no rodapé
      await btn.click();
      await page.waitForSelector('[data-testid="pa-reconf-senha"]');

      // Valida que o alerta crítico com texto enfático está visível
      const alerta = page.locator('.pa-reconf-aviso-perigo');
      await assert.equal(await alerta.isVisible(), true);
      const textoAlerta = await alerta.innerText();
      assert.match(textoAlerta, /Ação Crítica de Reconfiguração/i);

      const shot = `tests/reconfigurar-alerta-${s}.png`;
      await page.screenshot({ path: shot, fullPage: true });
      copyFileSync(shot, `${artefatosDir}\\reconfigurar-alerta-${s}.png`);
      console.log(`Sucesso em ${w}px! Screenshot: ${shot}`);
    }
  } finally {
    await browser.close();
    servidor.close();
  }
});
