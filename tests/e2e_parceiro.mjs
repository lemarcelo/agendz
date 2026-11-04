/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, copyFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO_ID = id(1);
const CLI_ID = id(10);
const AGENDAMENTO_ID = id(100);
const U = (s) => new Date(`${s}-03:00`).toISOString();

let clienteSalvo = {
  id: CLI_ID,
  nome: 'Carlos Parceiro',
  apelido: 'Carlinhos',
  telefone: '5511999998888',
  cpf: '',
  nascimento: '',
  dadosCompletos: true,
  semMensagens: false,
  veiculos: [],
  parceiro: true,
  parceiroDescontoPct: 20,
};

let configComissao = {
  comissaoPadrao: 50,
  comissaoParceiro: true,
};

const agendamento = {
  id: AGENDAMENTO_ID,
  inicio: U('2026-10-28T09:00:00'),
  fim: U('2026-10-28T09:45:00'),
  fimOcupado: U('2026-10-28T09:55:00'),
  status: 'a_confirmar',
  origem: 'painel',
  clienteId: CLI_ID,
  nomeAvulso: '',
  profissionalId: DONO_ID,
  servicos: [{ servicoId: id(50), nome: 'Corte Especial', preco: 100, duracaoMin: 45, desconto: 20 }],
  produtos: [],
  total: 80,
  desconto: 20,
  totalProdutos: 0,
  conflitosPendentes: [],
  historico: [{ em: U('2026-10-28T08:00:00'), autor: 'Marcelo Dono', campo: 'criação', para: 'Corte Especial' }],
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

    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Barbearia Modelo', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: DONO_ID, nome: 'Marcelo Dono', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes', 'estabelecimento', 'servicos', 'equipe', 'relatorios'] });
    if (u.pathname === '/api/clientes') {
      return json(200, [clienteSalvo]);
    }
    if (u.pathname === `/api/clientes/${CLI_ID}`) {
      if (req.method === 'PUT') {
        clienteSalvo = { ...clienteSalvo, ...c };
        return json(200, clienteSalvo);
      }
      return json(200, clienteSalvo);
    }
    if (u.pathname === '/api/estabelecimento/comissao') {
      if (req.method === 'PUT') {
        configComissao = { ...configComissao, ...c };
        return json(200, configComissao);
      }
      return json(200, configComissao);
    }
    if (u.pathname === '/api/estabelecimento/local') {
      return json(200, { endereco: '', mapaUrl: '' });
    }
    if (u.pathname === '/api/estabelecimento/escala') {
      return json(200, { dias: {} });
    }
    if (u.pathname === '/api/profissionais') {
      return json(200, [{ id: DONO_ID, nome: 'Marcelo Dono', papel: 'dono', atende: true }]);
    }
    if (u.pathname === '/api/servicos') {
      return json(200, [{ id: id(50), nome: 'Corte Especial', preco: 100, duracaoMin: 45 }]);
    }
    if (u.pathname === '/api/usuarios/me/menu') {
      return json(200, { recolhido: false });
    }
    if (u.pathname === '/api/agendamentos/existem-futuros' || u.pathname === '/api/agendamentos/futuros') {
      return json(200, { existem: false });
    }
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      return json(200, [agendamento]);
    }
    if (u.pathname === `/api/agendamentos/${AGENDAMENTO_ID}`) {
      return json(200, { agendamento });
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
    for (const largura of [1366, 390]) {
      const touch = largura < 700;
      const ctx = await browser.newContext({
        viewport: { width: largura, height: 900 },
        hasTouch: touch,
        isMobile: touch,
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
      });
      await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
      const page = await ctx.newPage();
      await page.goto(baseUrl);

      // Login
      await page.fill('[data-testid="login-id"]', 'dono');
      await page.fill('[data-testid="login-senha"]', '123456');
      await page.click('[data-testid="login-entrar"]');
      await page.waitForSelector('[data-testid="agenda-real"]');

      // 1. Verificar Agenda: Cartão com chip Parceiro
      const cartaoParceiro = await page.waitForSelector('[data-testid="cartao-parceiro"]');
      assert.ok(cartaoParceiro, 'Chip parceiro deve estar visível no cartão');

      // Abrir Detalhes do agendamento
      await page.click('[data-testid="cartao-abrir"]');
      await page.waitForSelector('[data-testid="detalhe-modal"]');
      const detalheChip = await page.waitForSelector('[data-testid="detalhe-parceiro-chip"]');
      assert.ok(detalheChip, 'Chip parceiro deve estar visível no modal de detalhes');
      const detalheDesconto = await page.waitForSelector('[data-testid="detalhe-parceiro-desconto"]');
      assert.ok(detalheDesconto, 'Desconto do parceiro deve estar discriminado na carteira/valor');

      // Validar ausência de rolagem lateral
      const semOverflowModal = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.ok(semOverflowModal, 'Não deve haver overflow lateral no modal da agenda');

      // Screenshot da Agenda com Parceiro
      const shotAgenda = `shots-revisao/parceiro-agenda-modal-${largura}.png`;
      await page.screenshot({ path: shotAgenda });
      copyFileSync(shotAgenda, `${artefatosDir}\\parceiro-agenda-modal-${largura}.png`);

      // Fechar modal
      await page.click('[data-testid="detalhe-fechar"]');

      // Helper de navegação
      const navegarAba = async (nome) => {
        if (largura < 700) {
          await page.click('[data-testid="menu-alternar-real"]');
          await page.waitForTimeout(200);
        }
        await page.click(`[data-testid="nav-${nome}"]`);
      };

      // 2. Navegar para Clientes
      await navegarAba('clientes');
      await page.waitForSelector('[data-testid="tela-clientes"]');

      // Verificar tag de parceiro na lista de clientes
      const cliTag = await page.waitForSelector(`[data-testid="cli-parceiro-tag-${CLI_ID}"]`);
      assert.ok(cliTag, 'Tag de parceiro deve estar visível no cartão do cliente');

      // Clicar em Editar
      await page.click(`[data-testid="editar-${CLI_ID}"]`);
      await page.waitForSelector('[data-testid="cli-form"]');

      // Validar checkbox e input de desconto
      const checkbox = await page.waitForSelector('[data-testid="cli-parceiro"]');
      const isChecked = await checkbox.isChecked();
      assert.ok(isChecked, 'Checkbox parceiro deve estar marcado');
      const inputPct = await page.waitForSelector('[data-testid="cli-parceiro-pct"]');
      assert.equal(await inputPct.inputValue(), '20', 'Input de desconto deve ter 20');
      assert.equal(await inputPct.isDisabled(), false, 'Input deve estar habilitado quando marcado');

      // Testar desmarcar: deve desabilitar o input
      await checkbox.uncheck();
      assert.equal(await inputPct.isDisabled(), true, 'Input deve ficar desabilitado quando desmarcado');

      // Marcar de novo
      await checkbox.check();
      assert.equal(await inputPct.isDisabled(), false);

      // Screenshot do formulário de clientes
      const shotCli = `shots-revisao/parceiro-cliente-form-${largura}.png`;
      await page.screenshot({ path: shotCli });
      copyFileSync(shotCli, `${artefatosDir}\\parceiro-cliente-form-${largura}.png`);

      // Cancelar edição
      await page.click('[data-testid="cli-cancelar"]');

      // 3. Navegar para Estabelecimento
      await navegarAba('estabelecimento');
      await page.waitForSelector('[data-testid="tela-estabelecimento"]');

      // Verificar comissão de parceiros
      const comParceiro = await page.waitForSelector('[data-testid="com-parceiro"]');
      assert.ok(await comParceiro.isChecked(), 'Configuração de comissão de parceiro deve carregar ligada');

      // Screenshot de Estabelecimento
      const shotEst = `shots-revisao/parceiro-estabelecimento-${largura}.png`;
      await page.screenshot({ path: shotEst });
      copyFileSync(shotEst, `${artefatosDir}\\parceiro-estabelecimento-${largura}.png`);

      await ctx.close();
      console.log(`✓ Validação visual e geométrica concluída com sucesso em ${largura}px!`);
    }

    console.log('✓ Todos os testes E2E de Cliente Parceiro passaram com sucesso!');
  } finally {
    await browser.close();
    servidor.close();
  }
});
