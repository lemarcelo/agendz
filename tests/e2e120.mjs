/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Menu desktop recolhido por padrão com hover suave e recolhimento ao selecionar; sem salvar por usuário.
import assert from 'node:assert/strict';
import { subirServidor, abrirNavegador, id } from './real-util.mjs';

let gravacoes = 0;
const srv = await subirServidor((c, { json }) => {
  if (c.u === '/api/usuarios/me/menu') {
    if (c.m === 'PUT') gravacoes++;
    return json(200, { recolhido: true });
  }
  if (c.u === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
  if (c.u === '/api/profissionais') return json(200, [{ id: id(1), nome: 'Ana', papel: 'dono', atende: true }]);
  if (['/api/agendamentos', '/api/clientes', '/api/servicos', '/api/avisos'].includes(c.u)) return json(200, []);
  return false;
});
const nav = await abrirNavegador();
try {
  let { ctx, p } = await nav.abrir(srv.url, { viewport: { width: 1366, height: 900 }, aba: null });
  await p.getByTestId('agenda-dia').waitFor();
  await p.mouse.move(600, 300);
  await new Promise((r) => setTimeout(r, 350));

  // 1. Padrão no PC: menu recolhido (largura de 68px)
  const boxInicial = await p.locator('.topo').boundingBox();
  assert.equal(Math.round(boxInicial.width), 68, 'menu desktop deve iniciar recolhido com 68px');

  // 2. Hover suave: passar o mouse expande para 220px
  await p.locator('.topo').hover();
  await p.waitForFunction(() => {
    const box = document.querySelector('.topo')?.getBoundingClientRect();
    return box && Math.round(box.width) === 220;
  });
  const boxHover = await p.locator('.topo').boundingBox();
  assert.equal(Math.round(boxHover.width), 220, 'menu desktop deve expandir no hover');

  // 3. Ao selecionar um item do menu, deve recolher suavemente
  await p.getByTestId('nav-clientes').click();
  await p.waitForSelector('[data-testid="tela-clientes"], [data-testid="cli-vazio"]', { timeout: 4000 });
  await p.waitForFunction(() => {
    const box = document.querySelector('.topo')?.getBoundingClientRect();
    return box && Math.round(box.width) === 68;
  });
  const boxAposClique = await p.locator('.topo').boundingBox();
  assert.equal(Math.round(boxAposClique.width), 68, 'menu desktop deve recolher suavemente ao selecionar item');
  assert.equal(gravacoes, 0, 'não grava preferência de menu por usuário no backend');

  await ctx.close();

  // 4. No celular (390px): alternar menu abre gaveta e selecionar recolhe
  ({ ctx, p } = await nav.abrir(srv.url, { viewport: { width: 390, height: 850 } }));
  await p.getByTestId('menu-alternar-real').click();
  await p.getByTestId('nav-clientes').click();
  await p.waitForSelector('[data-testid="tela-clientes"], [data-testid="cli-vazio"]', { timeout: 4000 });
  await ctx.close();

  assert.deepEqual(nav.erros, []);
  console.log('e2e120 ok: menu desktop padrão recolhido, hover suave e recolhimento ao selecionar');
} finally { await nav.b.close(); srv.fechar(); }
