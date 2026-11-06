/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// E3 (trocar de plano pagando só a diferença) no site real (dist/index-real.html) contra um servidor falso:
//  1. #agendar: com a cota acabada (ou o serviço fora de um plano restrito) a tela mostra, ANTES do pedido, os planos com mais serviços, o aviso "paga só a diferença" e o valor
//     já descontado; escolher habilita o botão; com WhatsApp da loja o botão é um link https://wa.me comum (nunca whatsapp://) que abre no clique e grava o pedido ao mesmo tempo;
//     sem WhatsApp o botão só grava o pedido; o pedido leva telefone e plano no corpo, sem Authorization; sem opção nada aparece;
//  2. painel do dono (Planos): cartão de desconto (%) e WhatsApp salva por PUT /api/planos/troca (fora de 0 a 100 nem sai), o pedido de troca mostra de qual plano para qual e a diferença,
//     e aceitar manda a forma de pagamento da diferença.
// 390 px com fonte larga (DejaVu Sans) e 1366 px; sem rolagem lateral. E2E_CAPTURAS=<pasta> grava as imagens.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const CORTE = id(50), BARBA = id(52), ALAN = id(1), NOVO = id(71), PEDIDO = id(90);
const TEL = { esgotado: '53999000001', restrito: '53999000002', sem: '53999000003' };
const LOJA = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };
const CAP = process.env.E2E_CAPTURAS;
const OPCAO = { planoId: NOVO, nome: 'Corte e Barba Plus', preco: 120, cortes: 4, servicos: ['Barba', 'Corte'], diferenca: 33.75 };

function modelo({ whatsapp = '5551999991234' } = {}) {
  const m = { pedidos: [], previas: [], config: null, aceites: [], aberto: true };
  const dig = (c) => String(c.corpo.telefone).replace(/\D/g, '');
  m.trata = (c, { json }) => {
    // ---- link do cliente
    if (c.u === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, exigeTelefone: true, servicos: [{ id: CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }, { id: BARBA, nome: 'Barba', duracao: 30, preco: 30, antecedenciaH: 0 }], profissionais: [{ id: ALAN, nome: 'Alan', servicoIds: [CORTE, BARBA] }] });
    if (c.u === '/api/publico/dias') return json(200, ['2026-10-30']);
    if (c.u === '/api/publico/horarios') return json(200, [{ inicio: '2026-10-30T12:00:00Z', profissionalId: ALAN }]);
    if (c.u === '/api/publico/planos/uso' && c.m === 'POST') {
      m.previas.push(c);
      const t = dig(c);
      const extra = { trocas: [OPCAO], descontoTrocaPct: 25, ...(whatsapp ? { whatsapp } : {}) };
      if (t === TEL.esgotado) return json(200, { usaPlano: false, esgotado: true, restrito: false, ...extra });
      if (t === TEL.restrito) return json(200, { usaPlano: false, esgotado: false, restrito: true, ...extra });
      return json(200, { usaPlano: false, esgotado: false, restrito: false });
    }
    if (c.u === '/api/publico/planos/trocas' && c.m === 'POST') { m.pedidos.push(c); return json(201, { ok: true }); }
    // ---- painel do dono
    if (c.u === '/api/servicos') return json(200, [{ id: CORTE, codigo: '1', nome: 'Corte', categoria: '', preco: 40, duracaoMin: 30, intervaloMin: 0, ativo: true }, { id: BARBA, codigo: '2', nome: 'Barba', categoria: '', preco: 30, duracaoMin: 30, intervaloMin: 0, ativo: true }]);
    if (c.u === '/api/planos' && c.m === 'GET') {
      return json(200, { planos: [], assinaturas: [], aReceber: [], mes: '2026-10', descontoTrocaPct: m.config ? m.config.descontoPct : 0, whatsapp: m.config ? m.config.whatsapp : null,
        pedidos: m.aberto ? [{ id: PEDIDO, nome: 'Maria Souza', telefone: '5553999000001', planoId: NOVO, planoNome: 'Corte e Barba Plus', status: 'novo', criadoEm: '2026-10-28T10:00:00Z', tipo: 'troca', planoAtualNome: 'Corte em Dia', valorDiferenca: 33.75, descontoPct: 25 }] : [] });
    }
    if (c.u === '/api/planos/troca' && c.m === 'PUT') { m.config = { descontoPct: Number(c.corpo.descontoPct), whatsapp: c.corpo.whatsapp ? `55${String(c.corpo.whatsapp).replace(/\D/g, '')}` : null }; return json(200, m.config); }
    if (c.u === `/api/planos/pedidos/${PEDIDO}/aceitar` && c.m === 'POST') { m.aceites.push(c); m.aberto = false; return json(200, { id: id(91), status: 'ativa', clienteId: id(60), planoId: NOVO, plano: { nome: 'Corte e Barba Plus', preco: 120, cortes: 4, servicoIds: [CORTE, BARBA] }, inicioMes: '2026-10', diaCobranca: 5, pagamentos: [], extrato: [], log: [] }); }
    return false;
  };
  return m;
}

async function link(vp, tel, { whatsapp = '5551999991234', espera }, rotulo) {
  const m = modelo({ whatsapp });
  const srv = await subirServidor(m.trata, { loja: LOJA });
  const nav = await abrirNavegador();
  const ctx = await nav.b.newContext({ viewport: vp, hasTouch: vp.width < 700, isMobile: vp.width < 700, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => nav.erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { nav.erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  const abertas = [];
  ctx.on('page', (np) => abertas.push(np));
  await p.goto(srv.url + '#agendar');
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  const T = (t) => p.getByTestId(t);
  await T(`pub-srv-${CORTE}`).check(); await T('pub-continuar-1').click();
  await T('pub-dia-2026-10-30').click(); await T('pub-hora-0900').click(); await T('pub-continuar-2').click();
  await T('pub-nome').fill('Maria Souza'); await T('pub-tel').fill(tel);
  const foto = async (nome) => { if (!CAP) return; await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/e3-${nome}-${vp.width}.png`, fullPage: true }); };
  if (!espera) {
    await p.waitForTimeout(900);
    assert.equal(m.previas.length, 1);
    assert.equal(await T('pub-troca').count(), 0, `${rotulo}: sem opção nada aparece`);
  } else {
    await T('pub-troca').waitFor();
    assert.equal(await T('pub-plano-esgotado').count() + await T('pub-plano-restrito').count(), 1, `${rotulo}: o aviso de plano continua`);
    const aviso = await T('pub-troca-aviso').innerText();
    assert.match(aviso, /paga só a diferença/); assert.match(aviso, /Não paga o plano completo/); assert.match(aviso, /25% de desconto/);
    assert.equal((await T(`pub-troca-valor-${NOVO}`).innerText()).replace(/\s/g, ' '), 'Você paga só R$ 33,75 neste mês', `${rotulo}: a diferença já vem com o desconto`);
    const corpoPagina = await p.locator('body').innerText();
    assert.ok(!/Corte em Dia/.test(corpoPagina), `${rotulo}: nunca o nome do plano atual`);
    // nada passa da largura da tela nem do cartão do formulário (o botão longo já alargou a página uma vez)
    const larg = await p.evaluate(() => innerWidth);
    const cartao = await p.locator('.pub-cartao').first().boundingBox();
    for (const alvo of ['pub-troca', 'pub-nome', 'pub-troca-pedir']) {
      const b = await T(alvo).boundingBox();
      assert.ok(b.x >= 0 && b.x + b.width <= larg + 1, `${rotulo}: ${alvo} cabe na tela (${Math.round(b.x + b.width)} de ${larg})`);
      assert.ok(b.x + b.width <= cartao.x + cartao.width + 1, `${rotulo}: ${alvo} cabe no cartão`);
    }
    await nav.semRolagem(p, `${rotulo}: opções de troca`);
    await foto(`troca-opcoes-${espera}`);
    const botao = T('pub-troca-pedir');
    assert.equal(await botao.getAttribute('aria-disabled') ?? (await botao.isDisabled() ? 'true' : 'false'), 'true', `${rotulo}: sem escolher o botão não vale`);
    await T(`pub-troca-opcao-${NOVO}`).check();
    if (whatsapp) {
      const href = await botao.getAttribute('href');
      assert.match(href, /^https:\/\/wa\.me\/5551999991234\?text=/, `${rotulo}: link wa.me comum`);
      assert.ok(!href.startsWith('whatsapp:'));
      assert.equal(await botao.getAttribute('target'), '_blank');
      const texto = decodeURIComponent(href.split('text=')[1]);
      assert.match(texto, /Corte e Barba Plus/); assert.match(texto, /R\$ 33,75 neste mês \(já com 25% de desconto\)/); assert.match(texto, /R\$ 120,00\/mês/);
    } else {
      assert.equal(await botao.getAttribute('href'), null, `${rotulo}: sem WhatsApp da loja o botão só grava o pedido`);
    }
    await foto(`troca-escolhida-${espera}`);
    // clica sem abrir de verdade a aba do WhatsApp (o teste só confere o link e o pedido gravado)
    await p.evaluate(() => document.querySelectorAll('a[href^="https://wa.me/"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault(), true)));
    await botao.click();
    await T('pub-troca-feito').waitFor();
    assert.equal(m.pedidos.length, 1, `${rotulo}: o pedido foi gravado`);
    assert.deepEqual(m.pedidos[0].corpo, { telefone: `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`, planoId: NOVO }, `${rotulo}: telefone e plano no corpo`);
    assert.ok(!m.pedidos[0].cab?.authorization, `${rotulo}: rota do cliente nunca leva o token do painel`);
    assert.ok(!m.pedidos[0].u.includes('99900'), 'telefone nunca na URL');
    assert.equal(await T('pub-troca-pedir').count(), 0, `${rotulo}: depois do pedido o botão sai`);
    await nav.semRolagem(p, `${rotulo}: pedido feito`);
    await foto(`troca-feito-${espera}`);
  }
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: ok`);
}

async function painel(vp) {
  const rotulo = `painel/${vp.width}`;
  const m = modelo();
  const srv = await subirServidor(m.trata, { loja: LOJA });
  const nav = await abrirNavegador();
  const { p } = await nav.abrir(srv.url, { viewport: vp, aba: 'planos', fonteLarga: vp.width < 700 });
  const T = (t) => p.getByTestId(t);
  await T('tela-planos').waitFor();
  await T('planos-aba-catalogo').click();
  await T('troca-config').waitFor();
  await nav.semRolagem(p, `${rotulo}: configuração da troca`);
  // fora de 0 a 100 nem sai
  await T('troca-desconto').fill('120'); await T('troca-salvar').click();
  await T('troca-erro').waitFor();
  assert.equal(srv.quantas('PUT', '/api/planos/troca'), 0, `${rotulo}: desconto inválido não vai ao servidor`);
  await T('troca-desconto').fill('25'); await T('troca-whatsapp').fill('(51) 99999-1234'); await T('troca-salvar').click();
  await T('troca-salvo').waitFor();
  assert.deepEqual(srv.ultimo('PUT', '/api/planos/troca').corpo, { descontoPct: 25, whatsapp: '(51) 99999-1234' });
  assert.equal(await T('troca-erro').count(), 0, `${rotulo}: o erro some depois de salvar`);
  if (CAP) { await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/e3-painel-config-${vp.width}.png`, fullPage: true }); }
  // pedido de troca
  await T('planos-aba-pedidos').click();
  await T(`pedido-troca-${PEDIDO}`).waitFor();
  const txt = (await T(`pedido-troca-${PEDIDO}`).innerText()).replace(/\s+/g, ' ');
  assert.match(txt, /Maria Souza quer trocar o plano Corte em Dia por Corte e Barba Plus/);
  assert.match(txt, /Diferença a receber: R\$ 33,75 \(com 25% de desconto\) só neste mês/);
  assert.match(txt, /atendimentos já usados no mês passam para o plano novo/);
  await nav.semRolagem(p, `${rotulo}: pedido de troca`);
  if (CAP) { await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/e3-painel-pedido-${vp.width}.png`, fullPage: true }); }
  await T(`pedido-forma-${PEDIDO}`).selectOption('dinheiro');
  await T(`pedido-aceitar-${PEDIDO}`).click();
  await T('planos-aviso').waitFor();
  assert.equal(srv.quantas('POST', `/api/planos/pedidos/${PEDIDO}/aceitar`), 1);
  assert.deepEqual(srv.ultimo('POST', `/api/planos/pedidos/${PEDIDO}/aceitar`).corpo, { forma: 'dinheiro' }, `${rotulo}: a forma da diferença vai no aceite`);
  await T('pedidos-vazio').waitFor();
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: configuração, pedido de troca e aceite com a forma`);
}

for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 860 }]) {
  const r = `link/${vp.width}`;
  await link(vp, TEL.esgotado, { espera: 'esgotado' }, `${r}/esgotado com WhatsApp`);
  await link(vp, TEL.restrito, { espera: 'restrito', whatsapp: '' }, `${r}/restrito sem WhatsApp`);
  await link(vp, TEL.sem, {}, `${r}/sem plano`);
  await painel(vp);
}
console.log('e2e131 ok');
