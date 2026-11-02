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
  if (['/api/agendamentos', '/api/clientes', '/api/servicos', '/api/produtos', '/api/avisos'].includes(c.u)) return json(200, []);
  return false;
}, estado);
const nav = await abrirNavegador();
try {
  for (const tipo of ['estetica_automotiva', 'barbearia']) {
    estado.loja = { slug: 'teste', nome: 'Loja teste', tipo };
    for (const width of [390, 1904]) for (const tema of ['light', 'dark']) {
      const { ctx, p } = await nav.abrir(srv.url, { viewport: { width, height: 1000 }, fonteLarga: true });
      try {
        await p.evaluate((t) => document.documentElement.dataset.theme = t, tema);
        await p.getByTestId('agenda-dia').waitFor();
        await p.getByTestId('atender-abrir').click();
        const painel = p.getByTestId('atender-form');
        await painel.waitFor();
        assert.equal(await p.getByTestId('atender-janela').getAttribute('aria-modal'), 'true');
        assert.equal(await p.getByTestId('atender-janela').evaluate((el) => getComputedStyle(el).position), 'fixed');
        const caixa = await painel.boundingBox();
        assert.ok(caixa.width <= 721, `Atender esticado: ${caixa.width}px`);
        assert.ok(caixa.width >= Math.min(700, width - 60), 'painel aproveita a largura disponível');
        if (width > 720) assert.ok(Math.abs(caixa.x + caixa.width / 2 - width / 2) < 24, 'painel centralizado');
        await nav.semRolagem(p, `${tipo} ${width} ${tema}`);
      } finally { await ctx.close(); }
    }
  }
  assert.deepEqual(nav.erros, []);
  console.log('e2e119 ok: Atender compacto, dois tipos, dois temas, desktop e celular');
} finally { await nav.b.close(); await srv.fechar(); }
