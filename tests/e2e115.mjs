/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B10 (limite de horários pelo link e registro de barrados) no site real (dist/index-real.html) contra um servidor falso:
//  1. Estabelecimento > link: campo "horários por cliente" (padrão 3, 1 a 20; fora disso nem sai), salvar manda o limite, a contagem de pedidos barrados aparece por motivo
//     e avisa que não guarda nome, telefone nem IP;
//  2. página do cliente: o selo que o servidor entrega na abertura volta no pedido (e só ele), sem Authorization.
// 390 px com fonte larga e desktop × claro/escuro.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const CORTE = id(50), ALAN = id(1);
const SELO = '1730000000.' + 'c'.repeat(32);
const LOJA = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };

function modelo(barrados) {
  const m = { link: { ativo: true, diasMax: 30, disponivel: true, telefoneObrigatorio: true, nomeObrigatorio: true, limiteAbertos: 3, barrados, pendencias: [] }, pedidos: [] };
  m.trata = (c, { json }) => {
    if (c.u === '/api/estabelecimento/link-agendamento') {
      if (c.m === 'PUT') { m.link = { ...m.link, ...c.corpo }; m.puts = [...(m.puts || []), c]; }
      return json(200, m.link);
    }
    if (c.u === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, exigeTelefone: true, selo: SELO, servicos: [{ id: CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }], profissionais: [{ id: ALAN, nome: 'Alan', foto: null }] });
    if (c.u === '/api/publico/dias') return json(200, ['2026-10-30']);
    if (c.u === '/api/publico/horarios') return json(200, [{ inicio: '2026-10-30T12:00:00Z', profissionalId: ALAN }]);
    if (c.u === '/api/publico/planos/uso') return json(200, { usaPlano: false });
    if (c.u === '/api/publico/agendamentos' && c.m === 'POST') {
      m.pedidos.push(c);
      const q = Date.parse(c.corpo.inicio);
      return json(201, { agendamento: { id: id(400), inicio: new Date(q).toISOString(), fim: new Date(q + 1800000).toISOString(), status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Corte'], duracao: 30, total: 40, desconto: 0, cupom: null, profissional: 'Alan', ativo: true, podeCancelar: true }, token: 'ab'.repeat(24), usouPlano: false });
    }
    return false;
  };
  return m;
}

async function configuracao(vp, modo) {
  const rotulo = `config/${vp.width}/${modo}`;
  const m = modelo({ total: 0, porMotivo: { limite_cliente: 0, isca: 0, rapido: 0, selo_invalido: 0, frequencia: 0 } });
  const srv = await subirServidor(m.trata, { loja: LOJA });
  const nav = await abrirNavegador();
  const { p } = await nav.abrir(srv.url, { viewport: vp, aba: 'estabelecimento', fonteLarga: vp.width < 700 });
  await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  const T = (t) => p.getByTestId(t);
  await T('link-limite').waitFor();
  assert.equal(await T('link-limite').inputValue(), '3', `${rotulo}: padrão 3`);
  assert.match(await T('link-barrados').innerText(), /Nenhum pedido barrado/);
  assert.match(await T('link-barrados').innerText(), /não guarda nome, telefone nem IP/);
  await nav.semRolagem(p, `${rotulo}: link`);
  // fora de 1 a 20 nem sai
  for (const ruim of ['0', '21']) {
    await T('link-limite').fill(ruim);
    await T('link-salvar').click();
    assert.match(await T('link-erro').innerText(), /1 a 20/, `${rotulo}: ${ruim} é recusado`);
  }
  assert.equal((m.puts || []).length, 0, `${rotulo}: limite fora da faixa nem chega ao servidor`);
  await T('link-limite').fill('1');
  await T('link-salvar').click(); await T('link-ok').waitFor();
  assert.equal(m.puts.at(-1).corpo.limiteAbertos, 1);
  assert.equal(await T('link-limite').inputValue(), '1');
  // contagem por motivo
  m.link.barrados = { total: 7, porMotivo: { limite_cliente: 4, isca: 2, rapido: 1, selo_invalido: 0, frequencia: 0 } };
  await T('nav-agenda').click(); await T('nav-estabelecimento').click(); // volta à tela: o cartão lê de novo
  await T('link-barrados').waitFor();
  const t = await T('link-barrados').innerText();
  assert.match(t, /barrados nos últimos 30 dias: 7/); assert.match(t, /acima do limite: 4/); assert.match(t, /robô: 2/); assert.match(t, /rápido demais: 1/); assert.doesNotMatch(t, /selo falso/);
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: limite por cliente (1 a 20) e contagem de barrados`);
}

async function cliente(vp, modo) {
  const rotulo = `cliente/${vp.width}/${modo}`;
  const m = modelo({ total: 0, porMotivo: { limite_cliente: 0, isca: 0, rapido: 0, selo_invalido: 0, frequencia: 0 } });
  const srv = await subirServidor(m.trata, { loja: LOJA });
  const nav = await abrirNavegador();
  const ctx = await nav.b.newContext({ viewport: vp, timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => nav.erros.push('PAGE: ' + e.message));
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
  await T('pub-tel').fill('53999000002');
  await T('pub-enviar').click();
  await T('pub-feito').waitFor();
  assert.equal(m.pedidos.length, 1);
  assert.equal(m.pedidos[0].corpo.selo, SELO, `${rotulo}: o selo da abertura volta no pedido`);
  assert.ok(srv.chamadas.filter((x) => x.u.startsWith('/api/publico/')).every((x) => !x.auth), `${rotulo}: nenhuma rota do cliente leva Authorization`);
  assert.deepEqual(nav.erros, [], `${rotulo}: sem erro de página`);
  await nav.b.close(); srv.fechar();
  ok(`${rotulo}: selo da página volta no pedido`);
}

const VPS = [{ width: 390, height: 844 }, { width: 1280, height: 860 }];
for (const vp of VPS) {
  for (const modo of ['claro', 'escuro']) {
    await configuracao(vp, modo);
    await cliente(vp, modo);
  }
}
console.log('e2e115 ok');
