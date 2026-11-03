/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atender compacto no computador e adaptado ao celular, nos dois tipos e temas.
import assert from 'node:assert/strict';
import { subirServidor, abrirNavegador, id } from './real-util.mjs';

const estado = {};
const srv = await subirServidor((c, { json }) => {
  if (c.u === '/api/profissionais') return json(200, [{ id: id(1), nome: 'Ana', papel: 'dono', atende: true }]);
  if (c.u === '/api/estabelecimento/regras-atendimento') return json(200, { futuro: [], local: [] });
  if (c.u === '/api/estabelecimento/local') return json(200, {});
  if (c.u === '/api/boxes') return json(200, [{ id: id(60), nome: 'Box 1', ativo: true }]);
  if (c.u === '/api/servicos') return json(200, [{ id: id(50), nome: 'Serviço', ativo: true, preco: 40, duracaoMin: 30, precos: { medio: 40 }, duracoes: { medio: 30 } }]);
  if (c.u === '/api/atendimentos' && c.m === 'POST') return json(201, { id: id(101), status: 'concluido' });
  if (['/api/agendamentos', '/api/clientes', '/api/produtos', '/api/avisos'].includes(c.u)) return json(200, []);
  return false;
}, estado);
const nav = await abrirNavegador();
try {
  for (const tipo of ['estetica_automotiva', 'barbearia']) {
    estado.loja = { slug: 'teste', nome: 'Loja teste', tipo };
    for (const width of [390, 1366, 1904]) for (const tema of ['light', 'dark']) {
      const { ctx, p } = await nav.abrir(srv.url, { viewport: { width, height: 1000 }, fonteLarga: true });
      try {
        await p.evaluate((t) => document.documentElement.dataset.theme = t, tema);
        await p.getByTestId('agenda-dia').waitFor();
        if (process.env.AGENDZ_REVISAO_VISUAL) await p.screenshot({ animations: 'disabled', path: `shots-revisao/${tipo}-${width}-${tema}-agenda.png` });
        const principal = await p.locator('.app-real .principal').boundingBox();
        assert.ok(principal.width <= 1441, 'conteúdo não deve esticar em telas largas');
        const cabecalho = await p.locator('.app-real .topo').boundingBox();
        for (const el of await p.locator('.app-real .topo button:visible').all()) {
          const rect = await el.boundingBox();
          assert.ok(rect.x >= -1 && rect.x + rect.width <= width + 1 && rect.y >= cabecalho.y - 1 && rect.y + rect.height <= cabecalho.y + cabecalho.height + 1, 'controle do topo fora da tela ou do cabeçalho');
        }
        const botoesTopo = await p.locator('.app-real .topo button:visible').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
        for (let i = 0; i < botoesTopo.length; i++) for (let j = i + 1; j < botoesTopo.length; j++) {
          const a = botoesTopo[i], b = botoesTopo[j];
          assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, 'controles do topo não devem se sobrepor');
        }
        const marca = p.getByTestId('marca-inicio-real');
        const logo = await marca.locator('img, .marca-icone').boundingBox();
        const nome = await marca.locator('.marca-nome').boundingBox();
        assert.ok(nome.y >= logo.y + logo.height, 'nome abaixo da marca');
        await p.getByTestId('nav-clientes').click();
        if (process.env.AGENDZ_REVISAO_VISUAL) { await p.getByTestId('tela-clientes').waitFor(); await p.screenshot({ animations: 'disabled', path: `shots-revisao/${tipo}-${width}-${tema}-clientes.png` }); }
        await marca.click();
        await p.getByTestId('agenda-dia').waitFor();
        await p.getByTestId('atender-abrir').click();
        const painel = p.getByTestId('atender-form');
        await painel.waitFor();
        if (process.env.AGENDZ_REVISAO_VISUAL) await p.screenshot({ animations: 'disabled', path: `shots-revisao/${tipo}-${width}-${tema}-servicos.png` });
        assert.equal(await p.getByTestId('atender-janela').getAttribute('aria-modal'), 'true');
        assert.equal(await p.getByTestId('atender-janela').evaluate((el) => getComputedStyle(el).position), 'fixed');
        const caixa = await painel.boundingBox();
        assert.ok(caixa.width <= 721, `Atender esticado: ${caixa.width}px`);
        assert.ok(caixa.width >= Math.min(700, width - 60), 'painel aproveita a largura disponível');
        if (width > 720) assert.ok(Math.abs(caixa.x + caixa.width / 2 - width / 2) < 24, 'painel centralizado');
        assert.equal(await p.getByTestId('atender-lista-servicos').isVisible(), true);
        await p.getByTestId(`atender-srv-${id(50)}`).check();
        await p.getByTestId('atender-prox-quando').click();
        if (process.env.AGENDZ_REVISAO_VISUAL) await p.screenshot({ animations: 'disabled', path: `shots-revisao/${tipo}-${width}-${tema}-quando.png` });
        assert.equal(await p.getByTestId('atender-lista-servicos').isVisible(), false);
        await p.getByTestId('atender-voltar').click();
        assert.equal(await p.getByTestId(`atender-srv-${id(50)}`).isChecked(), true);
        await p.getByTestId('atender-prox-quando').click();
        await p.getByTestId('atender-prox-cliente').click();
        if (process.env.AGENDZ_REVISAO_VISUAL) await p.screenshot({ animations: 'disabled', path: `shots-revisao/${tipo}-${width}-${tema}-cliente.png` });
        assert.equal(await p.getByTestId('atender-quando-bloco').isVisible(), false);
        assert.equal(await p.getByTestId('salvar-atender').isVisible(), true);
        if (tipo === 'estetica_automotiva') {
          if (width === 390) {
            const campoPorte = await p.getByTestId('atender-v-porte-medio').boundingBox();
            const campoPlaca = await p.getByTestId('atender-v-placa').boundingBox();
            assert.ok(campoPorte.width >= campoPlaca.width * 0.9, 'portes usam a largura disponível');
            const primeiro = await p.getByTestId('atender-v-porte-pequeno').boundingBox();
            assert.ok(Math.abs(primeiro.y - campoPorte.y) < 2, 'portes aparecem lado a lado no celular');
          }
          await p.getByTestId('atender-v-placa').fill('ABC1234');
          await p.getByTestId('atender-v-modelo').fill('Carro');
        }
        await p.getByTestId('atender-nome').fill('Cliente Teste');
        await p.getByTestId('salvar-atender').click();
        await p.waitForFunction(() => !document.querySelector('[data-testid="atender-form"]'));
        assert.equal(srv.ultimo('POST', '/api/atendimentos').corpo.servicoIds[0], id(50));
        assert.equal(srv.ultimo('POST', '/api/atendimentos').corpo.nome, 'Cliente Teste');
        if (tipo === 'estetica_automotiva') assert.equal(srv.ultimo('POST', '/api/atendimentos').corpo.veiculo.placa, 'ABC1234');
        await nav.semRolagem(p, `${tipo} ${width} ${tema}`);
      } finally { await ctx.close(); }
    }
  }
  assert.deepEqual(nav.erros, []);
  console.log('e2e119 ok: Atender compacto, dois tipos, dois temas, desktop e celular');
} finally { await nav.b.close(); await srv.fechar(); }
