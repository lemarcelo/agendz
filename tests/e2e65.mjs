/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Suporte (chamados) no Artifact: o dono abre um chamado e conversa; o profissional vê só os dele e o dono vê os da loja toda; selo de não lidas no menu;
// fechado/erro aparecem na tela; 390 px sem rolagem lateral; texto de pessoa fica como texto.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { liberarSuporte } from './e2e-util.mjs';

const ok = (m) => console.log('✓', m);
const url = new URL('../dist/index.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  return { ctx, p };
}
const semRolagem = async (p, onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral em ${onde}`);

for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 780 }]) {
  const { ctx, p } = await abrir(vp);
  const T = (id) => p.getByTestId(id);
  // v119: de fábrica só o proprietário abre chamado: o profissional nem vê o menu; o dono libera no cadastro de cada um
  await T('demo-pablo').click(); await T('agenda-topo').waitFor();
  assert.equal(await T('nav-suporte').count(), 0, 'profissional sem a seção não vê o Suporte');
  await T('sair').click();
  await liberarSuporte(p, T, ['Pablo', 'Marcelo']);
  // profissional abre um chamado
  await T('demo-pablo').click(); await T('agenda-topo').waitFor();
  await T('nav-suporte').click();
  await T('sup-vazio').waitFor();
  assert.equal(await T('sup-item').count(), 0);
  await T('sup-novo').click();
  assert.equal(await T('sup-abrir').isDisabled(), true, 'sem assunto e texto o botão fica desligado');
  await T('sup-assunto').fill('<b>Não consigo</b> salvar');
  await T('sup-categoria').selectOption('problema');
  await T('sup-texto').fill('A tela fica branca.\nSegunda linha <script>x</script>');
  await T('sup-abrir').click();
  await T('sup-conversa').waitFor();
  assert.equal(await T('sup-msg').count(), 2, 'a mensagem dele e a resposta automática da demonstração');
  assert.equal(await p.locator('[data-testid=sup-conversa] h3').innerText(), '<b>Não consigo</b> salvar', 'o texto não vira HTML');
  assert.equal(await p.locator('[data-testid=sup-conversa] script').count(), 0);
  assert.match(await T('sup-status').innerText(), /Em atendimento/);
  await T('sup-resposta').fill('Obrigado, aguardo.');
  await T('sup-enviar').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=sup-msg]').length === 3);
  await semRolagem(p, 'conversa');
  await T('sup-voltar').click();
  await T('sup-lista').waitFor();
  assert.equal(await T('sup-item').count(), 1);
  assert.equal(await T('badge-suporte').count(), 0, 'abrir a conversa zerou o selo');
  ok(`${vp.width}px: profissional abre chamado, conversa e volta`);
  await T('sair').click();

  // dono: vê o chamado do profissional (o estado é da loja); outro profissional não vê
  await T('demo-davi').click(); await T('agenda-topo').waitFor();
  await T('nav-suporte').click();
  await T('sup-lista').waitFor();
  assert.equal(await T('sup-item').count(), 1, 'o dono vê o chamado de quem abriu');
  assert.match(await T('sup-item').first().innerText(), /Pablo/, 'o dono vê quem abriu');
  assert.match(await T('suporte').innerText(), /toda a loja/);
  await T('sup-item').first().click();
  await T('sup-conversa').waitFor();
  assert.equal(await T('sup-msg').count(), 3);
  await T('sup-voltar').click();
  await T('sair').click();
  await T('demo-marcelo').click(); await T('agenda-topo').waitFor();
  await T('nav-suporte').click();
  await T('sup-vazio').waitFor();
  assert.equal(await T('sup-item').count(), 0, 'outro profissional não vê o chamado alheio');
  await semRolagem(p, 'lista vazia');
  ok(`${vp.width}px: dono vê os chamados da loja; outro profissional não vê o alheio`);
  await ctx.close();
}
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e65 ok');
