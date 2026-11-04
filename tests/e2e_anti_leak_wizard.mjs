/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
// Teste E2E de validação progressiva e isolamento de erros entre etapas no link público:
// Garante que o erro de nome em "Seus dados" nunca vaza para "Dia e horário" ao voltar.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, copyFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_ID = id(1);
const SRV_ID = id(50);
const ARTIFACT_DIR = 'C:\\Users\\lemar\\.gemini\\antigravity\\brain\\d0629c7d-43d4-425e-9390-8f6622d78d33';

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => {
      res.writeHead(st, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' || u.pathname.startsWith('/#')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(pagina);
    }
    if (u.pathname === '/api/publico/loja') {
      return json(200, {
        slug: 'apex',
        nome: 'Apex Estética Automotiva',
        tipo: 'estetica_automotiva',
        logo: null,
        temaCor: '#a3e635',
        temaCor2: null,
      });
    }
    if (u.pathname === '/api/publico/agendar') {
      if (req.method === 'POST') {
        const c = corpo ? JSON.parse(corpo) : {};
        if (!c.nome || c.nome.trim().length < 2) {
          return json(400, { erro: 'Informe o seu nome.' });
        }
        return json(200, {
          ok: true,
          agendamento: { id: id(99), inicio: c.inicio, fim: c.inicio + 2700000, servicos: ['Lavagem Completa'], profissional: 'Davi' },
          token: '0123456789abcdef0123456789abcdef0123456789abcdef',
        });
      }
      return json(200, {
        ativo: true,
        aviso: null,
        nome: 'Apex Estética Automotiva',
        tipo: 'estetica_automotiva',
        diasMax: 15,
        exigeNome: true,
        exigeTelefone: true,
        exigeVeiculo: ['placa', 'modelo', 'porte'],
        profissionais: [{ id: DONO_ID, nome: 'Davi', foto: null }],
        servicos: [{
          id: SRV_ID,
          nome: 'Lavagem Completa',
          preco: 80,
          precos: { pequeno: 70, medio: 80, grande: 100 },
          duracao: 45,
          duracoes: { pequeno: 40, medio: 45, grande: 60 },
          antecedenciaH: 0,
        }],
        portes: [
          { id: 'pequeno', nome: 'Pequeno', exemplo: 'Ex.: Mobi, Kwid' },
          { id: 'medio', nome: 'Médio', exemplo: 'Ex.: Onix, Polo' },
          { id: 'grande', nome: 'Grande', exemplo: 'Ex.: Hilux, Commander' },
        ],
        selo: '1000.0123456789abcdef0123456789abcdef',
      });
    }
    if (u.pathname === '/api/publico/dias') {
      return json(200, ['2026-10-30']);
    }
    if (u.pathname === '/api/publico/horarios') {
      return json(200, [
        { inicio: '2026-10-30T14:00:00Z', profissionalId: DONO_ID },
        { inicio: '2026-10-30T14:30:00Z', profissionalId: DONO_ID },
        { inicio: '2026-10-30T15:00:00Z', profissionalId: DONO_ID },
      ]);
    }
    if (u.pathname === '/api/publico/meus') {
      return json(200, []);
    }
    json(404, { erro: 'Não encontrado' });
  });
});

servidor.listen(0, async () => {
  const porta = servidor.address().port;
  const baseUrl = `http://127.0.0.1:${porta}/#agendar`;
  const browser = await chromium.launch({ headless: true });

  try {
    for (const { largura, altura, sufixo } of [
      { largura: 1366, altura: 768, sufixo: '1366' },
      { largura: 390, altura: 844, sufixo: '390' },
    ]) {
      const touch = largura < 700;
      const ctx = await browser.newContext({
        viewport: { width: largura, height: altura },
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        hasTouch: touch,
        isMobile: touch,
      });
      await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
      const page = await ctx.newPage();

      await page.goto(baseUrl);
      await page.waitForSelector('[data-testid="pub-placa"]');

      // Etapa 0: Veículo
      await page.fill('[data-testid="pub-placa"]', 'ABC1D23');
      await page.fill('[data-testid="pub-modelo"]', 'Civic');
      await page.click('button:has-text("Médio")');
      await page.click('[data-testid="pub-continuar-0"]');

      // Etapa 1: Serviço
      await page.waitForSelector(`[data-testid="pub-srv-${SRV_ID}"]`);
      await page.click(`[data-testid="pub-srv-${SRV_ID}"]`);
      await page.click('[data-testid="pub-continuar-1"]');

      // Etapa 2: Dia e horário
      await page.waitForSelector('text=Quando?');
      await page.waitForSelector('[data-testid^="pub-dia-"]');
      await page.locator('[data-testid^="pub-dia-"]').first().click();

      await page.waitForSelector('[data-testid^="pub-hora-"]');
      await page.locator('[data-testid^="pub-hora-"]').first().click();
      await page.click('[data-testid="pub-continuar-2"]');

      // Etapa 3: Seus dados
      await page.waitForSelector('text=Seus dados');
      // Submete sem preencher o nome
      await page.click('[data-testid="pub-enviar"]');

      // Deve mostrar erro de nome nesta etapa (Seus dados)
      await page.waitForSelector('[data-testid="pub-erro"]');
      const erroNome = await page.locator('[data-testid="pub-erro"]').innerText();
      assert.match(erroNome, /Informe o seu nome/i, 'Erro de nome deve aparecer em Seus dados');

      // Clica em Voltar para ir para Dia e horário (etapa 2)
      await page.click('button:has-text("Voltar")');
      await page.waitForSelector('text=Quando?');

      // VERIFICAÇÃO CRÍTICA: o erro "Informe o seu nome." NÃO PODE APARECER em Dia e horário!
      const erroEmDiaHora = await page.locator('[data-testid="pub-erro"]').count();
      assert.equal(erroEmDiaHora, 0, 'Nenhum erro de etapa posterior deve vazar para a etapa anterior');

      // Validação geométrica: sem scroll horizontal
      const semScrollH = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.ok(semScrollH, `Sem overflow horizontal em ${largura}px`);

      // Screenshot da tela "Quando?" sem erro indevido
      const shotPath = `tests/isolamento-etapa-${sufixo}.png`;
      await page.screenshot({ path: shotPath, fullPage: true });
      copyFileSync(shotPath, `${ARTIFACT_DIR}\\isolamento-etapa-${sufixo}.png`);

      await ctx.close();
      console.log(`✓ Isolamento de etapas validado com sucesso em ${largura}px!`);
    }

    console.log('✓ Todos os testes E2E de isolamento de etapas passaram com sucesso!');
  } finally {
    await browser.close();
    servidor.close();
  }
});
