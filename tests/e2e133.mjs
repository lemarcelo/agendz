/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F (V60, duração indefinida) no site real (dist/index-real.html) contra um servidor falso:
//  1. #agendar: serviço de duração indefinida não tem grade; a página mostra a descrição da duração, os valores (lista ou intervalo) e o botão "Combinar agendamento", um link
//     https://wa.me comum (target _blank, nunca whatsapp://) com o número final que o servidor mandou (vazio = wa.me sem contato); só indefinido = nenhum botão de horário;
//     mistura = o pedido leva SÓ o serviço fixo e a tela avisa o que falta combinar (resumo e confirmação); estética: o veículo vem antes e o fluxo é o mesmo;
//  2. Atender (dono): serviço indefinido troca o "Quando" pela grade "Dia e horário": marca/desmarca horários de 30 min (X no marcado), soma em minutos, avisa quando a soma
//     não atende o mínimo do serviço fixo da mistura, pede o valor final (atalho da lista) e envia blocos [{inicio,fim}] + valores, sem `inicio` solto e sem atribuições.
// 390 px com fonte larga (DejaVu Sans) e 1366 px; sem rolagem lateral; sem pageerror nem diálogo nativo. E2E_CAPTURAS=<pasta> grava as imagens.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';
import { acessarSecao } from './navegacao-real.mjs';

const CORTE = id(50), COLOR = id(51), FAIXA = id(52), ALAN = id(1);
const CAP = process.env.E2E_CAPTURAS;
const LOJAS = {
  barbearia: { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null },
  estetica: { slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null },
};
const ZAP = '5553999990000';
const combinarLista = (whatsapp) => ({ duracaoTexto: 'De 1 a 3 dias, conforme o cabelo', mensagem: '', whatsapp, precoModo: 'lista', opcoes: [{ descricao: 'Mechas curtas', valor: 180 }, { descricao: 'Mechas longas', valor: 320 }], precoMax: null });
const combinarFaixa = (whatsapp) => ({ duracaoTexto: '', mensagem: 'Oi! Quero um orçamento.', whatsapp, precoModo: 'faixa', opcoes: [], precoMax: 450 });

function modelo({ whatsapp = ZAP, estetica = false } = {}) {
  const m = { pedidos: [], atendimentos: [] };
  m.trata = (c, { json }) => {
    if (c.u === '/api/publico/agendar') {
      return json(200, { ativo: true, aviso: null, diasMax: 30, exigeTelefone: true, exigeNome: true, tipo: estetica ? 'estetica_automotiva' : 'barbearia',
        ...(estetica ? { portes: [{ id: 'medio', nome: 'Médio', exemplo: 'Ex.: Onix' }], exigeVeiculo: ['placa', 'modelo', 'porte'] } : {}),
        servicos: [
          { id: CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0, ...(estetica ? { precos: { medio: 40 }, duracoes: { medio: 30 } } : {}) },
          { id: COLOR, nome: 'Coloração', duracao: 0, preco: 180, antecedenciaH: 0, combinar: combinarLista(whatsapp), ...(estetica ? { precos: {}, duracoes: {} } : {}) },
          { id: FAIXA, nome: 'Platinado', duracao: 0, preco: 250, antecedenciaH: 0, combinar: combinarFaixa(''), ...(estetica ? { precos: {}, duracoes: {} } : {}) },
        ],
        profissionais: [{ id: ALAN, nome: 'Alan', foto: null, servicoIds: [CORTE] }] });
    }
    if (c.u === '/api/publico/dias') return json(200, ['2026-10-30']);
    if (c.u === '/api/publico/horarios') return json(200, [{ inicio: '2026-10-30T12:00:00Z', profissionalId: ALAN }]);
    if (c.u === '/api/publico/planos/uso') return json(200, { usaPlano: false, esgotado: false, restrito: false });
    if (c.u === '/api/publico/agendamentos' && c.m === 'POST') {
      m.pedidos.push(c);
      const resumo = { id: id(401), inicio: '2026-10-30T12:00:00.000Z', fim: '2026-10-30T12:30:00.000Z', status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Corte'], duracao: 30, total: 40, desconto: 0, cupom: null, profissional: 'Alan', ativo: true, podeCancelar: true };
      return json(201, { agendamento: resumo, token: 'ab'.repeat(24) });
    }
    // ---- painel (dono)
    if (c.u === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }]);
    if (c.u === '/api/servicos') return json(200, [
      { id: CORTE, codigo: '1', nome: 'Corte', categoria: '', preco: 40, duracaoMin: 45, intervaloMin: 0, ativo: true },
      { id: COLOR, codigo: '2', nome: 'Coloração', categoria: '', preco: 180, duracaoMin: null, intervaloMin: 0, ativo: true, precoModo: 'lista', precoOpcoes: [{ descricao: 'Mechas curtas', valor: 180 }, { descricao: 'Mechas longas', valor: 320 }], duracaoTexto: 'Dias', combinaIds: [] },
    ]);
    if (c.u === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [] });
    if (c.u === '/api/atendimentos' && c.m === 'POST') {
      m.atendimentos.push(c);
      const ini = c.corpo.blocos ? c.corpo.blocos[0].inicio : new Date().toISOString();
      return json(201, { id: id(300 + m.atendimentos.length), clienteId: null, profissionalId: ALAN, inicio: ini, fim: ini, fimOcupado: ini, status: 'confirmado', encaixe: false, total: 180, servicos: [{ servicoId: COLOR, nome: 'Coloração', preco: 180, duracaoMin: 0 }], conflitosPendentes: [], origem: 'painel', reagendado: false, statusManual: false, motivoRetroativo: null, historico: [] });
    }
    if (c.u === '/api/agendamentos' && c.m === 'GET') return json(200, []);
    return false;
  };
  return m;
}

const fonteLarga = (p) => p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
const foto = async (p, nome, vp) => { if (!CAP) return; await p.waitForTimeout(350); await p.screenshot({ path: `${CAP}/f-${nome}-${vp.width}.png`, fullPage: true }); };

async function pagina(srv, vp) {
  const nav = await abrirNavegador();
  const ctx = await nav.b.newContext({ viewport: vp, hasTouch: vp.width < 700, isMobile: vp.width < 700, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => nav.erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { nav.erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  return { nav, ctx, p };
}

async function link(vp, { whatsapp = ZAP, estetica = false } = {}) {
  const rotulo = `link/${estetica ? 'estetica' : 'barbearia'}/${whatsapp ? 'com-zap' : 'sem-zap'}/${vp.width}`;
  const m = modelo({ whatsapp, estetica });
  const srv = await subirServidor(m.trata, { loja: estetica ? LOJAS.estetica : LOJAS.barbearia });
  const { nav, p } = await pagina(srv, vp);
  await p.goto(srv.url + '#agendar');
  if (vp.width < 700) await fonteLarga(p);
  const T = (t) => p.getByTestId(t);
  if (estetica) { // o veículo vem antes do serviço
    await T('pub-placa').fill('ABC1D23'); await T('pub-modelo').fill('Onix'); await T(`pub-porte-medio`).click(); await T('pub-continuar-0').click();
  }
  // a lista mostra a duração descrita e o preço do indefinido
  await T(`pub-srv-${COLOR}`).waitFor();
  const itemCor = p.locator('label.pub-item', { has: T(`pub-srv-${COLOR}`) });
  assert.match(await itemCor.innerText(), /De 1 a 3 dias, conforme o cabelo/); assert.match((await itemCor.innerText()).replace(/\s/g, ' '), /A partir de R\$ 180,00/);
  assert.match((await p.locator('label.pub-item', { has: T(`pub-srv-${FAIXA}`) }).innerText()).replace(/\s/g, ' '), /R\$ 250,00 a R\$ 450,00/);

  // 1) só indefinido: sem botão de horário, painel com valores e o botão Combinar
  await T(`pub-srv-${COLOR}`).check();
  await T(`pub-combinar-${COLOR}`).waitFor();
  assert.equal(await T('pub-continuar-1').count(), 0, `${rotulo}: só indefinido não tem grade`);
  assert.equal(await T('pub-barb-qualquer').count(), 0, `${rotulo}: sem "Com quem?" quando não há horário`);
  assert.equal(await T(`pub-combinar-valores-${COLOR}`).locator('li').count(), 2, `${rotulo}: a lista de valores com descrição`);
  assert.match(await T(`pub-combinar-valores-${COLOR}`).innerText(), /Mechas longas[\s\S]*R\$\s?320,00/);
  const btn = T(`pub-combinar-btn-${COLOR}`);
  const href = await btn.getAttribute('href');
  if (whatsapp) assert.ok(href.startsWith(`https://wa.me/${ZAP}?text=`), `${rotulo}: link wa.me comum com o número final (${href})`);
  else assert.ok(href.startsWith('https://wa.me/?text='), `${rotulo}: sem número abre o WhatsApp sem contato (${href})`);
  assert.ok(!href.startsWith('whatsapp:')); assert.equal(await btn.getAttribute('target'), '_blank');
  assert.match(decodeURIComponent(href.split('text=')[1]), /Coloração/);
  await nav.semRolagem(p, `${rotulo}: só indefinido`);
  await foto(p, `link-${estetica ? 'estetica' : 'barbearia'}-so-indefinido`, vp);

  // mensagem escrita pelo dono + intervalo de valor
  await T(`pub-srv-${COLOR}`).uncheck(); await T(`pub-srv-${FAIXA}`).check();
  assert.match(await T(`pub-combinar-preco-${FAIXA}`).innerText(), /R\$\s?250,00 a R\$\s?450,00/);
  assert.equal(decodeURIComponent((await T(`pub-combinar-btn-${FAIXA}`).getAttribute('href')).split('text=')[1]), 'Oi! Quero um orçamento.');
  assert.ok((await T(`pub-combinar-btn-${FAIXA}`).getAttribute('href')).startsWith('https://wa.me/?text='), `${rotulo}: serviço sem destino abre sem contato`);
  await T(`pub-srv-${FAIXA}`).uncheck();

  // 2) mistura: o pedido leva só o fixo; a tela diz o que falta combinar
  await T(`pub-srv-${CORTE}`).check(); await T(`pub-srv-${COLOR}`).check();
  await T(`pub-combinar-${COLOR}`).waitFor();
  assert.match(await T('pub-total').innerText(), /30 min/, `${rotulo}: o total só conta o serviço de duração fixa`);
  await nav.semRolagem(p, `${rotulo}: mistura`);
  await foto(p, `link-${estetica ? 'estetica' : 'barbearia'}-mistura`, vp);
  await T('pub-continuar-1').click();
  await T('pub-dia-2026-10-30').click(); await T('pub-hora-0900').click(); await T('pub-continuar-2').click();
  assert.match(await T('pub-resumo-combinar').innerText(), /Falta combinar com a loja: Coloração/);
  await T('pub-nome').fill('Maria Souza'); await T('pub-tel').fill('53999000001');
  await T('pub-enviar').click();
  await T('pub-feito').waitFor();
  assert.deepEqual(m.pedidos[0].corpo.servicoIds, [CORTE], `${rotulo}: a coloração nunca entra no pedido`);
  assert.match(await T('pub-combinar-aviso').innerText(), /Falta combinar o horário de Coloração com a loja/);
  assert.equal(await T(`pub-combinar-btn-${COLOR}`).count(), 1, `${rotulo}: o botão também fica na confirmação`);
  await nav.semRolagem(p, `${rotulo}: confirmação`);
  await foto(p, `link-${estetica ? 'estetica' : 'barbearia'}-confirmacao`, vp);
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: ok`);
}

async function atender(vp) {
  const rotulo = `atender/${vp.width}`;
  const m = modelo();
  const srv = await subirServidor(m.trata, { loja: LOJAS.barbearia, sessao: { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] } });
  const { nav, p } = await pagina(srv, vp);
  await p.goto(srv.url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  if (vp.width < 700) await fonteLarga(p);
  await acessarSecao(p, 'nav-agenda');
  const T = (t) => p.getByTestId(t);
  await T('agenda-dia').waitFor();
  await T('atender-abrir').click(); await T('atender-form').waitFor();
  // a lista mostra "Duração indefinida" e o preço de base
  assert.match((await p.locator('label.check-linha', { has: T(`atender-srv-${COLOR}`) }).innerText()).replace(/\s/g, ' '), /Dias · A partir de R\$ 180,00/);
  await T(`atender-srv-${COLOR}`).check();
  await T('atender-prox-quando').click();
  await T('atender-blocos').waitFor();
  assert.equal(await T('atender-agora').count(), 0, `${rotulo}: com serviço indefinido não há "Agora"; o horário vem da grade`);
  assert.equal(await T('atender-blocos-vazio').count(), 1);
  // vai para 30/10 e marca 09:00, 09:30 e 10:00 (um bloco de 90 min) e 13:00 (outro)
  await T('atender-bloco-dia-prox').click(); await T('atender-bloco-dia-prox').click();
  assert.equal(await T('atender-bloco-dia').inputValue(), '2026-10-30');
  for (const h of ['0900', '0930', '1000', '1300']) await T(`atender-bloco-h-${h}`).click();
  assert.equal(await T('atender-bloco-h-0930').getAttribute('aria-pressed'), 'true');
  assert.equal(await T('atender-bloco-h-0930').locator('.bloco-x').count(), 1, `${rotulo}: X à direita do horário marcado`);
  assert.match(await T('atender-blocos-total').innerText(), /Total: 2 h/, `${rotulo}: 120 min no total`);
  assert.equal(await T('atender-bloco-item').count(), 2, `${rotulo}: dois blocos (09:00–10:30 e 13:00–13:30)`);
  // desmarca 09:30 pelo X: o bloco se parte em dois e o total cai
  await T('atender-bloco-h-0930').click();
  assert.equal(await T('atender-bloco-h-0930').getAttribute('aria-pressed'), 'false');
  assert.equal(await T('atender-bloco-item').count(), 3);
  assert.match(await T('atender-blocos-total').innerText(), /Total: 1 h 30 min/);
  await T('atender-bloco-h-0930').click(); // volta
  const caixa = await T('atender-bloco-h-0900').boundingBox();
  assert.ok(caixa.height >= 40, `${rotulo}: alvo de toque`);
  // valor final: atalho da lista
  await T(`atender-valor-op-${COLOR}-1`).click();
  assert.equal(await T(`atender-valor-${COLOR}`).inputValue(), '320');
  await nav.semRolagem(p, `${rotulo}: grade`);
  await foto(p, 'atender-grade', vp);
  // mistura com o Corte (45 min): 30 min de horários não atendem o mínimo
  await T('atender-voltar').click();
  await T(`atender-srv-${CORTE}`).check();
  await T('atender-prox-quando').click();
  // os horários e o dia continuam marcados; desmarca 09:00, 09:30 e 10:00 e deixa só 13:00 (30 min)
  for (const h of ['0900', '0930', '1000']) await T(`atender-bloco-h-${h}`).click();
  assert.equal(await T('atender-bloco-h-1300').getAttribute('aria-pressed'), 'true');
  await T('atender-blocos-curto').waitFor();
  assert.match(await T('atender-blocos-curto').innerText(), /não atende o mínimo/);
  await nav.semRolagem(p, `${rotulo}: aviso da mistura`);
  await foto(p, 'atender-mistura-curta', vp);
  await T('atender-prox-cliente').click();
  await T('atender-telefone').fill('(11) 98888-7777');
  await T('salvar-atender').click();
  await T('atender-erro').waitFor();
  assert.match(await T('atender-erro').innerText(), /somam 30 min.*ao menos 45 min/, `${rotulo}: a tela barra antes de enviar`);
  assert.equal(m.atendimentos.length, 0, `${rotulo}: nada foi ao servidor`);
  // erro some ao trocar de etapa
  await T('atender-voltar').click();
  await T('atender-erro').waitFor({ state: 'detached' }); // o erro não vaza para a etapa anterior
  // completa a soma (mais 30 min) e envia
  await T('atender-bloco-h-1330').click();
  await T('atender-prox-cliente').click();
  await T('atender-telefone').fill('(11) 98888-7777');
  await T('salvar-atender').click();
  await T('atender-sucesso').waitFor();
  const corpo = m.atendimentos[0].corpo;
  assert.deepEqual(corpo.servicoIds.sort(), [CORTE, COLOR].sort());
  assert.deepEqual(corpo.blocos, [{ inicio: new Date('2026-10-30T13:00:00-03:00').toISOString(), fim: new Date('2026-10-30T14:00:00-03:00').toISOString() }], `${rotulo}: blocos em ISO, vizinhos fundidos`);
  assert.deepEqual(corpo.valores, [{ servicoId: COLOR, valor: 320 }]);
  assert.ok(!('inicio' in corpo), `${rotulo}: o início é o do primeiro bloco`); assert.ok(!('atribuicoes' in corpo));
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: ok`);
}

for (const vp of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  await link(vp);
  await link(vp, { whatsapp: '' });
  await link(vp, { estetica: true });
  await atender(vp);
}
console.log('e2e133 ok');
