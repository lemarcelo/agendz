/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B0 (planos, o que faltava) no site real (dist/index-real.html) contra um servidor falso:
//  1. "Usar modelo" no catálogo de Planos da barbearia: lista os modelos, escolher preenche o formulário (nome, valor, cortes, limites e os serviços da loja com o
//     mesmo nome), NADA é gravado até salvar, e salvar manda o plano com os serviços achados; a estética usa os modelos dela (lavagem), nunca os da barbearia;
//     loja sem os serviços do modelo mostra o aviso e o formulário vem sem serviço marcado;
//  2. link do cliente (#agendar): com o telefone completo a tela avisa "este horário usa um atendimento do seu plano" (só sim ou não, telefone no corpo, nunca na URL,
//     sem Authorization); telefone sem plano não avisa; depois do pedido a confirmação repete o aviso; o servidor recusando a prévia nunca atrapalha o pedido.
// 390 px com fonte larga e desktop × claro/escuro.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const CORTE = id(50), DEGRADE = id(51), BARBA = id(52), ALAN = id(1), PLANO = id(70);
const TEL_PLANO = '53999000001', TEL_SEM = '53999000002';
const LOJAS = {
  barbearia: { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null },
  estetica: { slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null },
};

function modelo({ servicos, falhaPrevia = false }) {
  const m = { planosSalvos: [], previas: [], pedidos: [] };
  m.trata = (c, { json }) => {
    if (c.u === '/api/servicos') return json(200, servicos.map((s) => ({ id: s.id, codigo: '1', nome: s.nome, categoria: '', preco: s.preco, duracaoMin: 30, intervaloMin: 0, ativo: true })));
    if (c.u === '/api/planos' && c.m === 'GET') return json(200, { planos: m.planosSalvos, assinaturas: [], pedidos: [], aReceber: [], mes: '2026-10' });
    if (c.u === '/api/planos' && c.m === 'POST') {
      const novo = { id: id(300 + m.planosSalvos.length), descricao: '', ativo: true, ...c.corpo };
      m.planosSalvos.push(novo);
      return json(201, novo);
    }
    // ---- link do cliente (sem login)
    if (c.u === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, exigeTelefone: true, servicos: [{ id: CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }], profissionais: [{ id: ALAN, nome: 'Alan', foto: null }] });
    if (c.u === '/api/publico/dias') return json(200, ['2026-10-30']);
    if (c.u === '/api/publico/horarios') return json(200, [{ inicio: '2026-10-30T12:00:00Z', profissionalId: ALAN }]);
    if (c.u === '/api/publico/planos/uso' && c.m === 'POST') {
      m.previas.push(c);
      if (falhaPrevia) return json(429, { mensagem: 'Muitos pedidos em pouco tempo.' });
      return json(200, { usaPlano: String(c.corpo.telefone).replace(/\D/g, '') === TEL_PLANO });
    }
    if (c.u === '/api/publico/agendamentos' && c.m === 'POST') {
      m.pedidos.push(c);
      const usou = String(c.corpo.telefone).replace(/\D/g, '') === TEL_PLANO;
      const quando = Date.parse(c.corpo.inicio);
      return json(201, { agendamento: { id: id(400), inicio: new Date(quando).toISOString(), fim: new Date(quando + 1800000).toISOString(), status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Corte'],
        duracao: 30, total: 40, desconto: usou ? 40 : 0, cupom: null, profissional: 'Alan', ativo: true, podeCancelar: true }, token: 'ab'.repeat(24), usouPlano: usou });
    }
    return false;
  };
  return m;
}

async function painel(lojaChave, servicos, vp, modo) {
  const rotulo = `${lojaChave}/${vp.width}/${modo}`;
  const m = modelo({ servicos });
  const srv = await subirServidor(m.trata, { loja: LOJAS[lojaChave] });
  const nav = await abrirNavegador();
  const { p } = await nav.abrir(srv.url, { viewport: vp, aba: 'planos', fonteLarga: vp.width < 700 });
  await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  const T = (t) => p.getByTestId(t);
  await T('tela-planos').waitFor();
  await T('planos-aba-catalogo').click();
  await T('aba-catalogo').waitFor();
  return { rotulo, m, srv, nav, p, T };
}

async function modelos(vp, modo) {
  // 1a. barbearia com os serviços do modelo "Degradê em Dia"
  const a = await painel('barbearia', [{ id: CORTE, nome: 'Corte', preco: 40 }, { id: DEGRADE, nome: 'Corte Degradê', preco: 45 }, { id: BARBA, nome: 'Barba', preco: 30 }], vp, modo);
  await a.T('plano-usar-modelo').click();
  await a.T('modelos-lista').waitFor();
  assert.ok((await a.p.locator('[data-testid^="modelo-pl-"]').count()) >= 3, `${a.rotulo}: modelos da barbearia aparecem`);
  await a.nav.semRolagem(a.p, `${a.rotulo}: lista de modelos`);
  await a.T('modelo-usar-pl-degrade-em-dia').click();
  await a.T('plano-form').waitFor();
  assert.equal(await a.T('plano-nome').inputValue(), 'Degradê em Dia');
  assert.equal(await a.T('plano-preco').inputValue(), '75');
  assert.equal(await a.T('plano-cortes').inputValue(), '2');
  assert.equal(await a.T('plano-intervalo').inputValue(), '7', 'os limites do modelo vêm junto');
  assert.equal(await a.T(`plano-srv-${DEGRADE}`).isChecked(), true, 'o serviço da loja com o mesmo nome do modelo vem marcado');
  assert.equal(await a.T(`plano-srv-${CORTE}`).isChecked(), false);
  assert.equal(await a.T(`plano-srv-${BARBA}`).isChecked(), false);
  assert.equal(await a.T('plano-modelo-dica').count(), 0);
  assert.equal(a.srv.quantas('POST', '/api/planos'), 0, `${a.rotulo}: escolher o modelo não grava nada`);
  await a.nav.semRolagem(a.p, `${a.rotulo}: formulário do modelo`);
  await a.T('salvar-plano').click();
  await a.T('planos-lista').waitFor();
  const salvo = a.srv.ultimo('POST', '/api/planos').corpo;
  assert.equal(salvo.nome, 'Degradê em Dia'); assert.equal(salvo.preco, 75); assert.deepEqual(salvo.servicoIds, [DEGRADE]); assert.equal(salvo.intervaloDias, 7);
  assert.deepEqual(a.nav.erros, [], `${a.rotulo}: sem erro de página`);
  await a.nav.b.close(); a.srv.fechar();
  ok(`${a.rotulo}: Usar modelo preenche, não grava sozinho e salva com os serviços achados`);

  // 1b. loja sem os serviços do modelo: aviso e nenhum serviço marcado
  const b = await painel('barbearia', [{ id: CORTE, nome: 'Corte', preco: 40 }], vp, modo);
  await b.T('plano-usar-modelo').click();
  await b.T('modelo-usar-pl-degrade-em-dia').click();
  await b.T('plano-modelo-dica').waitFor();
  assert.match(await b.T('plano-modelo-dica').innerText(), /ainda não tem os serviços desse modelo/);
  assert.equal(await b.T(`plano-srv-${CORTE}`).isChecked(), false);
  assert.equal(b.srv.quantas('POST', '/api/planos'), 0);
  await b.nav.b.close(); b.srv.fechar();
  ok(`${b.rotulo}: sem os serviços do modelo avisa e deixa escolher à mão`);

  // 1c. estética: modelos próprios do tipo (lavagem), só com os serviços que o servidor guarda no plano (produto incluso e validade do modelo não vão: o plano real ainda não tem)
  const c = await painel('estetica', [{ id: CORTE, nome: 'Lavagem simples', preco: 50 }, { id: BARBA, nome: 'Polimento', preco: 300 }], vp, modo);
  await c.T('plano-usar-modelo').click();
  assert.equal(await c.T('modelo-pl-lavagem-mensal').count(), 1, `${c.rotulo}: modelos da estética`);
  assert.equal(await c.p.locator('[data-testid^="modelo-pl-"]').filter({ hasText: 'Corte' }).count(), 0, `${c.rotulo}: nenhum modelo de barbearia na estética`);
  await c.T('modelo-usar-pl-lavagem-mensal').click();
  await c.T('plano-form').waitFor();
  assert.equal(await c.T('plano-nome').inputValue(), 'Lavagem Mensal');
  assert.equal(await c.T(`plano-srv-${CORTE}`).isChecked(), true);
  assert.equal(await c.T(`plano-srv-${BARBA}`).isChecked(), false);
  assert.equal(c.srv.quantas('POST', '/api/planos'), 0);
  await c.nav.semRolagem(c.p, `${c.rotulo}: formulário do modelo`);
  await c.nav.b.close(); c.srv.fechar();
  ok(`${c.rotulo}: modelos da estética preenchem com o serviço de mesmo nome`);
}

async function link(vp, modo, falhaPrevia = false) {
  const rotulo = `link/${vp.width}/${modo}${falhaPrevia ? '/previa-falha' : ''}`;
  const m = modelo({ servicos: [], falhaPrevia });
  const srv = await subirServidor(m.trata, { loja: LOJAS.barbearia });
  const nav = await abrirNavegador();
  const ctx = await nav.b.newContext({ viewport: vp, hasTouch: vp.width < 700, isMobile: vp.width < 700, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => nav.erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { nav.erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(srv.url + '#agendar');
  if (vp.width < 700) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  const T = (t) => p.getByTestId(t);
  await T(`pub-srv-${CORTE}`).check();
  await T('pub-continuar-1').click();
  await T('pub-dia-2026-10-30').click();
  await T('pub-hora-0900').click();
  await T('pub-continuar-2').click();
  await T('pub-nome').fill('Maria Souza');

  // telefone incompleto: nenhuma consulta; sem plano: nenhum aviso
  await T('pub-tel').fill('53999');
  await p.waitForTimeout(700);
  assert.equal(m.previas.length, 0, `${rotulo}: só consulta com o telefone completo`);
  await T('pub-tel').fill(TEL_SEM);
  await p.waitForTimeout(900);
  assert.equal(m.previas.length, 1);
  assert.equal(await T('pub-usa-plano').count(), 0, `${rotulo}: quem não tem plano não vê o aviso`);

  // telefone de quem tem plano com corte: o aviso aparece antes de pedir
  await T('pub-tel').fill(TEL_PLANO);
  if (falhaPrevia) {
    await p.waitForTimeout(900);
    assert.equal(await T('pub-usa-plano').count(), 0, `${rotulo}: a prévia recusada não mostra aviso nem erro`);
    assert.equal(await T('pub-erro').count(), 0);
  } else {
    await T('pub-usa-plano').waitFor();
    assert.match(await T('pub-usa-plano').innerText(), /usa um atendimento do seu plano/);
  }
  const previa = m.previas.at(-1);
  assert.deepEqual(Object.keys(previa.corpo).sort(), ['inicio', 'servicoIds', 'telefone'], 'a prévia leva só o telefone, os serviços e o horário');
  assert.ok(!previa.q && !previa.u.includes(TEL_PLANO), 'telefone nunca vai na URL');
  assert.equal(srv.chamadas.filter((x) => x.u.startsWith('/api/publico/')).every((x) => !x.auth), true, 'nenhuma rota do cliente leva Authorization');
  await nav.semRolagem(p, `${rotulo}: dados com aviso`);

  // enviar: a confirmação repete o aviso só quando o servidor disse que gastou o corte
  await T('pub-enviar').click();
  await T('pub-feito').waitFor();
  if (falhaPrevia) assert.equal(await T('pub-feito-plano').count(), 1, `${rotulo}: o pedido sai mesmo com a prévia recusada e o servidor decide o plano`);
  else assert.match(await T('pub-feito-plano').innerText(), /usa um atendimento do seu plano/);
  assert.equal(m.pedidos.length, 1);
  await nav.semRolagem(p, `${rotulo}: pedido feito`);
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: aviso "usa seu plano" só para quem tem, antes e depois do pedido`);
}

const VPS = [{ width: 390, height: 844 }, { width: 1280, height: 860 }];
for (const vp of VPS) {
  for (const modo of ['claro', 'escuro']) {
    await modelos(vp, modo);
    await link(vp, modo);
  }
}
await link(VPS[0], 'escuro', true);
console.log('e2e114 ok');
