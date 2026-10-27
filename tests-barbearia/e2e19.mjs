// Atendimento local e comissão no navegador: botão à esquerda de "Novo agendamento", barbeiro vê só o que recebe, proprietário vê e paga (computador e celular).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const url = new URL('../dist/index-barbearia.html', import.meta.url).href;
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
  // --- barbeiro: registra um atendimento local e vê só o valor a receber ---
  {
    const { ctx, p } = await abrir(vp, touch);
    const T = (id) => p.getByTestId(id);
    await T('demo-kiko').click();
    assert.equal(await T('atender').count(), 1, `${nome}: um só botão Atender`);
    await semRolagem(p, `${nome}: agenda`);
    await T('atender').click();
    await T('salvar-atender').click();
    assert.match(await p.locator('.aviso, [role="alert"]').first().innerText(), /ao menos um serviço/i);
    const idsAntes = await p.locator('[data-testid^="atender-srv-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    const ultimo = idsAntes.at(-1);
    await T(ultimo).check();
    await T('atender-nome').fill('Seu Zé');
    await T('atender-telefone').fill('54996338812'); // telefone de um cliente cadastrado (Igor)
    assert.match(await T('atender-vinculo').innerText(), /Igor/, `${nome}: mostra o cliente que será vinculado`);
    await T('atender-telefone').fill('51988887777');
    assert.equal(await T('atender-vinculo').count(), 0, `${nome}: número sem cadastro não vincula`);
    await semRolagem(p, `${nome}: modal local`);
    await T('salvar-atender').click();
    await T('salvar-atender').waitFor({ state: 'detached' });
    // serviços mais feitos primeiro (histórico somado): o que acabou de ser registrado sobe na lista
    await T('atender').click();
    const idsDepois = await p.locator('[data-testid^="atender-srv-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    assert.ok(idsDepois.indexOf(ultimo) < idsAntes.indexOf(ultimo), `${nome}: o serviço que acabou de ser feito sobe na lista (histórico somado)`);
    await p.getByRole('button', { name: 'Cancelar' }).click();
    // nome + telefone novo: o cadastro é criado sozinho
    await T('nav-clientes').click();
    assert.ok((await p.getByText('Seu Zé').count()) >= 1, `${nome}: nome + telefone novo cria o cadastro`);
    // relatório do barbeiro: só o que ele recebe
    await T('nav-relatorios').click();
    await T('meu-receber').waitFor();
    const txt = await p.locator('.principal').innerText();
    assert.match(txt, /A receber/i); assert.match(txt, /Seu Zé/);
    assert.doesNotMatch(txt, /Custo de materiais|Estabelecimento|Acréscimos|Total do mês/i, `${nome}: nada da parte do estabelecimento`);
    assert.equal(await p.getByRole('tab', { name: 'Comissões' }).count(), 0, `${nome}: barbeiro não vê a aba Comissões`);
    await semRolagem(p, `${nome}: relatório do barbeiro`);
    await ctx.close();
  }
  // --- proprietário: vê a comissão, a parte do estabelecimento e paga ---
  {
    const { ctx, p } = await abrir(vp, touch);
    const T = (id) => p.getByTestId(id);
    await T('demo-alan').click();
    await T('atender').click();
    await T('atender-profissional').selectOption('u-kiko');
    await p.locator('[data-testid^="atender-srv-"]').first().check();
    await T('salvar-atender').click();
    await T('salvar-atender').waitFor({ state: 'detached' });
    await T('nav-relatorios').click();
    await p.getByRole('tab', { name: 'Comissões' }).click();
    await T('com-apagar').waitFor();
    const antes = await T('com-apagar-u-kiko').innerText();
    assert.match(await T('com-tabela').innerText(), /Estabelecimento/i);
    await T('com-detalhe-u-kiko').click();
    await T('com-detalhe').waitFor();
    await semRolagem(p, `${nome}: comissões`);
    await T('com-pagar-u-kiko').click();
    await T('com-confirmar-u-kiko').click();
    await p.waitForTimeout(150);
    assert.match(await T('com-apagar-u-kiko').innerText(), /R\$\s*0,00/, `${nome}: depois de pagar, nada a pagar (antes: ${antes})`);
    await T('nav-financeiro').click();
    await p.getByRole('tab', { name: 'Lançamentos' }).click();
    assert.ok(await p.getByText(/Comissão de Kiko/).count() > 0, `${nome}: despesa lançada no financeiro`);
    await ctx.close();
  }
}

await b.close();
assert.deepEqual(erros, []);
console.log('e2e19 ok');
