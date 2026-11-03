/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Preferência do menu desktop na conta; abrir ou fechar no celular não altera a preferência.
import assert from 'node:assert/strict';
import { subirServidor, abrirNavegador, id } from './real-util.mjs';

let recolhido = false;
let gravacoes = 0;
const srv = await subirServidor((c, { json }) => {
  if (c.u === '/api/usuarios/me/menu') {
    if (c.m === 'PUT') { recolhido = c.corpo.recolhido; gravacoes++; }
    return json(200, { recolhido });
  }
  if (c.u === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
  if (c.u === '/api/profissionais') return json(200, [{ id: id(1), nome: 'Ana', papel: 'dono', atende: true }]);
  if (['/api/agendamentos', '/api/clientes', '/api/servicos', '/api/avisos'].includes(c.u)) return json(200, []);
  return false;
});
const nav = await abrirNavegador();
try {
  let { ctx, p } = await nav.abrir(srv.url, { viewport: { width: 1366, height: 900 } });
  await p.getByTestId('agenda-dia').waitFor();
  const gravou = p.waitForResponse((r) => r.url().endsWith('/api/usuarios/me/menu') && r.request().method() === 'PUT');
  await p.getByTestId('menu-alternar-real').click();
  await gravou;
  assert.equal(await p.locator('.app-real').evaluate((el) => el.classList.contains('menu-recolhido-real')), true);
  assert.equal(recolhido, true);
  await ctx.close();
  ({ ctx, p } = await nav.abrir(srv.url, { viewport: { width: 1366, height: 900 }, aba: null }));
  await p.waitForFunction(() => document.querySelector('.app-real.menu-recolhido-real'));
  assert.equal(recolhido, true, 'preferência reaplicada em outra sessão');
  await ctx.close();
  ({ ctx, p } = await nav.abrir(srv.url, { viewport: { width: 390, height: 850 } }));
  await p.getByTestId('menu-alternar-real').click();
  await p.getByTestId('nav-clientes').click();
  assert.equal(gravacoes, 1, 'menu temporário do celular não grava preferência desktop');
  await ctx.close();
  assert.deepEqual(nav.erros, []);
  console.log('e2e120 ok: preferência do menu desktop e navegação móvel');
} finally { await nav.b.close(); srv.fechar(); }
