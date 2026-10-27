// Muitos esteticistas: foto circular no calendário, seletor compacto e dia com 15 colunas (computador e celular); perfil atendente.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index.html', import.meta.url).href;
async function abrir(viewport, touch = false) {
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  await p.goto(url);
  return { ctx, p };
}
const semRolagem = async (p, onde) => {
  const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `${onde}: rolagem horizontal (${sw} > ${iw})`);
};

for (const [nome, vp, touch] of [['computador', { width: 1280, height: 800 }, false], ['celular', { width: 390, height: 780 }, true]]) {
  const { ctx, p } = await abrir(vp, touch);
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click();
  // sem foto: inicial e cor própria; com foto: imagem
  await T('nav-equipe').click();
  await T('profissionais-exemplo').click();
  await p.waitForTimeout(200);
  assert.equal(await p.locator('.card-serv').count(), 15, `${nome}: 15 pessoas na equipe`);
  assert.ok(await p.locator('.card-serv img.avatar-foto').count() >= 8, `${nome}: fotos nos cartões`);
  assert.ok(await p.locator('.card-serv .avatar-inicial').count() >= 4, `${nome}: inicial para quem não tem foto`);
  const cores = new Set(await p.locator('.card-serv .avatar-inicial').evaluateAll((els) => els.map((e) => e.style.background)));
  assert.ok(cores.size >= 3, `${nome}: cores diferentes por pessoa`);

  await T('nav-agenda').click();
  // seletor compacto no lugar dos 15 cartões
  await T('seletor-profissionais').waitFor();
  assert.equal(await p.locator('.filtros .filtro').count(), 0, `${nome}: sem 15 cartões lado a lado`);
  await semRolagem(p, `${nome}: agenda`);
  // dia com todos
  await p.getByRole('button', { name: 'Dia', exact: true }).click().catch(() => {});
  await p.waitForTimeout(150);
  const cols = await p.locator('[data-testid^="coluna-"]').count();
  assert.equal(cols, 1, `${nome}: o dia mostra só a agenda de um esteticista (${cols})`);
  await semRolagem(p, `${nome}: dia cheio`);
  // miniatura do esteticista nos eventos
  // semana também aparece no celular (rolagem fica dentro da grade)
  await p.getByRole('button', { name: 'Semana', exact: true }).click();
  await p.waitForTimeout(150);
  assert.ok(await p.getByRole('button', { name: 'Semana', exact: true }).isVisible(), `${nome}: botão Semana visível`);
  assert.ok(await p.locator('.grade-semana').count(), `${nome}: grade da semana`);
  await semRolagem(p, `${nome}: semana`);
  await p.screenshot({ path: new URL(`../shots/semana-${nome}.png`, import.meta.url).pathname });
  await p.getByRole('button', { name: 'Dia', exact: true }).click();
  await p.waitForTimeout(150);
  await p.screenshot({ path: new URL(`../shots/muitos-${nome}.png`, import.meta.url).pathname });

  // seletor: buscar e escolher UM esteticista; escolher outro troca (não soma)
  await T('filtro-abrir').click();
  await T('seletor-painel').waitFor();
  assert.equal(await p.locator('.seletor-item').count(), 15, `${nome}: 15 na lista`);
  assert.equal(await p.locator('.seletor-item[aria-selected="true"]').count(), 1, `${nome}: um marcado`);
  await T('seletor-busca').fill('rafa');
  assert.equal(await p.locator('.seletor-item').count(), 1);
  await p.locator('.seletor-item').first().click();
  await T('seletor-painel').waitFor({ state: 'detached' });
  assert.equal(await p.locator('[data-testid^="coluna-"]').count(), 1, `${nome}: uma coluna`);
  await T('filtro-abrir').click();
  await p.locator('.seletor-item').nth(2).click();
  assert.equal(await p.locator('[data-testid^="coluna-"]').count(), 1, `${nome}: trocou, não somou`);
  assert.equal(await T('filtro-qualquer').count(), 0, `${nome}: não existe mais "Qualquer"`);
  await p.screenshot({ path: new URL(`../shots/seletor-${nome}.png`, import.meta.url).pathname });
  await ctx.close();
}

// atendente: agenda, clientes e serviços; sem relatórios, financeiro, estoque nem estabelecimento; o dono libera menus
{
  const { ctx, p } = await abrir({ width: 1280, height: 800 });
  const T = (id) => p.getByTestId(id);
  await T('demo-davi').click(); await T('nav-equipe').click();
  await T('novo-usuario').click();
  await T('usr-nome').fill('Ana Recepção'); await T('usr-apelido').fill('Ana'); await T('usr-cpf').fill('52998224725');
  await T('usr-email').fill('ana@x.com'); await T('usr-senha').fill('1234');
  await T('usr-papel').selectOption('atendente');
  assert.equal(await p.locator('[data-testid="acesso-relatorios"]').count(), 0, 'relatórios não é opção');
  assert.ok(await T('acesso-agenda').isChecked() && await T('acesso-clientes').isChecked() && await T('acesso-servicos').isChecked());
  assert.ok(!(await T('acesso-financeiro').isChecked()));
  await T('acesso-financeiro').check();
  await T('acesso-servicos').uncheck();
  await T('salvar-usuario').click();
  await p.waitForTimeout(200);
  await T('sair').click();
  await T('login-id').fill('ana'); await T('login-senha').fill('1234'); await T('login-entrar').click();
  await T('nav-agenda').waitFor();
  for (const ok of ['nav-agenda', 'nav-clientes', 'nav-financeiro']) assert.equal(await T(ok).count(), 1, `atendente vê ${ok}`);
  for (const nao of ['nav-relatorios', 'nav-servicos', 'nav-estoque', 'nav-estab', 'nav-equipe']) assert.equal(await T(nao).count(), 0, `atendente não vê ${nao}`);
  // Meus ganhos: só as linhas dela, com período De/Até; nada de relatório geral
  await T('nav-ganhos').click();
  await T('per-de').waitFor(); await T('per-ate').waitFor();
  assert.equal(await T('meu-receber').count(), 1);
  assert.equal(await T('com-total').count(), 0, 'sem o relatório geral de comissões');
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, []);
console.log('e2e17 ok');
