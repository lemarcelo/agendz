/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Plano na ficha do cliente (Artifact): Apex, Dalforno e Offbox × claro/escuro × 390 px (fonte larga) e desktop. Sem plano cadastrado (atalho para Planos), adicionar pela ficha
// (aparece na aba Planos), mensalidade, horários fixos, trocar de plano com motivo, encerrar (com dívida nas barbearias: trava plano novo até quitar), cliente que já tem plano,
// cliente com cadastro incompleto, textos conferidos e quem não tem a seção Planos não vê o bloco. Relógio fixo.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const ok = (m) => console.log('✓', m);
const base = new URL('../dist/index.html', import.meta.url).href;
const b = await chromium.launch();
const erros = [];
const LOJAS = [
  { loja: 'apex', dono: 'demo-davi', semSecao: 'demo-pablo', divida: false },
  { loja: 'dalforno', dono: 'demo-alan', semSecao: 'demo-kiko', divida: true },
  { loja: 'offbox', dono: 'demo-alan', semSecao: 'demo-kiko', divida: true },
];
const TELAS = [{ nome: '390', w: 390, h: 800 }, { nome: 'desktop', w: 1366, h: 820 }];

async function rodar({ loja, dono, semSecao, divida }, tela, modo) {
  const rotulo = `${loja}/${tela.nome}/${modo}`;
  const touch = tela.w < 700;
  const ctx = await b.newContext({ viewport: { width: tela.w, height: tela.h }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-12T07:00:00-03:00')); // segunda-feira
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push(`PAGE ${rotulo}: ${e.message}`));
  p.on('dialog', async (d) => { erros.push(`DIALOG ${rotulo}: ${d.message()}`); await d.dismiss(); });
  await p.goto(`${base}?loja=${loja}`);
  await p.evaluate((m) => document.documentElement.setAttribute('data-theme', m === 'claro' ? 'light' : 'dark'), modo);
  if (touch) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  const T = (id) => p.getByTestId(id);
  const semRolagem = async (onde) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${rotulo}: rolagem lateral em ${onde}`);
  const ficha = async (nome = 'Igor Filipin') => { await T('nav-clientes').click(); await p.getByRole('button', { name: `Editar ${nome}` }).click(); await T('plano-cliente').waitFor(); };
  const fecharFicha = async () => { await p.getByRole('button', { name: 'Fechar' }).last().click(); await T('plano-cliente').waitFor({ state: 'detached' }); };
  const abaPlanos = async (nome) => { await p.getByRole('tab', { name: nome, exact: true }).click().catch(async () => { await p.getByRole('button', { name: nome, exact: true }).click(); }); };
  const editar = async () => { if (!(await T('plano-cli-editar-acoes').count())) await T('plano-cli-editar').click(); };

  await T(dono).click(); await T('agenda-topo').waitFor();

  // ---- 1. sem plano cadastrado: aviso com atalho para a aba Planos
  await ficha();
  await T('plano-cli-vazio').waitFor();
  assert.match(await T('plano-cli-vazio').innerText(), /Sem plano/);
  assert.equal(await T('plano-cli-adicionar').count(), 0, `${rotulo}: sem plano cadastrado não há Adicionar`);
  assert.match(await T('plano-cli-sem-catalogo').innerText(), /Nenhum plano cadastrado ainda\. Crie um na aba Planos/);
  await semRolagem('ficha sem plano cadastrado');
  await T('plano-cli-ir-planos').click();
  await T('tela-planos').waitFor();
  assert.equal(await T('plano-cliente').count(), 0, `${rotulo}: a ficha fechou ao ir para Planos`);

  // ---- 2. dois planos no catálogo (o 1º com 1 atendimento por mês, sem intervalo)
  await abaPlanos('Planos');
  const criar = async (nome, cortes, extra) => {
    await T('novo-plano').click();
    await T('plano-nome').fill(nome); await T('plano-preco').fill('75'); await T('plano-cortes').fill(String(cortes));
    if (extra) await extra();
    await p.locator('[data-testid^="plano-srv-"]').first().check();
    await T('salvar-plano').click();
    await T('planos-lista').getByText(nome).waitFor();
  };
  await criar('Plano A', 1, async () => { await T('plano-intervalo').fill('0'); });
  await criar('Plano B', 2);
  ok(`${rotulo}: dois planos criados`);

  // ---- 3. adicionar pela ficha; cliente com plano ativo não assina outro
  await ficha();
  await T('plano-cli-adicionar').click();
  await semRolagem('Adicionar plano');
  await T('plano-cli-plano').selectOption({ index: 0 });
  await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  assert.match(await T('plano-cli-aviso').innerText(), /Plano adicionado\. Registre a mensalidade/);
  assert.equal(await T('plano-cli-nome').innerText(), 'Plano A');
  assert.match(await T('plano-cli-venc').innerText(), /Aguardando a primeira mensalidade · vence dia 5/);
  assert.equal(await T('plano-cli-adicionar').count(), 0, `${rotulo}: com plano ativo não há Adicionar`);
  assert.equal(await T('plano-cli-vazio').count(), 0);
  await semRolagem('ficha com plano');
  // a confirmação mora na tela pai: continua ali depois que o bloco recarrega (registrar mensalidade abre e fecha o modal)
  await editar();
  await T('plano-cli-mensalidade').click();
  await T('salvar-mensalidade').click();
  await T('plano-cli-saldo').waitFor();
  assert.match(await T('plano-cli-aviso').innerText(), /Mensalidade de .*\/2026 registrada/);
  assert.match(await T('plano-cli-saldo').innerText(), /Atendimentos que restam: 1 de 1/);
  assert.match(await T('plano-cli-venc').innerText(), /paga · próxima: dia 5 de/);
  ok(`${rotulo}: adicionar + mensalidade pela ficha`);

  // ---- 4. horários fixos: define e remove (volta a "nenhum")
  await editar();
  await T('plano-cli-fixos-btn').click();
  await T('fixo-add').click();
  await semRolagem('Horários fixos');
  await T('salvar-fixos').click();
  await T('plano-cli-fixos').waitFor();
  assert.match(await T('plano-cli-aviso').innerText(), /Horários fixos salvos/);
  assert.match(await T('plano-cli-fixos').innerText(), /Horários fixos: .*\d\d:\d\d/);
  await editar();
  await T('plano-cli-fixos-btn').click();
  await T('fixo-remover-0').click(); await T('salvar-fixos').click();
  await p.waitForFunction(() => /nenhum/.test(document.querySelector('[data-testid="plano-cli-fixos"]')?.textContent || ''));
  ok(`${rotulo}: horários fixos pela ficha`);

  // ---- 5. aparece na aba Planos
  await fecharFicha();
  await T('nav-planos').click(); await T('tela-planos').waitFor();
  await abaPlanos('Assinaturas');
  await T('tabela-assinaturas').getByText('Igor').first().waitFor();
  assert.match(await T('tabela-assinaturas').innerText(), /Plano A/);
  ok(`${rotulo}: a assinatura aparece na aba Planos`);

  if (divida) {
    // ---- 6. dois atendimentos com o plano (o 2º adiantado, sem pagar) → trocar bloqueado e encerrar deixa dívida
    const atender = async (profIndex) => {
      await T('nav-agenda').click(); await T('atender').click();
      await T('atender-cliente-abrir').click(); await T('atender-cliente-c-igor').click();
      await p.locator('[data-testid^="atender-srv-"]').first().check();
      await T('atender-profissional').selectOption({ index: profIndex });
      await T('atender-agora').click();
      await T('salvar-atender').click();
      await T('salvar-atender').waitFor({ state: 'detached' });
    };
    await atender(0); await atender(1);
    await ficha();
    assert.match(await T('plano-cli-saldo').innerText(), /Atendimentos que restam: 0 de 1/);
    await T('plano-cli-editar').click();
    assert.equal(await T('plano-cli-trocar').isDisabled(), true, `${rotulo}: trocar bloqueado com atendimento adiantado`);
    assert.match(await T('plano-cli-troca-bloqueada').innerText(), /trocar agora deixaria dívida/);
    await T('plano-cli-encerrar').click();
    await T('confirmar-encerrar').click();                 // sem motivo
    assert.match(await p.getByRole('alert').innerText(), /motivo/i);
    await T('encerrar-motivo').fill('abc'); await T('confirmar-encerrar').click();
    assert.match(await p.getByRole('alert').innerText(), /motivo/i);
    await T('encerrar-motivo').fill('cliente mudou de cidade'); await T('confirmar-encerrar').click();
    await T('plano-cli-vazio').waitFor();
    assert.match(await T('plano-cli-aviso').innerText(), /Plano encerrado\. 1 atendimento\(s\) adiantado\(s\) ficaram como dívida\./);
    assert.match(await T('plano-cliente').innerText(), /devendo 1 atendimento e não pode assinar outro até quitar/);
    assert.equal(await p.locator('[data-testid^="plano-cli-hist-"]').count(), 1);
    await semRolagem('ficha com dívida');
    await T('plano-cli-adicionar').click(); await T('plano-cli-salvar').click();
    assert.match(await T('plano-cli-erro-form').innerText(), /ainda não quitou/);
    await p.getByRole('button', { name: 'Cancelar' }).last().click();
    await p.locator('[data-testid^="plano-cli-quitar-"]').click();
    await T('plano-cli-adicionar').waitFor();
    assert.match(await T('plano-cli-aviso').innerText(), /Dívida quitada/);
    ok(`${rotulo}: encerrar com dívida trava plano novo até quitar`);
  } else {
    // estética: encerrar sem dívida
    await ficha();
    await T('plano-cli-encerrar').click();
    await T('encerrar-motivo').fill('cliente mudou de cidade'); await T('confirmar-encerrar').click();
    await T('plano-cli-vazio').waitFor();
    assert.match(await T('plano-cli-aviso').innerText(), /^Plano encerrado\.$/);
    ok(`${rotulo}: encerrar pela ficha`);
  }

  // ---- 7. adicionar o plano B e trocar por A com motivo (histórico curto)
  await T('plano-cli-adicionar').click();
  await T('plano-cli-plano').selectOption({ label: await T('plano-cli-plano').locator('option').nth(1).innerText() });
  await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  assert.equal(await T('plano-cli-nome').innerText(), 'Plano B');
  await editar();
  await T('plano-cli-trocar').click();
  await semRolagem('Trocar de plano');
  assert.equal(await T('plano-cli-plano').locator('option').count(), 1, `${rotulo}: a troca não oferece o plano atual`);
  await T('plano-cli-salvar').click();                        // sem motivo
  assert.match(await T('plano-cli-erro-form').innerText(), /motivo da troca \(5 a 200 letras\)/);
  await T('plano-cli-motivo').fill('mudou de objetivo'); await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  assert.match(await T('plano-cli-aviso').innerText(), /Plano trocado\./);
  assert.equal(await T('plano-cli-nome').innerText(), 'Plano A');
  assert.ok((await p.locator('[data-testid^="plano-cli-hist-"]').count()) >= 1);
  assert.match(await T('plano-cli-historico').innerText(), /Plano B · encerrado em /);
  ok(`${rotulo}: trocar de plano com motivo`);
  await fecharFicha();

  // ---- 8. cliente com cadastro incompleto (sem CPF nem nascimento) também pode ter plano
  await ficha('Jon Paul Frigo');
  await T('plano-cli-adicionar').click(); await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  assert.equal(await T('plano-cli-nome').innerText(), 'Plano A');
  ok(`${rotulo}: cliente sem CPF nem nascimento assina`);
  await fecharFicha();

  // ---- 9. quem não tem a seção Planos não vê o bloco
  await T('sair').click();
  await T(semSecao).click(); await T('agenda-topo').waitFor();
  await T('nav-clientes').click();
  await p.getByRole('button', { name: 'Editar Igor Filipin' }).click();
  await p.getByTestId('cli-nome').waitFor();
  assert.equal(await T('plano-cliente').count(), 0, `${rotulo}: sem a seção Planos o bloco não aparece`);
  assert.equal(await T('nav-planos').count(), 0);
  ok(`${rotulo}: sem a seção Planos não vê o bloco`);
  await ctx.close();
}

const FILTRO = process.env.E90 ? process.env.E90.split("/") : null;
for (const l of LOJAS) for (const t of TELAS) for (const m of ["claro", "escuro"]) {
  if (FILTRO && (FILTRO[0] !== l.loja || FILTRO[1] !== t.nome || FILTRO[2] !== m)) continue;
  // o fluxo completo roda em todas as combinações; cada uma começa de uma loja nova (estado em memória)
  await rodar(l, t, m);
}
await b.close();
assert.deepEqual(erros, [], erros.join('\n'));
ok('sem exceção nem diálogo');
