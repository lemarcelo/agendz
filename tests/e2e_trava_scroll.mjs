/* © 2026 Marcelo — Agendz. Todos os direitos reservados. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { PADRAO_PAINEL } from '../src/domain/ordem-atender.js';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_ID = id(1);
const AGENDAMENTO_ID = id(99);

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
  if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono', secoes: ['agenda'] });
  if (u.pathname === '/api/profissionais') return json(200, [{ id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono', atende: true }]);
  if (u.pathname === '/api/estabelecimento/local') return json(200, {});
  if (u.pathname === '/api/estabelecimento/escala') return json(200, { dias: {} });
  if (u.pathname === '/api/servicos') return json(200, [{ id: id(2), nome: 'Lavagem Detalhada', duracaoMinutos: 60, preco: 150 }]);
  if (u.pathname === '/api/usuarios/me/menu') return json(200, { recolhido: false });
  if (u.pathname === '/api/portes') return json(200, { portes: [] });
  if (u.pathname === '/api/agendamentos/existem-futuros') return json(200, { existem: true });
  if (u.pathname === '/api/agendamentos') {
    return json(200, [{
      id: AGENDAMENTO_ID,
      clienteNome: 'Carlos Cliente',
      clienteTelefone: '11999998888',
      profissionalId: DONO_ID,
      inicio: new Date().toISOString(),
      fim: new Date(Date.now() + 3600000).toISOString(),
      servicos: [{ servicoId: id(2), nome: 'Lavagem Detalhada', preco: 150, duracaoMin: 60, desconto: 0 }],
      total: 150,
      desconto: 0,
      totalProdutos: 0,
      status: 'confirmado'
    }]);
  }
  if (u.pathname === `/api/agendamentos/${AGENDAMENTO_ID}`) {
    return json(200, {
      id: AGENDAMENTO_ID,
      clienteNome: 'Carlos Cliente',
      clienteTelefone: '11999998888',
      profissionalId: DONO_ID,
      inicio: new Date().toISOString(),
      fim: new Date(Date.now() + 3600000).toISOString(),
      servicos: [{ servicoId: id(2), nome: 'Lavagem Detalhada', preco: 150, duracaoMin: 60, desconto: 0 }],
      total: 150,
      desconto: 0,
      totalProdutos: 0,
      status: 'confirmado'
    });
  }
  if (u.pathname === '/api/estabelecimento/comissao') return json(200, { comissaoPadrao: 50 });
  if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [], ordemServicos: 'uso', ordemAtender: PADRAO_PAINEL });
  if (u.pathname === '/api/estabelecimento/link-agendamento') return json(200, { ativo: true, diasMax: 30, limiteAbertos: 3, intervaloMin: 20, telefoneObrigatorio: true, nomeObrigatorio: true, veiculoObrigatorio: [], pendencias: [], barrados: { total: 0, porMotivo: {} } });
  if (u.pathname === '/api/onboarding') return json(200, { tipo: 'estetica_automotiva', passo: 'servicos', concluido: true, servicos: [], jaCadastrados: [], expedienteSugerido: {} });
  if (u.pathname === '/api/onboarding/reconfiguracoes') return json(200, { itens: [] });
  if (u.pathname === '/api/suporte/chamados') return json(200, []);
  if (u.pathname === '/api/suporte/nao-lidas') return json(200, { total: 0 });
  if (u.pathname === '/api/usuarios/me') return json(200, { id: DONO_ID, nome: 'Marcelo Apex', papel: 'dono' });
  json(404, {});
});

servidor.listen(0, async () => {
  const porta = servidor.address().port;
  const browser = await chromium.launch({ headless: true });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();

    await page.goto(`http://127.0.0.1:${porta}`);

    // Login
    await page.fill('[data-testid="login-id"]', 'dono');
    await page.fill('[data-testid="login-senha"]', '123456');
    await page.click('[data-testid="login-entrar"]');

    // Aguarda carregar o painel
    await page.waitForSelector('[data-testid="marca-inicio-real"]', { timeout: 8000 });

    // Estado inicial: sem modal aberto, sem classe de trava
    const travadoInicial = await page.evaluate(() => document.body.classList.contains('trava-scroll-modal'));
    assert.equal(travadoInicial, false, 'Body não deve ter classe trava-scroll-modal antes de abrir modal');

    // Clica no botão Atender
    await page.waitForSelector('[data-testid="atender-abrir"]', { timeout: 5000 });
    await page.click('[data-testid="atender-abrir"]');

    // Aguarda modal Atender
    await page.waitForSelector('[data-testid="atender-janela"]', { timeout: 5000 });

    // Asserção 1: Body recebeu classe trava-scroll-modal
    const travadoComModal = await page.evaluate(() => document.body.classList.contains('trava-scroll-modal'));
    assert.equal(travadoComModal, true, 'Body deve ter classe trava-scroll-modal com modal aberto');

    // Asserção 2: Overflow do body é hidden
    const overflowBody = await page.evaluate(() => getComputedStyle(document.body).overflow);
    assert.equal(overflowBody, 'hidden', 'Computed style de body.overflow deve ser hidden');

    // Asserção 3: Tentativa de scroll no body com a roda do mouse permanece 0px
    await page.mouse.wheel(0, 800);
    const scrollYDuranteModal = await page.evaluate(() => window.scrollY);
    assert.equal(scrollYDuranteModal, 0, 'Scroll da janela não deve sair do 0 enquanto modal estiver aberto');

    // Fecha o modal via botão fechar
    await page.click('[data-testid="atender-fechar"]');
    await page.waitForSelector('[data-testid="atender-janela"]', { state: 'detached', timeout: 5000 });

    // Asserção 4: Body não tem mais a classe após fechar
    const travadoAposFechar = await page.evaluate(() => document.body.classList.contains('trava-scroll-modal'));
    assert.equal(travadoAposFechar, false, 'Body não deve ter trava-scroll-modal após fechar modal');

    // Abre o perfil (outro modal/drawer da aplicação)
    await page.click('[data-testid="abrir-perfil"]');
    await page.waitForSelector('.perfil-fundo-real', { timeout: 5000 });

    // Asserção 5: Perfil modal trava o body
    const travadoPerfil = await page.evaluate(() => document.body.classList.contains('trava-scroll-modal'));
    assert.equal(travadoPerfil, true, 'Body deve ter trava-scroll-modal com modal do perfil aberto');

    // Fecha via botão fechar do perfil
    // Clicar no fundo fecha o perfil sem destravar antes da remoção.
    await page.mouse.click(2, 2);
    await page.waitForSelector('.perfil-fundo-real', { state: 'detached', timeout: 5000 });

    // Asserção 6: Voltou ao normal
    const travadoFinal = await page.evaluate(() => document.body.classList.contains('trava-scroll-modal'));
    assert.equal(travadoFinal, false, 'Body não deve ter trava-scroll-modal após fechar perfil');

    console.log('TESTE_PASSOU: Todas as 6 asserções de Trava Geral de Scroll validadas no navegador com 100% de sucesso!');
  } finally {
    await browser.close();
    servidor.close();
  }
});
