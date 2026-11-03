/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Usa a navegação visível; no painel real móvel, abre primeiro o menu lateral.
export async function acessarSecao(pagina, testid) {
  const destino = pagina.getByTestId(testid);
  await destino.waitFor({ state: 'attached' });
  const menu = pagina.getByTestId('menu-alternar-real');
  if (!(await destino.isVisible()) && await menu.count()) await menu.click();
  await destino.click();
}
