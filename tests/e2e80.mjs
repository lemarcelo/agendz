/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Auditoria do Artifact (Agenda, Atender e Clientes): o que os testes de "caminho feliz" não pegam.
// Dado vazio e dado estranho (sem serviço, telefone curto, sem cadastro, busca sem resultado, dia livre, muitos atendimentos), mensagem de erro VISÍVEL na tela
// (dentro da janela, no 390 px), duplo clique (cria uma vez só), estado que não vaza entre aberturas, estado que sobrevive quando o cartão sai da lista
// (cancelar → linha "Cancelado (N)" → reativar) e texto/rótulo certo, em computador e 390 px, tema claro e escuro. Relógio fixo; loja Dalforno (Alan).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const b = await chromium.launch();
const erros = [];
const ok = (m) => console.log('✓', m);
const TELAS = [{ nome: 'desktop', w: 1366, h: 820 }, { nome: '390', w: 390, h: 800 }];

async function rodar(tela, tema) {
  const rot = `${tela.nome}/${tema}`;
  const touch = tela.w < 700;
  const ctx = await b.newContext({ viewport: { width: tela.w, height: tela.h }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push(`${rot} PAGE: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(`${rot} ${m.text()}`); });
  p.on('dialog', async (d) => { erros.push(`${rot} DIALOG: ${d.message()}`); await d.dismiss(); });
  await p.goto(new URL('../dist/index.html', import.meta.url).href);
  await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t === 'claro' ? 'light' : 'dark'), tema);
  const T = (id) => p.getByTestId(id);
  await T('demo-loja-dalforno').click(); await T('demo-alan').click(); await T('nav-agenda').click();
  await p.locator('button.cartao').first().waitFor();

  const total = async () => Number(await T('dia-total').innerText());
  const semRolagem = async (onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${rot}: sem rolagem lateral em ${onde}`);
  const visivel = async (loc, onde) => { // o elemento existe, está visível e dentro da janela (espera a rolagem até a vista)
    await loc.waitFor();
    let bx;
    for (let i = 0; i < 20; i++) {
      bx = await loc.boundingBox(); const vp = p.viewportSize();
      if (bx && bx.x >= 0 && bx.x + bx.width <= vp.width + 1 && bx.y >= 0 && bx.y + bx.height <= vp.height + 1) return;
      await p.waitForTimeout(100);
    }
    assert.fail(`${rot}: ${onde} fora da tela ${JSON.stringify(bx)}`);
  };
  const limpar = async () => { for (let i = 0; i < 3 && await p.locator('[role=dialog]').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(120); } };
  const alerta = (texto) => p.locator('[role=dialog] [role=alert]', { hasText: texto });
  const nClientes = async () => { await limpar(); await T('nav-clientes').click(); const n = await p.locator('tbody tr').count(); await T('nav-agenda').click(); return n; };

  // ---------- ATENDER ----------
  const base = await total();
  await T('atender').click();
  await T('salvar-atender').click();
  await visivel(alerta('Escolha ao menos um serviço ou um produto.'), 'erro de Atender sem serviço');
  assert.equal(await total(), base, `${rot}: Atender recusado não cria nada`);
  ok(`${rot}: Atender sem serviço nem produto mostra o erro e não cria`);

  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-nome').fill('Duplo Clique');
  await T('atender-telefone').fill('123');
  await T('salvar-atender').click();
  await visivel(alerta('Telefone com DDD e número (10 ou 11 dígitos).'), 'erro de telefone curto');
  assert.equal(await p.locator('button.cartao', { hasText: 'Duplo Clique' }).count(), 0, `${rot}: telefone curto não cria`);
  await T('atender-telefone').fill('(55) 99888-7766');
  await T('salvar-atender').dblclick();
  await T('salvar-atender').waitFor({ state: 'detached' });
  assert.equal(await p.locator('button.cartao', { hasText: 'Duplo Clique' }).count(), 1, `${rot}: duplo clique cria um só`);
  assert.equal(await total(), base + 1, `${rot}: o total do dia sobe 1`);
  ok(`${rot}: Atender com telefone curto é recusado e o duplo clique cria um só`);

  // reabrir: nada vaza da vez anterior
  await T('atender').click();
  assert.equal(await T('atender-nome').inputValue(), '', `${rot}: nome limpo ao reabrir`);
  assert.equal(await T('atender-telefone').inputValue(), '', `${rot}: telefone limpo ao reabrir`);
  assert.equal(await p.locator('[data-testid^="atender-srv-"]:checked').count(), 0, `${rot}: nenhum serviço marcado ao reabrir`);
  assert.equal(await p.locator('[role=dialog] [role=alert]').count(), 0, `${rot}: sem erro antigo ao reabrir`);
  // preenche e desiste (Escape): a próxima abertura também vem limpa
  await p.locator('[data-testid^="atender-srv-"]').first().check(); await T('atender-nome').fill('Desisti');
  await limpar();
  await T('atender').click();
  assert.equal(await T('atender-nome').inputValue(), '', `${rot}: desistir não deixa rascunho`);
  await limpar();
  assert.equal(await p.locator('button.cartao', { hasText: 'Desisti' }).count(), 0, `${rot}: quem desistiu não vira atendimento`);
  ok(`${rot}: Atender reaberto vem limpo (sem erro, sem rascunho)`);

  // sem cadastro (só nome) × com cadastro (nome + telefone novo)
  const antes = await nClientes();
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-nome').fill('Passante Sem Cadastro');
  await T('salvar-atender').click(); await T('salvar-atender').waitFor({ state: 'detached' });
  assert.equal(await nClientes(), antes, `${rot}: só o nome não cria cadastro de cliente`);
  await p.locator('button.cartao', { hasText: 'Passante Sem Cadastro' }).first().click();
  const gaveta = await T('gaveta').innerText();
  assert.match(gaveta, /Passante Sem Cadastro/, `${rot}: a ficha mostra o nome avulso`);
  assert.match(gaveta, /Local \(balcão\)/, `${rot}: origem local`);
  assert.equal(await T('enviar-msg').count(), 0, `${rot}: sem cadastro não oferece mensagem ao cliente`);
  await limpar();
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-nome').fill('Cliente Novo Atender'); await T('atender-telefone').fill('(55) 99555-4433');
  await T('salvar-atender').click(); await T('salvar-atender').waitFor({ state: 'detached' });
  assert.equal(await nClientes(), antes + 1, `${rot}: nome + telefone cria o cadastro`);
  ok(`${rot}: sem telefone = sem cadastro; com telefone = cadastro novo`);

  // muitos atendimentos no mesmo dia
  for (let i = 0; i < 8; i++) {
    await limpar(); await T('atender').click();
    await p.locator('[data-testid^="atender-srv-"]').first().check();
    await T('atender-nome').fill(`Fila ${i + 1}`);
    await T('salvar-atender').click(); await T('salvar-atender').waitFor({ state: 'detached' });
  }
  await limpar();
  assert.equal(await p.locator('button.cartao', { hasText: /^.*Fila \d/ }).count(), 8, `${rot}: os 8 atendimentos aparecem`);
  assert.equal(await total(), base + 1 + 2 + 8, `${rot}: total do dia confere (${base}+1+2+8)`);
  await semRolagem('Agenda com muitos cartões');
  ok(`${rot}: 8 atendimentos seguidos, total do dia confere, sem rolagem lateral`);

  // ---------- AGENDA: cancelar → linha "Cancelado (N)" → reativar ----------
  const alvo = p.locator('button.cartao', { hasText: 'Fila 1' }).first();
  const t0 = await total();
  await alvo.click();
  await T('acao-cancelar').click();
  await T('acao-cancelar-sim').waitFor();
  await p.getByRole('button', { name: 'Voltar' }).last().click();
  assert.equal(await total(), t0, `${rot}: "Voltar" não cancela`);
  await T('acao-cancelar').click();
  await T('acao-cancelar-sim').dblclick(); // duplo clique: cancela uma vez só
  await p.waitForTimeout(300); await limpar();
  assert.equal(await total(), t0 - 1, `${rot}: cancelar tira um do total (duplo clique conta uma vez)`);
  assert.equal(await p.locator('button.cartao', { hasText: 'Fila 1' }).count(), 0, `${rot}: cartão cancelado sai da lista`);
  assert.match(await T('cancelados-resumo').innerText(), /Cancelado \(1\)/, `${rot}: linha "Cancelado (1)"`);
  await T('cancelados-resumo').click();
  await T('cancelados-cartoes').locator('button.cartao', { hasText: 'Fila 1' }).click();
  assert.match(await T('gaveta').innerText(), /Cancelado/, `${rot}: a ficha mostra Cancelado`);
  await limpar();
  // agendamento de verdade (não balcão): cancelar e reativar pela ficha; a linha "Cancelado (N)" acompanha
  const marcado = p.locator('button.cartao', { hasText: 'Marcelo' }).first();
  const t1 = await total();
  await marcado.click(); await T('acao-cancelar').click(); await T('acao-cancelar-sim').click();
  await p.waitForTimeout(250); await limpar();
  assert.match(await T("cancelados-resumo").innerText(), /Cancelados \(2\)/, `${rot}: linha "Cancelado (2)" era: ${await T("cancelados-resumo").innerText().catch(() => "nenhuma")} / dialogos ${await p.locator("[role=dialog]").count()}`);
  assert.equal(await total(), t1 - 1, `${rot}: o total desce`);
  if (!(await T('cancelados-cartoes').count())) await T('cancelados-resumo').click();
  await T('cancelados-cartoes').locator('button.cartao', { hasText: 'Marcelo' }).first().click();
  await T('gaveta').getByRole('button', { name: /Mais opções/ }).click();
  await T('corrigir-status').selectOption({ label: 'Confirmado' });
  await p.waitForTimeout(250); await limpar();
  assert.match(await T('cancelados-resumo').innerText(), /Cancelado \(1\)/, `${rot}: reativar volta a "Cancelado (1)"`);
  assert.equal(await total(), t1, `${rot}: reativar devolve o cartão ao total`);
  assert.equal(await p.locator('button.cartao', { hasText: 'Marcelo' }).count() > 0, true, `${rot}: o cartão voltou à lista`);
  ok(`${rot}: cancelar (Voltar e duplo clique), linha "Cancelado (N)" e reativar`);

  // dia livre: algum dia dos próximos sem agendamento mostra o texto certo
  let livre = false;
  for (let i = 0; i < 14 && !livre; i++) {
    await p.getByRole('button', { name: 'Próximo', exact: true }).click();
    livre = (await p.getByText('Nenhum agendamento nesta data.').count()) > 0;
  }
  assert.ok(livre, `${rot}: existe um dia livre nas próximas 2 semanas`);
  assert.equal(await p.getByText('Dia livre', { exact: true }).count() > 0, true, `${rot}: título "Dia livre"`);
  await semRolagem('dia livre');
  ok(`${rot}: dia sem agendamento mostra "Dia livre"`);

  // ---------- CLIENTES ----------
  await T('nav-clientes').click();
  const busca = p.getByLabel('Buscar cliente');
  await busca.fill('zzzz-nao-existe');
  await p.getByText('Nenhum cliente encontrado').waitFor();
  await busca.fill('');
  await T('novo-cliente').click();
  await T('salvar-cliente').click();
  await visivel(alerta('Informe o nome ou apelido do cliente.'), 'erro: nome vazio');
  await T('cli-nome').fill('Teste Um');
  await T('salvar-cliente').click();
  await visivel(alerta('Informe o telefone com DDD.'), 'erro: telefone vazio');
  await T('cli-tel').fill('(55) 99777-6655');
  const cpf = p.locator('[role=dialog] input[inputmode=numeric]').first();
  await cpf.fill('111.111.111-11'); await T('salvar-cliente').click();
  await visivel(alerta('CPF inválido.'), 'erro: CPF');
  await cpf.fill('');
  await p.locator('[role=dialog] input[type=date]').fill('2030-01-01'); await T('salvar-cliente').click();
  await visivel(alerta('Data de nascimento inválida.'), 'erro: nascimento no futuro');
  await p.locator('[role=dialog] input[type=date]').fill('');
  await T('salvar-cliente').dblclick(); // duplo clique: um só cadastro
  await T('salvar-cliente').waitFor({ state: 'detached' });
  await busca.fill('Teste Um');
  assert.equal(await p.locator('tbody tr').count(), 1, `${rot}: duplo clique em Salvar cria um cliente só`);
  await T('novo-cliente').click();
  await T('cli-nome').fill('teste um'); await T('cli-tel').fill('55997776655');
  await T('salvar-cliente').click();
  await visivel(alerta('Já existe um cliente com esse nome e telefone.'), 'erro: duplicado');
  await limpar();
  assert.equal(await p.locator('tbody tr').count(), 1, `${rot}: duplicado não cria`);
  ok(`${rot}: Clientes: busca vazia, erros na tela (nome, telefone, CPF, nascimento, duplicado) e duplo clique`);

  // editar sem salvar não muda; editar e salvar aparece na Agenda (o nome muda no cartão)
  await busca.fill('Teste Um');
  await p.getByRole('button', { name: 'Editar Teste Um' }).click();
  await T('cli-nome').fill('Nome Que Nao Vale');
  await limpar();
  assert.equal(await p.getByText('Nome Que Nao Vale').count(), 0, `${rot}: Escape descarta a edição`);
  await busca.fill('Cliente Novo Atender');
  await p.getByRole('button', { name: 'Editar Cliente Novo Atender' }).click();
  await T('cli-nome').fill('Cliente Renomeado');
  await T('salvar-cliente').click(); await T('salvar-cliente').waitFor({ state: 'detached' });
  await semRolagem('Clientes');
  await T('nav-agenda').click();
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  assert.equal(await p.locator('button.cartao', { hasText: 'Cliente Renomeado' }).count(), 1, `${rot}: o nome novo aparece no cartão da Agenda`);
  assert.equal(await p.locator('button.cartao', { hasText: 'Cliente Novo Atender' }).count(), 0, `${rot}: o nome velho sumiu`);
  ok(`${rot}: editar descarta com Escape e o nome novo vai para a Agenda`);
  await ctx.close();
}

for (const tela of TELAS) for (const tema of ['claro', 'escuro']) await rodar(tela, tema);
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e80 ok');
