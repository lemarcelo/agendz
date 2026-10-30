/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Avaliações (F5, fase 1) no Artifact. Relógio fixo; coleta pageerror, console e dialog.
// A) Fluxo completo nas 3 lojas × claro/escuro × 390 px (fonte larga) e desktop: concluir atendimento → estrela → wa.me com texto e link (e link copiado)
//    → abrir o link → avaliar → painel mostra; anônimo com a regra da loja desligada (DOM sem o nome) e ligada (nome + "(avaliado como anônimo)").
// B) Casos de borda (uma loja): token errado e vencido, link usado de novo, estrela sem cadastro / sem telefone válido / cliente que não quer mensagens,
//    cartões sem estrela, permissão (profissional só as suas; atendente sem a seção; dono libera), ocultar com motivo, avaliações no cadastro do serviço,
//    fila em lote (período, contagens, Próximo, enviado, pular, pausa, encerrar).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { salvarAtender } from './e2e-util.mjs';

const ok = (m) => console.log('✓', m);
const URL_APP = new URL('../dist/index.html', import.meta.url).href;
const ERRO_GENERICO = 'Este link de avaliação não é válido ou já foi usado.';
const HOJE = new Date('2026-10-12T07:00:00-03:00');
const b = await chromium.launch();
const erros = [];

async function abrir({ w, h, modo }, loja) {
  const touch = w < 700;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await ctx.clock.setFixedTime(HOJE);
  // O clique no link do WhatsApp é interceptado: guarda o endereço (nunca navega, nunca whatsapp://).
  await ctx.addInitScript(() => { window.__wa = []; const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (/^(https:\/\/wa\.me|whatsapp:)/.test(this.href)) { window.__wa.push({ href: this.href, alvo: this.target, rel: this.rel }); return; } return c.call(this); }; });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(URL_APP);
  await p.evaluate((m) => document.documentElement.setAttribute('data-theme', m === 'claro' ? 'light' : 'dark'), modo);
  if (w < 700) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' }); // fonte larga, a do CI
  await p.getByTestId(`demo-loja-${loja}`).click();
  return { ctx, p, T: (id) => p.getByTestId(id) };
}
const semRolagem = async (p, rotulo) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `sem rolagem lateral: ${rotulo}`);
const entrar = async (T, id) => { await T(`demo-${id}`).click(); await T('agenda-topo').waitFor(); };
const todos = async (T) => { if (!(await T('filtro-todos').isVisible().catch(() => false))) await T('filtro-abrir').click(); await T('filtro-todos').click(); };
const sair = async (T) => { await T('sair').click(); await T('login-id').waitFor(); };
const wa = (p) => p.evaluate(() => window.__wa);

// Lança um atendimento de agora (concluído) pelo Atender. `nome`/`telefone` opcionais; `profissional` = posição na lista; `quando` = data AAAA-MM-DD retroativa.
async function lancar(p, T, { nome, telefone, profissional, quando } = {}) {
  await T('atender').click();
  const srv = p.locator('[data-testid^="atender-srv-"]').first();
  const servicoId = (await srv.getAttribute('data-testid')).replace('atender-srv-', '');
  await srv.check();
  if (nome) await T('atender-nome').fill(nome);
  if (telefone) await T('atender-telefone').fill(telefone);
  if (profissional !== undefined) {
    const sel = T('atender-profissional');
    const val = await sel.locator('option').nth(profissional).getAttribute('value');
    await sel.selectOption(val);
  }
  if (quando) {
    await T('atender-quando').click(); await T('atender-data').fill(quando);
    await T('hora-h').fill('10'); await T('hora-m').fill('00');
    await T('atender-motivo-retro').fill('Esqueci de lançar');
  }
  await salvarAtender(p);
  await T('salvar-atender').waitFor({ state: 'detached' });
  return servicoId;
}
const cartaoDe = (p, nome) => p.locator('.cartao-bloco', { has: p.locator('[data-testid="cartao-cliente"]', { hasText: nome }) }).first();
// Texto da mensagem aberta no WhatsApp (decodificado) e o link de avaliação dentro dela.
const mensagemWa = async (p, i = -1) => {
  const l = await wa(p); const e = l.at(i);
  const url = new URL(e.href);
  const texto = url.searchParams.get('text');
  const link = /(\S*#avaliar\S*)/.exec(texto)?.[1] || '';
  return { e, url, texto, link, hash: link ? link.slice(link.indexOf('#')) : '', numero: url.pathname.slice(1) };
};
const avaliarPeloLink = async (p, T, hash, { estrelas = 5, texto = '', anonimo = false } = {}) => {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await T('pagina-avaliar').waitFor(); await T('av-formulario').waitFor();
  await T(`av-estrela-${estrelas}`).click();
  if (texto) await T('av-texto').fill(texto);
  if (anonimo) await T('av-anonimo').check();
  await T('av-enviar').click();
  await T('av-obrigado').waitFor();
  await p.evaluate(() => { location.hash = ''; });
  await T('agenda-topo').waitFor();
};
const DONO = { apex: 'davi', dalforno: 'alan', offbox: 'alan' };

// ================= A) fluxo completo × lojas × tema × tela =================
let n = 0;
for (const loja of ['apex', 'dalforno', 'offbox']) {
  for (const tela of [{ w: 1366, h: 860, nome: 'desktop' }, { w: 390, h: 800, nome: '390' }]) {
    for (const modo of ['escuro', 'claro']) {
      const anonimo = (n++ % 2) === 1;
      const rot = `${loja}/${tela.nome}/${modo}${anonimo ? '/anônimo' : ''}`;
      const { ctx, p, T } = await abrir({ ...tela, modo }, loja);
      await entrar(T, DONO[loja]);
      const NOME = 'Maria Avaliadora';
      const servicoId = await lancar(p, T, { nome: NOME, telefone: '51 99777-1234' });
      const card = cartaoDe(p, 'Maria');
      await card.waitFor();
      const estrela = card.getByTestId('cartao-avaliar');
      await estrela.waitFor();
      assert.equal(await card.getByTestId('cartao-avaliacao-pedida').count(), 0, `${rot}: ainda não foi pedida`);
      // estrela -> confirma na tela (sem janela do navegador)
      await estrela.click();
      assert.match(await T('avaliar-pergunta').innerText(), /Abrimos o WhatsApp com a mensagem e o link de avaliação prontos/);
      assert.match(await T('avaliar-previa').innerText(), /^Olá, Maria! .*\[link da avaliação\]/s);
      assert.equal((await wa(p)).length, 0, `${rot}: confirmar antes de abrir`);
      await T('avaliar-nao').click(); await T('avaliar-pergunta').waitFor({ state: 'detached' });
      assert.equal((await wa(p)).length, 0, `${rot}: "agora não" não abre nada`);
      await estrela.click(); await T('avaliar-sim').click();
      // wa.me com número, texto e link; aba nova; link copiado
      const m = await mensagemWa(p);
      assert.equal((await wa(p)).length, 1);
      assert.match(m.e.href, /^https:\/\/wa\.me\/5551997771234\?text=/); assert.equal(m.e.alvo, '_blank'); assert.match(m.e.rel, /noopener/);
      assert.match(m.texto, /^Olá, Maria! Obrigado pela visita à .+\. Como foi o seu atendimento\? Avalie em menos de 1 minuto: \S+$/);
      assert.match(m.hash, new RegExp(`^#avaliar@${loja}/[0-9a-f]{48}$`));
      assert.equal(m.e.href.includes('whatsapp:'), false);
      const copiado = await p.evaluate(() => navigator.clipboard.readText().catch(() => null));
      if (copiado !== null) assert.equal(copiado, m.link, `${rot}: o link da mensagem também foi copiado`);
      await card.getByTestId('cartao-avaliacao-pedida').waitFor();
      assert.match(await card.getByTestId('cartao-avaliacao-pedida').innerText(), /Avaliação pedida em 12\/10/);
      ok(`${rot}: estrela abre o WhatsApp com a mensagem e o link`);
      // o cliente abre o link
      await p.evaluate((h) => { location.hash = h; }, m.hash);
      await T('pagina-avaliar').waitFor();
      const corpo = await T('pagina-avaliar').innerText();
      assert.equal(corpo.includes('Maria'), false, `${rot}: a página do cliente não mostra o nome dele`);
      assert.match(await T('av-contexto-pub').innerText(), /\d{2}\/\d{2}\/\d{4}/);
      await semRolagem(p, `${rot} página do cliente`);
      await T('av-enviar').click();
      assert.match(await p.locator('.pub-cartao .aviso-erro').innerText(), /nota de 1 a 5/, `${rot}: sem nota não envia`);
      await T('av-estrela-4').click();
      assert.equal(await T('av-estrela-4').getAttribute('aria-checked'), 'true');
      assert.equal(await T('av-estrela-5').getAttribute('aria-checked'), 'false');
      assert.equal(await T('av-nota-rotulo').innerText(), 'Muito bom');
      await T('av-texto').fill('Atendimento <b>ótimo</b> e rápido');
      if (anonimo) await T('av-anonimo').check();
      assert.match(await p.locator('.av-anonimo').innerText(), /a menos que as regras do estabelecimento permitam/);
      await T('av-enviar').click();
      await T('av-obrigado').waitFor();
      assert.match(await T('av-obrigado').innerText(), /Obrigado pela sua avaliação!/);
      // o mesmo link não vale de novo
      await p.evaluate(() => { location.hash = ''; });
      await T('agenda-topo').waitFor();
      await p.evaluate((h) => { location.hash = h; }, m.hash);
      await T('av-erro-generico').waitFor();
      assert.match(await T('av-erro-generico').innerText(), new RegExp(ERRO_GENERICO.replace(/[.]/g, '\\.')));
      await p.evaluate(() => { location.hash = ''; });
      await T('agenda-topo').waitFor();
      await card.getByTestId('cartao-avaliado').waitFor();
      assert.equal(await card.getByTestId('cartao-avaliacao-pedida').count(), 0);
      // painel
      await T('nav-avaliacoes').click(); await T('tela-avaliacoes').waitFor();
      assert.equal((await T('av-media').innerText()).trim(), '4'); assert.equal(await T('av-total').innerText(), '1 avaliação');
      assert.equal(await T('av-dist-4').innerText(), '1'); assert.equal(await T('av-dist-5').innerText(), '0');
      assert.equal(await T('av-texto-item').innerText(), 'Atendimento <b>ótimo</b> e rápido', `${rot}: texto do cliente entra só como texto`);
      assert.equal(await p.locator('[data-testid="av-item"] b').count(), 1, `${rot}: <b> do cliente não virou HTML (só o nome em negrito)`);
      assert.equal(await T('estrelas').first().getAttribute('data-nota'), '4');
      assert.match(await T('av-contexto').innerText(), /com /);
      if (!anonimo) {
        assert.equal(await T('av-cliente').innerText(), NOME); assert.equal(await T('av-revelado').count(), 0);
      } else {
        // regra DESLIGADA (padrão): "Anônimo" e o nome não existe em lugar nenhum desta tela
        assert.equal(await T('av-cliente').innerText(), 'Anônimo'); assert.equal(await T('av-revelado').count(), 0);
        assert.equal((await p.locator('#raiz').innerHTML()).includes('Maria Avaliadora'), false, `${rot}: o DOM da tela de avaliações não contém o nome`);
        // o Admin (simulado, fora do painel da loja) liga a regra: nome real + frase
        await sair(T);
        await T('sim-admin-anonimo').check();
        await entrar(T, DONO[loja]);
        await T('nav-avaliacoes').click();
        assert.equal(await T('av-cliente').innerText(), NOME);
        assert.equal((await T('av-revelado').innerText()).trim(), '(avaliado como anônimo)');
        await sair(T); await T('sim-admin-anonimo').uncheck(); await entrar(T, DONO[loja]); await T('nav-avaliacoes').click();
        assert.equal(await T('av-cliente').innerText(), 'Anônimo', `${rot}: desligar a regra esconde de novo`);
      }
      // por serviço: cartão do serviço e cadastro
      await T('nav-servicos').click();
      assert.match(await T(`srv-nota-${servicoId}`).innerText(), /4 · 1 avaliação/);
      await semRolagem(p, `${rot} serviços`);
      await T('nav-avaliacoes').click(); await semRolagem(p, `${rot} avaliações`);
      ok(`${rot}: avaliou pelo link; painel, resumo e serviço batem`);
      await ctx.close();
    }
  }
}

// ================= B) casos de borda e permissões (Dalforno, desktop, escuro) =================
{
  const { ctx, p, T } = await abrir({ w: 1366, h: 860, modo: 'escuro' }, 'dalforno');
  await entrar(T, 'alan'); await todos(T);

  // --- cartões sem estrela: futuro, e estrela nos casos sem pedido possível ---
  const servicoId = await lancar(p, T, { nome: 'Passante' });            // sem cadastro (só nome)
  const cSem = cartaoDe(p, 'Passante');
  await cSem.waitFor();
  await cSem.getByTestId('cartao-avaliar').click();
  await T('avaliar-sem-cadastro').waitFor();
  assert.match(await T('avaliar-sem-cadastro').innerText(), /sem cadastro de cliente/i);
  assert.equal((await wa(p)).length, 0, 'sem cadastro: nada é aberto');
  assert.equal(await T('avaliar-sim').count(), 0, 'sem cadastro: não há botão de enviar');
  await T('avaliar-ok').click();
  ok('estrela em atendimento SEM cadastro mostra o aviso e não abre o WhatsApp');

  await lancar(p, T, { nome: 'Fone Ruim', telefone: '51 88888-7777' });   // cadastro com número que não é de WhatsApp
  const cFone = cartaoDe(p, 'Fone Ruim');
  await cFone.getByTestId('cartao-avaliar').click();
  await T('avaliar-sem-telefone').waitFor();
  assert.match(await T('avaliar-sem-telefone').innerText(), /sem telefone válido/i);
  assert.equal((await wa(p)).length, 0);
  await T('avaliar-ok').click();
  ok('estrela em cliente SEM telefone válido mostra o aviso e não abre o WhatsApp');

  await lancar(p, T, { nome: 'Ze Quieto', telefone: '51 99555-4321' });
  await T('nav-clientes').click();
  await p.getByRole('button', { name: 'Editar Ze Quieto' }).click();
  await T('cli-sem-mensagens').check(); await T('salvar-cliente').click();
  await T('nav-agenda').click();
  await cartaoDe(p, 'Ze Quieto').getByTestId('cartao-avaliar').click();
  await T('avaliar-sem-mensagens').waitFor();
  assert.match(await T('avaliar-sem-mensagens').innerText(), /não receber mensagens/);
  await T('avaliar-ok').click();
  ok('cliente que não quer mensagens: a estrela avisa');

  // futuro: sem estrela
  await T('atender').click();
  await p.locator('[data-testid^="atender-srv-"]').first().check();
  await T('atender-nome').fill('Futuro Fulano'); await T('atender-telefone').fill('51 99444-1111');
  await T('atender-quando').click();
  const amanha = '2026-10-13'; await T('atender-data').fill(amanha); await T('hora-h').fill('15'); await T('hora-m').fill('00');
  await salvarAtender(p); await T('salvar-atender').waitFor({ state: 'detached' });
  await p.getByRole('button', { name: 'Próximo', exact: true }).click();
  const fut = cartaoDe(p, 'Futuro Fulano'); await fut.waitFor();
  assert.equal(await fut.getByTestId('cartao-avaliar').count(), 0, 'agendamento futuro não tem estrela');
  await p.getByRole('button', { name: 'Hoje', exact: true }).click();
  ok('agendamento futuro não mostra estrela');

  // --- duas avaliações de profissionais diferentes para a permissão ---
  const pedirEAvaliar = async (nome, estrelas, texto) => {
    const c = cartaoDe(p, nome);
    await c.getByTestId('cartao-avaliar').click(); await T('avaliar-sim').click();
    const m = await mensagemWa(p);
    await avaliarPeloLink(p, T, m.hash, { estrelas, texto });
  };
  await lancar(p, T, { nome: 'Cliente Kiko', telefone: '51 99333-0001', profissional: 1 });
  await lancar(p, T, { nome: 'Cliente Tailuan', telefone: '51 99333-0002', profissional: 2 });
  await pedirEAvaliar('Cliente Kiko', 5, 'Kiko é demais');
  await pedirEAvaliar('Cliente Tailuan', 2, 'Demorou');
  ok('duas avaliações de profissionais diferentes');

  // token errado e vencido
  await p.evaluate(() => { location.hash = `#avaliar/${'0'.repeat(48)}`; });
  await T('av-erro-generico').waitFor();
  assert.match(await T('av-erro-generico').innerText(), new RegExp(ERRO_GENERICO.replace(/[.]/g, '\\.')));
  assert.equal(await T('av-estrela-1').count(), 0, 'sem token válido não há formulário');
  await p.evaluate(() => { location.hash = '#avaliar/curto'; });
  assert.equal(await T('pagina-avaliar').count(), 0, 'formato de token inválido nem é página de avaliação');
  await p.evaluate(() => { location.hash = ''; });
  await cartaoDe(p, 'Cliente Kiko').waitFor();
  ok('token errado: resposta genérica, sem formulário');

  // pedir de novo troca o link; o antigo não vale mais; o vencido (91 dias) também não
  await lancar(p, T, { nome: 'Cliente Troca', telefone: '51 99333-0003' });
  const cT = cartaoDe(p, 'Cliente Troca');
  await cT.getByTestId('cartao-avaliar').click(); assert.equal(await T('avaliar-sim').count(), 1); await T('avaliar-sim').click();
  const m1 = await mensagemWa(p);
  await cT.getByTestId('cartao-avaliar').click();
  assert.match(await p.locator('.aviso').filter({ hasText: 'já pedida' }).innerText(), /Pedir de novo troca o link enviado antes/);
  await T('avaliar-sim').click();
  const m2 = await mensagemWa(p);
  assert.notEqual(m1.hash, m2.hash);
  await p.evaluate((h) => { location.hash = h; }, m1.hash);
  await T('av-erro-generico').waitFor();
  await p.evaluate((h) => { location.hash = h; }, m2.hash);
  await T('av-formulario').waitFor();
  await p.evaluate(() => { location.hash = ''; });
  await ctx.clock.setFixedTime(new Date('2027-01-20T10:00:00-03:00')); // 100 dias depois: passou dos 90
  await p.evaluate((h) => { location.hash = h; }, m2.hash);
  await T('av-erro-generico').waitFor();
  assert.equal(await T('av-estrela-1').count(), 0, 'link vencido não abre o formulário');
  await ctx.clock.setFixedTime(HOJE);
  await p.evaluate(() => { location.hash = ''; });
  ok('pedir de novo troca o link; o anterior e o vencido não valem');
  await ctx.close();
}

// ================= C) permissões, ocultar, serviço e fila (sequência única, uma loja) =================
{
  const { ctx, p, T } = await abrir({ w: 1366, h: 860, modo: 'claro' }, 'dalforno');
  await entrar(T, 'alan'); await todos(T);
  const pedirEAvaliar = async (nome, estrelas, texto) => {
    await cartaoDe(p, nome).getByTestId('cartao-avaliar').click(); await T('avaliar-sim').click();
    const m = await mensagemWa(p); await avaliarPeloLink(p, T, m.hash, { estrelas, texto });
  };
  const servicoId = await lancar(p, T, { nome: 'Cliente Kiko', telefone: '51 99333-0001', profissional: 1 });
  await lancar(p, T, { nome: 'Cliente Tailuan', telefone: '51 99333-0002', profissional: 2 });
  await pedirEAvaliar('Cliente Kiko', 5, 'Kiko é demais');
  await pedirEAvaliar('Cliente Tailuan', 2, 'Demorou');

  // dono vê as duas, filtra por período, profissional e serviço
  await T('nav-avaliacoes').click();
  assert.equal(await p.locator('h1').innerText(), 'Avaliações');
  assert.equal(await T('av-total').innerText(), '2 avaliações'); assert.equal((await T('av-media').innerText()).trim(), '3,5');
  await T('av-filtro-de').fill('2026-10-01'); await T('av-filtro-ate').fill('2026-10-11');
  await T('av-vazio').waitFor(); assert.match(await T('av-vazio').innerText(), /Nenhuma avaliação neste filtro/);
  await T('av-filtro-ate').fill('2026-10-12');
  assert.equal(await p.locator('[data-testid="av-item"]').count(), 2);
  const idKiko = await T('av-filtro-prof').locator('option', { hasText: 'Kiko' }).getAttribute('value');
  await T('av-filtro-prof').selectOption(idKiko);
  assert.equal(await p.locator('[data-testid="av-item"]').count(), 1); assert.equal(await T('av-texto-item').innerText(), 'Kiko é demais');
  await T('av-filtro-prof').selectOption('');
  await T('av-filtro-servico').selectOption(servicoId);
  assert.ok(await p.locator('[data-testid="av-item"]').count() >= 1);
  await T('av-limpar').click();
  await T('av-filtro-ate').fill('2026-10-12'); // só uma data: avisa e não filtra por período
  assert.match(await p.locator('.aviso').filter({ hasText: 'duas datas' }).innerText(), /Preencha as duas datas/);
  await T('av-limpar').click();
  ok('dono: resumo, período, profissional e serviço');

  // serviço: o cadastro do serviço lista só as avaliações dele
  await T('nav-servicos').click();
  assert.match(await T(`srv-nota-${servicoId}`).innerText(), /3,5 · 2 avaliações/);
  await p.locator('article', { has: T(`srv-nota-${servicoId}`) }).getByRole('button', { name: /Editar/ }).click();
  await T('srv-avaliacoes').waitFor();
  assert.match(await T('srv-avaliacoes').innerText(), /Kiko é demais[\s\S]*Demorou|Demorou[\s\S]*Kiko é demais/);
  assert.equal(await T('srv-avaliacoes').locator('[data-testid="av-item"]').count(), 2);
  await p.keyboard.press('Escape');
  ok('cadastro do serviço mostra as avaliações dele');

  // ocultar com motivo
  await T('nav-avaliacoes').click();
  await p.locator('[data-testid="av-item"]', { hasText: 'Demorou' }).locator('[data-testid^="av-ocultar-"]').click();
  await T('av-motivo-ok').click();
  assert.match(await p.locator('[role=dialog] .aviso-erro, .modal .aviso-erro').first().innerText(), /motivo/i);
  await T('av-motivo').fill('Ofensa a terceiros'); await T('av-motivo-ok').click();
  await T('av-oculta').waitFor();
  assert.match(await T('av-motivo-oculta').innerText(), /Ofensa a terceiros/);
  assert.equal(await T('av-total').innerText(), '1 avaliação', 'oculta sai da média');
  ok('ocultar exige motivo, não apaga e sai do resumo');

  // equipe: a seção aparece nas permissões; cria atendente sem a seção
  await T('nav-equipe').click(); await T('novo-usuario').click();
  await T('usr-nome').fill('Ana Recepção'); await T('usr-apelido').fill('Ana'); await T('usr-cpf').fill('52998224725');
  await T('usr-email').fill('ana@x.com'); await T('usr-senha').fill('1234'); await T('usr-papel').selectOption('atendente');
  assert.equal(await T('acesso-avaliacoes').count(), 1, 'a seção Avaliações aparece na tela de permissões');
  assert.equal(await T('acesso-avaliacoes').isChecked(), false, 'padrão: ninguém');
  await T('salvar-usuario').click(); await p.waitForTimeout(200);

  // profissional: só as suas
  await sair(T); await entrar(T, 'kiko');
  await T('nav-avaliacoes').click();
  assert.equal(await p.locator('h1').innerText(), 'Minhas avaliações');
  assert.equal(await T('av-total').innerText(), '1 avaliação'); assert.equal(await T('av-texto-item').innerText(), 'Kiko é demais');
  assert.equal(await T('av-filtro-prof').count(), 0, 'sem escolher outro profissional');
  assert.equal(await p.locator('[data-testid^="av-ocultar-"]').count(), 0, 'profissional não oculta');
  assert.equal(await T('nav-mensagens').count(), 1);
  await T('nav-mensagens').click(); assert.equal(await p.getByRole('tab', { name: 'Mensagens em lote' }).count(), 0, 'sem a seção, sem fila em lote');
  await sair(T); await entrar(T, 'tailuan');
  await T('nav-avaliacoes').click();
  await T('av-vazio').waitFor(); assert.match(await T('av-vazio').innerText(), /Nenhuma avaliação ainda/);
  assert.equal(await p.getByText('Demorou').count(), 0, 'a avaliação oculta de outro nunca aparece');
  ok('profissional vê só as próprias (e não vê a oculta de outro)');

  // atendente sem a seção: sem menu; o dono libera
  await sair(T); await T('login-id').fill('ana'); await T('login-senha').fill('1234'); await T('login-entrar').click(); await T('nav-agenda').waitFor();
  assert.equal(await T('nav-avaliacoes').count(), 0, 'atendente sem a seção não vê o menu');
  await T('nav-mensagens').click(); assert.equal(await p.getByRole('tab', { name: 'Mensagens em lote' }).count(), 0);
  await sair(T); await entrar(T, 'alan');
  await T('nav-equipe').click();
  await p.getByRole('button', { name: /Editar Ana/ }).first().click();
  await T('acesso-avaliacoes').check(); await T('salvar-usuario').click(); await p.waitForTimeout(200);
  await sair(T); await T('login-id').fill('ana'); await T('login-senha').fill('1234'); await T('login-entrar').click(); await T('nav-agenda').waitFor();
  await T('nav-avaliacoes').click(); await T('tela-avaliacoes').waitFor();
  assert.equal(await p.locator('h1').innerText(), 'Avaliações');
  assert.equal(await p.locator('[data-testid^="av-ocultar-"]').count(), 0, 'liberar a seção não dá o poder de ocultar');
  ok('atendente: sem a seção não vê; com a seção vê tudo, mas não oculta');

  // --- fila em lote (dono) ---
  await sair(T); await entrar(T, 'alan'); await todos(T);
  await lancar(p, T, { nome: 'Passante' });                                   // sem cadastro
  await lancar(p, T, { nome: 'Fone Ruim', telefone: '51 88888-7777' });       // número que não é de WhatsApp
  await lancar(p, T, { nome: 'Ze Quieto', telefone: '51 99555-4321' });
  await T('nav-clientes').click(); await p.getByRole('button', { name: 'Editar Ze Quieto' }).click(); await T('cli-sem-mensagens').check(); await T('salvar-cliente').click();
  await T('nav-agenda').click();
  await lancar(p, T, { nome: 'Ana Lote', telefone: '51 99222-0001' });
  await lancar(p, T, { nome: 'Bia Lote', telefone: '51 99222-0002' });
  await lancar(p, T, { nome: 'Caio Lote', telefone: '51 99222-0003', quando: '2026-10-10' });
  await T('nav-mensagens').click();
  await p.getByRole('tab', { name: 'Mensagens em lote' }).click();
  assert.match(await T('fila-aviso-meta').innerText(), /sem a API oficial do WhatsApp \(Meta\) não existe envio automático.*um clique por pessoa/s);
  assert.match(await T('fila-sem-periodo').innerText(), /Escolha o período/);
  assert.equal(await T('fila-criar').isDisabled(), true);
  await T('fila-de').fill('2026-10-12'); await T('fila-ate').fill('2026-10-12');
  await T('fila-previa').waitFor();
  const total = Number(await T('fila-total').innerText());
  assert.equal(total, 2, 'hoje: só Ana e Bia podem receber');
  assert.match(await T('fila-sem-cadastro').innerText(), /1 atendimento sem cadastro de cliente: ficam de fora/); assert.match(await T('fila-sem-telefone').innerText(), /1 sem telefone válido: ficam de fora/);
  assert.match(await T('fila-optout').innerText(), /1 pediu para não receber mensagens: fica de fora/);
  assert.match(await T('fila-ja-avaliou').innerText(), /2 já avaliaram: ficam de fora/);
  const prev = await T('fila-previa-lista').innerText();
  assert.ok(prev.includes('Ana Lote') && prev.includes('Bia Lote') && !prev.includes('Caio Lote'), 'período de um dia: Caio (10/10) fica de fora');
  assert.equal(/\d{5}-\d{4}/.test(prev), false, 'telefone inteiro nunca aparece na lista');
  assert.match(prev, /\(51\) •••••-0001/);
  await T('fila-de').fill('2026-10-10');
  assert.ok(Number(await T('fila-total').innerText()) > total, 'ampliando o período entram mais contatos (o Caio e os atendimentos de exemplo)');
  assert.match(await T('fila-previa-lista').innerText(), /Caio Lote/);
  await T('fila-ate').fill('2027-12-31'); // período > 366 dias
  assert.match(await p.locator('.aviso-erro').innerText(), /no máximo 366 dias/); await T('fila-ate').fill('2026-10-12');
  await T('fila-modelo').fill('Oi {nome}, sem o link'); await T('fila-criar').click();
  assert.match(await p.locator('.aviso-erro').innerText(), /precisa de \{link\}/);
  await T('fila-modelo').fill('Oi {nome}, conta pra gente como foi: {link}');
  await T('fila-criar').click();
  await T('fila-atual').waitFor();
  const alvo = await T('fila-progresso').innerText(); assert.match(alvo, /^0 de \d+ tratados$/);
  const totalFila = Number(/de (\d+)/.exec(alvo)[1]);
  const antes = (await wa(p)).length;
  const nome1 = await T('fila-vez-nome').innerText();
  await T('fila-proximo').click();
  assert.equal((await wa(p)).length, antes + 1, 'Próximo abre exatamente um WhatsApp');
  const mm = await mensagemWa(p);
  assert.match(mm.texto, new RegExp(`^Oi ${nome1.split(' ')[0]}, conta pra gente como foi: \\S*#avaliar@dalforno/[0-9a-f]{48}$`));
  assert.match(mm.numero, /^5551992220\d{3}$/);
  await T('fila-enviado').click();
  assert.equal(await T('fila-progresso').innerText(), `1 de ${totalFila} tratados`);
  assert.notEqual(await T('fila-vez-nome').innerText(), nome1);
  await T('fila-pular').click();
  assert.equal(await T('fila-progresso').innerText(), `2 de ${totalFila} tratados`);
  // pausa: sai da tela e volta; a fila continua de onde parou
  await T('nav-agenda').click(); await T('nav-mensagens').click(); await p.getByRole('tab', { name: 'Mensagens em lote' }).click();
  assert.equal(await T('fila-progresso').innerText(), `2 de ${totalFila} tratados`);
  assert.equal((await wa(p)).length, antes + 1, 'voltar à tela não reenvia nada');
  assert.equal(await p.locator('[data-testid^="fila-item-"][data-status="enviado"]').count(), 1);
  assert.equal(await p.locator('[data-testid^="fila-item-"][data-status="pulou"]').count(), 1);
  await semRolagem(p, 'fila desktop');
  while (await T('fila-fim').count() === 0) { await T('fila-proximo').click(); await T('fila-enviado').click(); }
  assert.match(await T('fila-fim').innerText(), /Fila concluída/);
  await T('fila-encerrar').click(); await T('fila-nova').waitFor();
  ok('fila em lote: período, contagens, Próximo, enviado, pular, pausa e encerrar');

  // 390 px: tela de avaliações, fila e página do cliente sem rolagem lateral
  await p.setViewportSize({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await T('fila-de').fill('2026-10-10'); await T('fila-ate').fill('2026-10-12'); await T('fila-previa').waitFor();
  await semRolagem(p, 'fila 390');
  await T('nav-avaliacoes').click(); await semRolagem(p, 'avaliações 390');
  await T('nav-agenda').click(); await semRolagem(p, 'agenda com estrela 390');
  ok('390 px: sem rolagem lateral');
  await ctx.close();
}

await b.close();
assert.deepEqual(erros, []);
ok('e2e78 completo');
