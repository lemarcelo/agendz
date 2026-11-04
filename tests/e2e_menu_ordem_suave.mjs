/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Valida ordem programada do menu com threshold de 10 cliques e atualização suave apenas quando recolhido
import assert from 'node:assert/strict';
import { subirServidor, abrirNavegador, id } from './real-util.mjs';

const srv = await subirServidor((c, { json }) => {
  if (c.u === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
  if (c.u === '/api/profissionais') return json(200, [{ id: id(1), nome: 'Ana', papel: 'dono', atende: true }]);
  if (['/api/agendamentos', '/api/clientes', '/api/servicos', '/api/avisos', '/api/comissoes', '/api/relatorios'].includes(c.u)) return json(200, []);
  return false;
});
const nav = await abrirNavegador();

try {
  const { ctx, p } = await nav.abrir(srv.url, { viewport: { width: 1366, height: 900 }, aba: null });
  await p.getByTestId('agenda-dia').waitFor();
  await p.mouse.move(600, 300);
  await new Promise((r) => setTimeout(r, 350));

  // Padrão PC: recolhido (68px)
  const boxInit = await p.locator('.topo').boundingBox();
  assert.equal(Math.round(boxInit.width), 68, 'menu inicia recolhido');

  const obterOrdem = async () => p.evaluate(() => Array.from(document.querySelectorAll('#menu-secoes-real button')).map((b) => b.getAttribute('data-testid')));
  const ordemInicial = await obterOrdem();
  assert.equal(ordemInicial[0], 'nav-agenda');
  assert.equal(ordemInicial[1], 'nav-clientes');
  assert.equal(ordemInicial[2], 'nav-servicos');

  // Realiza 9 cliques em nav-servicos alternando com nav-agenda
  for (let i = 0; i < 9; i++) {
    await p.locator('.topo').hover();
    await p.waitForFunction(() => Math.round(document.querySelector('.topo')?.getBoundingClientRect().width || 0) === 220);
    await p.getByTestId('nav-servicos').click();
    await p.waitForFunction(() => Math.round(document.querySelector('.topo')?.getBoundingClientRect().width || 0) === 68);
    await p.locator('.topo').hover();
    await p.waitForFunction(() => Math.round(document.querySelector('.topo')?.getBoundingClientRect().width || 0) === 220);
    await p.getByTestId('nav-agenda').click();
    await p.waitForFunction(() => Math.round(document.querySelector('.topo')?.getBoundingClientRect().width || 0) === 68);
  }

  // Com 9 cliques em servicos e 9 em agenda (ambos < 10), servicos NÃO deve ter passado à frente de agenda
  const ordemApos9 = await obterOrdem();
  assert.equal(ordemApos9[0], 'nav-agenda', 'com < 10 cliques agenda se mantém primeiro na ordem base');

  // Agora dá o 10º clique em nav-servicos
  await p.locator('.topo').hover();
  await p.waitForFunction(() => Math.round(document.querySelector('.topo')?.getBoundingClientRect().width || 0) === 220);
  await p.getByTestId('nav-servicos').click();
  // Menu recolhe suavemente
  await p.waitForFunction(() => Math.round(document.querySelector('.topo')?.getBoundingClientRect().width || 0) === 68);

  // Ao recolher, servicos atingiu 10 cliques (>= 10) e sobe para o topo!
  const ordemApos10 = await obterOrdem();
  assert.equal(ordemApos10[0], 'nav-servicos', 'com 10 cliques o item sobe para o topo do menu');

  await ctx.close();
  assert.deepEqual(nav.erros, []);
  console.log('e2e_menu_ordem_suave ok: threshold de 10 cliques e atualização somente ao recolher sem saltos');
} finally {
  await nav.b.close();
  srv.fechar();
}
