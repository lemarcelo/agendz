/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// E2 (planos) no site real (dist/index-real.html) contra um servidor falso, link do cliente (#agendar):
//  1. no fim do agendamento de quem tem plano a confirmação diz quantos atendimentos do plano restam no mês ("Restam 2…", "Restam 1…" no singular e "Este foi o último…");
//  2. quando a cota do mês acabou a prévia avisa ANTES de pedir (sem nome de plano nem saldo) e o pedido é recusado (409) com a mensagem do servidor, sem confirmação;
//  3. quem não tem plano não vê nada disso. O servidor decide; o teste só confere o que a tela mostra.
// 390 px com fonte larga e 1366 px; sem rolagem lateral. E2E_CAPTURAS=<pasta> grava as imagens.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const CORTE = id(50), ALAN = id(1);
const TEL = { restam2: '53999000001', restam1: '53999000002', ultimo: '53999000003', esgotado: '53999000004', sem: '53999000005', restrito: '53999000006' };
const MSG_RESTRITO = 'Seu plano permite agendar pelo link só: Corte. Para outros serviços, fale com a equipe.';
const MSG_ESGOTADO = 'Os atendimentos do seu plano em outubro/2026 acabaram. Para agendar fora do plano, fale com a equipe.';
const LOJA = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };
const CAP = process.env.E2E_CAPTURAS;

function modelo() {
  const m = { previas: [], pedidos: [] };
  const dig = (c) => String(c.corpo.telefone).replace(/\D/g, '');
  m.trata = (c, { json }) => {
    if (c.u === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, exigeTelefone: true, servicos: [{ id: CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }], profissionais: [{ id: ALAN, nome: 'Alan', servicoIds: [CORTE] }] });
    if (c.u === '/api/publico/dias') return json(200, ['2026-10-30']);
    if (c.u === '/api/publico/horarios') return json(200, [{ inicio: '2026-10-30T12:00:00Z', profissionalId: ALAN }]);
    if (c.u === '/api/publico/planos/uso' && c.m === 'POST') {
      m.previas.push(c);
      const t = dig(c);
      return json(200, { usaPlano: [TEL.restam2, TEL.restam1, TEL.ultimo].includes(t), esgotado: t === TEL.esgotado, restrito: t === TEL.restrito });
    }
    if (c.u === '/api/publico/agendamentos' && c.m === 'POST') {
      m.pedidos.push(c);
      const t = dig(c);
      if (t === TEL.esgotado) return json(409, { mensagem: MSG_ESGOTADO });
      if (t === TEL.restrito) return json(409, { mensagem: MSG_RESTRITO });
      const quando = Date.parse(c.corpo.inicio);
      const restantes = { [TEL.restam2]: 2, [TEL.restam1]: 1, [TEL.ultimo]: 0 }[t];
      const usou = restantes !== undefined;
      return json(201, {
        agendamento: { id: id(400), inicio: new Date(quando).toISOString(), fim: new Date(quando + 1800000).toISOString(), status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Corte'], duracao: 30, total: 40, desconto: usou ? 40 : 0, cupom: null, profissional: 'Alan', ativo: true, podeCancelar: true },
        token: 'ab'.repeat(24), usouPlano: usou, ...(usou ? { plano: { nome: 'Plano Mensal', restantes, mes: '2026-10', valor: 99 } } : {}),
      });
    }
    return false;
  };
  return m;
}

async function link(vp, tel, esperado, rotulo) {
  const m = modelo();
  const srv = await subirServidor(m.trata, { loja: LOJA });
  const nav = await abrirNavegador();
  const ctx = await nav.b.newContext({ viewport: vp, hasTouch: vp.width < 700, isMobile: vp.width < 700, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => nav.erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { nav.erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(srv.url + '#agendar');
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  const T = (t) => p.getByTestId(t);
  await T(`pub-srv-${CORTE}`).check(); await T('pub-continuar-1').click();
  await T('pub-dia-2026-10-30').click(); await T('pub-hora-0900').click(); await T('pub-continuar-2').click();
  await T('pub-nome').fill('Maria Souza'); await T('pub-tel').fill(tel);
  const foto = async (nome) => { if (!CAP) return; await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/e2-${nome}-${vp.width}.png` }); };
  if (esperado.esgotado) {
    await T('pub-plano-esgotado').waitFor();
    assert.match(await T('pub-plano-esgotado').innerText(), /Os atendimentos do seu plano neste mês acabaram\. Para agendar fora do plano, fale com a equipe\./);
    assert.equal(await T('pub-usa-plano').count(), 0, `${rotulo}: não diz que usa o plano`);
    assert.ok(!/Plano Mensal|\bsaldo\b|R\$\s*99/.test(await p.locator('body').innerText()), `${rotulo}: sem nome de plano, saldo ou valor`);
    await nav.semRolagem(p, `${rotulo}: aviso de plano esgotado`);
    await foto('esgotado-aviso');
    await T('pub-enviar').click();
    await T('pub-erro').waitFor();
    assert.equal(await T('pub-erro').innerText(), MSG_ESGOTADO, `${rotulo}: a mensagem do servidor aparece`);
    assert.equal(await T('pub-feito').count(), 0, `${rotulo}: recusado não confirma`);
    assert.equal(m.pedidos.length, 1);
    await nav.semRolagem(p, `${rotulo}: pedido recusado`);
    await foto('esgotado-recusado');
  } else if (esperado.restrito) {
    await T('pub-plano-restrito').waitFor();
    assert.match(await T('pub-plano-restrito').innerText(), /Seu plano permite agendar pelo link só os serviços dele. Para outros serviços, fale com a equipe./);
    assert.equal(await T('pub-usa-plano').count() + await T('pub-plano-esgotado').count(), 0, `${rotulo}: só o aviso de restrição`);
    await nav.semRolagem(p, `${rotulo}: aviso de plano restrito`);
    await foto('restrito-aviso');
    await T('pub-enviar').click();
    await T('pub-erro').waitFor();
    assert.equal(await T('pub-erro').innerText(), MSG_RESTRITO, `${rotulo}: a mensagem do servidor aparece`);
    assert.equal(await T('pub-feito').count(), 0, `${rotulo}: recusado não confirma`);
    await nav.semRolagem(p, `${rotulo}: pedido recusado pela restrição`);
    await foto('restrito-recusado');
  } else if (esperado.restam !== undefined) {
    await T('pub-usa-plano').waitFor();
    assert.equal(await T('pub-plano-esgotado').count(), 0);
    await T('pub-enviar').click();
    await T('pub-feito').waitFor();
    const txt = await T('pub-feito-plano-restam').innerText();
    assert.equal(txt, esperado.restam, `${rotulo}: texto de quantos restam`);
    assert.ok(!/R\$|99/.test(txt), `${rotulo}: sem valor da mensalidade`);
    await nav.semRolagem(p, `${rotulo}: confirmação com o que resta`);
    await foto(`restam-${esperado.chave}`);
  } else {
    await p.waitForTimeout(900);
    assert.equal(m.previas.length, 1);
    assert.equal(await T('pub-usa-plano').count() + await T('pub-plano-esgotado').count(), 0, `${rotulo}: quem não tem plano não vê aviso`);
    await T('pub-enviar').click();
    await T('pub-feito').waitFor();
    assert.equal(await T('pub-feito-plano-restam').count(), 0, `${rotulo}: sem plano, sem linha de restantes`);
  }
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: ok`);
}

for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 860 }]) {
  const r = `link/${vp.width}`;
  await link(vp, TEL.restam2, { restam: 'Restam 2 atendimentos do seu plano em outubro/2026.', chave: '2' }, `${r}/restam 2`);
  await link(vp, TEL.restam1, { restam: 'Restam 1 atendimento do seu plano em outubro/2026.', chave: '1' }, `${r}/restam 1`);
  await link(vp, TEL.ultimo, { restam: 'Este foi o último atendimento do seu plano em outubro/2026.', chave: 'ultimo' }, `${r}/último`);
  await link(vp, TEL.esgotado, { esgotado: true }, `${r}/esgotado`);
  await link(vp, TEL.restrito, { restrito: true }, `${r}/restrito`);
  await link(vp, TEL.sem, {}, `${r}/sem plano`);
}
console.log('e2e130 ok');
