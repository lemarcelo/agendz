/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, copyFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_ID = id(1);
const SRV_ID = id(50);
const BOX_ID = id(60);

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

    if (u.pathname === '/api/publico/loja') {
      return json(200, {
        slug: 'teste',
        nome: 'Estética Automotiva Modelo',
        tipo: 'estetica_automotiva',
        logo: null,
        temaCor: null,
        temaCor2: null,
      });
    }

    if (u.pathname === '/api/publico/agendar') {
      return json(200, {
        ativo: true,
        aviso: null,
        nome: 'Estética Automotiva Modelo',
        tipo: 'estetica_automotiva',
        servicos: [{
          id: SRV_ID,
          nome: 'Lavagem Detalhada',
          precos: { pequeno: 100, medio: 120, suv: 140 },
          duracoes: { pequeno: 45, medio: 60, suv: 75 },
          preco: 120,
          duracaoMin: 60,
          antecedenciaH: 0,
        }],
        profissionais: [{ id: DONO_ID, nome: 'Marcelo Profissional', foto: null }],
        portes: [
          { id: 'pequeno', nome: 'Pequeno', exemplo: 'Ex.: Mobi, Kwid' },
          { id: 'medio', nome: 'Médio', exemplo: 'Ex.: Onix, Polo' },
          { id: 'suv', nome: 'SUV', exemplo: 'Ex.: Compass, Creta' },
        ],
        exigeVeiculo: ['placa'], // placa obrigatória, modelo e porte opcionais
        exigeNome: false, // nome opcional
        exigeTelefone: false, // telefone opcional
        diasMax: 30,
        selo: 'selo-teste',
      });
    }

    if (u.pathname === '/api/publico/dias') {
      return json(200, ['2026-10-30', '2026-11-02']);
    }

    if (u.pathname === '/api/publico/horarios') {
      return json(200, ['12:00:00Z', '13:00:00Z'].map((h) => ({ inicio: `${u.searchParams.get('data')}T${h}`, profissionalId: DONO_ID })));
    }

    if (u.pathname === '/api/publico/meus') {
      return json(200, []);
    }

    if (u.pathname === '/api/auth/login') {
      return json(200, {
        token: 'tok-opcional',
        id: DONO_ID,
        nome: 'Marcelo Dono',
        papel: 'dono',
        deveTrocarSenha: false,
        onboardingPendente: false,
        secoes: ['agenda', 'clientes', 'estabelecimento', 'servicos', 'equipe', 'relatorios'],
      });
    }

    if (u.pathname === '/api/clientes') return json(200, []);
    if (u.pathname === '/api/estabelecimento/local') return json(200, { endereco: '', mapaUrl: '' });
    if (u.pathname === '/api/estabelecimento/escala') return json(200, { dias: {} });
    if (u.pathname === '/api/profissionais') return json(200, [{ id: DONO_ID, nome: 'Marcelo Dono', papel: 'dono', atende: true }]);
    if (u.pathname === '/api/servicos') return json(200, [{ id: SRV_ID, nome: 'Lavagem Detalhada', preco: 120, duracaoMin: 60 }]);
    if (u.pathname === '/api/materiais') return json(200, []);
    if (u.pathname === '/api/usuarios/me/menu') return json(200, { recolhido: false });
    if (u.pathname === '/api/agendamentos/existem-futuros' || u.pathname === '/api/agendamentos/futuros') return json(200, { existem: false });
    if (u.pathname === '/api/agendamentos') return json(200, []);
    if (u.pathname === '/api/boxes') return json(200, [{ id: BOX_ID, nome: 'Box 1', ativo: true }]);
    if (u.pathname === '/api/estabelecimento/regras-atendimento') {
      return json(200, {
        formaPagamentoPadrao: 'pix',
        futuro: [], // nada obrigatório no futuro
        local: [], // nada obrigatório no local
        profissionalAutomatico: false,
      });
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

      // 1. Validar tela de Auto-Agendamento Público (#agendar) em contexto anônimo
      const ctxPub = await browser.newContext({
        viewport: { width: largura, height: altura },
        hasTouch: touch,
        isMobile: touch,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
      });
      await ctxPub.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
      const pagePub = await ctxPub.newPage();

      await pagePub.goto(`${baseUrl}#agendar`);
      await pagePub.waitForSelector('[data-testid="pub-placa"]');

      // Passo 0: Veículo
      const pubLabelPlaca = await pagePub.locator('[data-testid="pub-placa"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const pubLabelModelo = await pagePub.locator('[data-testid="pub-modelo"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const pubLabelMarca = await pagePub.locator('[data-testid="pub-marca"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const pubLabelCor = await pagePub.locator('[data-testid="pub-cor"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const pubLabelPorte = await pagePub.locator('#pub-porte-r').evaluate((el) => el.textContent);

      assert.equal(pubLabelPlaca, 'Placa (ABC-1234 ou ABC1D23) *', `Placa configurada como obrigatória deve ter *, veio: ${pubLabelPlaca}`);
      assert.equal(pubLabelModelo, 'Modelo (opcional)', `Modelo configurado como não obrigatório deve ser (opcional), veio: ${pubLabelModelo}`);
      assert.equal(pubLabelMarca, 'Marca (opcional)', `Marca deve ser (opcional), veio: ${pubLabelMarca}`);
      assert.equal(pubLabelCor, 'Cor (opcional)', `Cor deve ser (opcional), veio: ${pubLabelCor}`);
      assert.equal(pubLabelPorte, 'Porte (opcional)', `Porte não obrigatório deve ser (opcional), veio: ${pubLabelPorte}`);

      const printAgendar0 = `tests/agendar-veiculo-opcional-${sufixo}.png`;
      await pagePub.screenshot({ path: printAgendar0, fullPage: true });
      copyFileSync(printAgendar0, `${artefatosDir}\\agendar-veiculo-opcional-${sufixo}.png`);

      // Preenche placa para avançar
      await pagePub.fill('[data-testid="pub-placa"]', 'ABC1D23');
      await pagePub.click('[data-testid="pub-continuar-0"]');

      // Passo 1: Serviço
      await pagePub.waitForSelector(`[data-testid="pub-srv-${SRV_ID}"]`);
      await pagePub.check(`[data-testid="pub-srv-${SRV_ID}"]`);
      await pagePub.click('[data-testid="pub-continuar-1"]');

      // Passo 2: Horário - clica no dia e depois no slot
      await pagePub.waitForSelector('[data-testid^="pub-dia-"]');
      await pagePub.locator('[data-testid^="pub-dia-"]').first().click();
      await pagePub.waitForSelector('[data-testid^="pub-hora-"]');
      await pagePub.locator('[data-testid^="pub-hora-"]').first().click();
      await pagePub.click('[data-testid="pub-continuar-2"]');

      // Passo 3: Seus dados
      await pagePub.waitForSelector('[data-testid="pub-nome"]');
      const pubLabelNome = await pagePub.locator('[data-testid="pub-nome"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const pubLabelTel = await pagePub.locator('[data-testid="pub-tel"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const pubLabelCupom = await pagePub.locator('[data-testid="pub-cupom"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);

      assert.equal(pubLabelNome, 'Nome (opcional)', `Nome configurado com exigeNome false deve ser (opcional), veio: ${pubLabelNome}`);
      assert.equal(pubLabelTel, 'Telefone (WhatsApp) (opcional)', `Telefone configurado com exigeTelefone false deve ser (opcional), veio: ${pubLabelTel}`);
      assert.equal(pubLabelCupom, 'Cupom (opcional)', `Cupom deve ser (opcional), veio: ${pubLabelCupom}`);

      const printAgendar3 = `tests/agendar-dados-opcional-${sufixo}.png`;
      await pagePub.screenshot({ path: printAgendar3, fullPage: true });
      copyFileSync(printAgendar3, `${artefatosDir}\\agendar-dados-opcional-${sufixo}.png`);

      const semScrollHPub = await pagePub.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.ok(semScrollHPub, `Não deve haver overflow horizontal no agendamento público em ${largura}px`);
      await ctxPub.close();

      // 2. Validar tela de Atender no painel (autenticado)
      const ctxAdmin = await browser.newContext({
        viewport: { width: largura, height: altura },
        hasTouch: touch,
        isMobile: touch,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
      });
      await ctxAdmin.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
      const pageAdmin = await ctxAdmin.newPage();

      await pageAdmin.goto(baseUrl);
      await pageAdmin.waitForSelector('[data-testid="login-id"]');
      await pageAdmin.fill('[data-testid="login-id"]', 'dono');
      await pageAdmin.fill('[data-testid="login-senha"]', '123456');
      await pageAdmin.click('[data-testid="login-entrar"]');
      await pageAdmin.waitForSelector('[data-testid="agenda-real"]');

      // Clica no botão Atender
      await pageAdmin.click('[data-testid="atender-abrir"]');
      await pageAdmin.waitForSelector('[data-testid="atender-form"]');

      // Seleciona um serviço
      await pageAdmin.check(`[data-testid="atender-srv-${SRV_ID}"]`);

      // Avança para "Quando"
      await pageAdmin.click('[data-testid="atender-prox-quando"]');

      // Muda para agendamento futuro para testar Box (opcional) e Cupom (chave, opcional)
      await pageAdmin.click('[data-testid="atender-quando"]');
      await pageAdmin.fill('[data-testid="atender-data"]', '2026-10-29T14:00');

      // Avança para "Cliente"
      await pageAdmin.click('[data-testid="atender-prox-cliente"]');
      await pageAdmin.waitForSelector('[data-testid="atender-veiculo-bloco"]');

      // Confere os rótulos de veículo no Atender
      const labelPlaca = await pageAdmin.locator('[data-testid="atender-v-placa"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const labelModelo = await pageAdmin.locator('[data-testid="atender-v-modelo"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const labelMarca = await pageAdmin.locator('[data-testid="atender-v-marca"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const labelCor = await pageAdmin.locator('[data-testid="atender-v-cor"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const labelPorte = await pageAdmin.locator('[data-testid="atender-v-porte"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);

      assert.equal(labelPlaca, 'Placa (opcional)', `Placa no Atender deve ser (opcional), veio: ${labelPlaca}`);
      assert.equal(labelModelo, 'Modelo (opcional)', `Modelo no Atender deve ser (opcional), veio: ${labelModelo}`);
      assert.equal(labelMarca, 'Marca (opcional)', `Marca no Atender deve ser (opcional), veio: ${labelMarca}`);
      assert.equal(labelCor, 'Cor (opcional)', `Cor no Atender deve ser (opcional), veio: ${labelCor}`);
      assert.equal(labelPorte, 'Porte do veículo (opcional)', `Porte no Atender deve ser (opcional), veio: ${labelPorte}`);

      // Confere os rótulos de Cliente no Atender
      const labelNome = await pageAdmin.locator('[data-testid="atender-nome"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const labelTel = await pageAdmin.locator('[data-testid="atender-telefone"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      assert.equal(labelNome, 'Apelido (opcional)', `Nome no Atender deve ser (opcional), veio: ${labelNome}`);
      assert.equal(labelTel, 'Telefone (opcional)', `Telefone no Atender deve ser (opcional), veio: ${labelTel}`);

      // Confere Box e Cupom
      const labelBox = await pageAdmin.locator('[data-testid="atender-box"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      const labelCupom = await pageAdmin.locator('[data-testid="atender-cupom"]').evaluate((el) => el.closest('.campo').querySelector('.campo-rotulo').textContent);
      assert.equal(labelBox, 'Box (opcional)', `Box no Atender deve ser (opcional), veio: ${labelBox}`);
      assert.match(labelCupom, /opcional/i, `Cupom deve conter opcional, veio: ${labelCupom}`);

      // Validação geométrica
      const semScrollH = await pageAdmin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.ok(semScrollH, `Não deve haver overflow horizontal em ${largura}px`);

      const printAtender = `tests/atender-opcional-${sufixo}.png`;
      await pageAdmin.screenshot({ path: printAtender, fullPage: true });
      copyFileSync(printAtender, `${artefatosDir}\\atender-opcional-${sufixo}.png`);

      await ctxAdmin.close();
      console.log(`✓ Validação de campos opcionais em ${largura}px concluída com sucesso!`);
    }
    console.log('✓ Todos os testes E2E de campos opcionais passaram com sucesso!');
  } finally {
    await browser.close();
    servidor.close();
  }
});
