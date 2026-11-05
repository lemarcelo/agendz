/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
// O compartilhamento pelo WhatsApp também funciona em homologação.
import assert from 'node:assert/strict';
import { subirServidor, abrirNavegador, id } from './real-util.mjs';

const estado = { loja: { slug: 'teste', nome: 'Loja de teste', tipo: 'barbearia', emHomologacao: true } };
const srv = await subirServidor((c, { json }) => {
  if (c.u === '/api/profissionais') return json(200, [{ id: id(1), nome: 'Alan', papel: 'dono', atende: true }]);
  if (c.u === '/api/agendamentos' || c.u === '/api/boxes' || c.u === '/api/clientes') return json(200, []);
  return false;
}, estado);
const { b, abrir, erros } = await abrirNavegador();
try {
  for (const ativo of [true, false]) {
    estado.loja.emHomologacao = ativo;
    const { ctx, p } = await abrir(srv.url);
    await p.evaluate(() => {
      window.__linksWhats = 0;
      const original = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.href.startsWith('https://wa.me/')) { window.__linksWhats++; return; }
        return original.call(this);
      };
    });
    await p.getByTestId('agenda-link').click();
    assert.equal(await p.evaluate(() => window.__linksWhats), 1);
    assert.equal(await p.getByTestId('faixa-homologacao').count(), ativo ? 1 : 0);
    await ctx.close();
  }
  assert.deepEqual(erros, []);
  console.log('WhatsApp: abertura funciona em homologação e no ambiente normal.');
} finally {
  await b.close();
  srv.fechar();
}
