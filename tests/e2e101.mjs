/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Horários fixos do assinante no site real (dist/index-real.html) contra um servidor falso (v128): botão na aba Planos e na ficha do cliente, formulário (dia, hora, profissional,
// serviço do plano), limite de 3, erro do servidor com a mensagem dele, salvar manda a lista inteira, aviso de quantos agendamentos saíram e o resumo na linha da assinatura.
// Barbearia e estética × 390 px (fonte larga) e desktop × claro/escuro.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const BRUNO = id(60), ASS = id(101), PLANO = id(70), ALAN = id(1), KIKO = id(2), SRV = id(50), FIXO = id(200);
const LOJAS = [{ slug: 'offbox', nome: 'Offbox', tipo: 'barbearia' }, { slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva' }];
const CLIENTES = [{ id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '5511999990001', cpfMascarado: '***.***.***-00', dadosCompletos: true, veiculos: [] }];

function modelo() {
  const m = { fixos: [], apagados: 0, seq: 300 };
  const assinatura = () => ({ id: ASS, clienteId: BRUNO, cliente: { id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno' }, planoId: PLANO,
    plano: { nome: 'Plano A', preco: 80, cortes: 4, servicoIds: [SRV], adianta: 1, acumuloMeses: 2, intervaloDias: 0 }, status: 'ativa', inicioMes: '2026-10', diaCobranca: 5,
    pagamentos: [], fixos: m.fixos, divida: 0, dividaQuitada: false, criadoEm: '2026-10-28T10:00:00Z', encerradoEm: null, log: [],
    saldo: { planoNome: 'Plano A', situacao: 'ativa', cortesPorMes: 4, mes: '2026-10', pagoMes: true, restantes: 4, usadosNoMes: 0, maisPermitidos: 0, pagoAte: '2026-10', atrasado: false }, extrato: [] });
  m.trata = (c, { json }) => {
    if (c.u === '/api/clientes' && c.m === 'GET') return json(200, CLIENTES) || true;
    let r = /^\/api\/clientes\/([^/]+)$/.exec(c.u);
    if (r && c.m === 'GET') return json(200, CLIENTES.find((x) => x.id === r[1])) || true;
    if (c.u === '/api/servicos') return json(200, [{ id: SRV, codigo: '1', nome: 'Corte', categoria: '', preco: 45, duracaoMin: 45, intervaloMin: 0, ativo: true }]) || true;
    if (c.u === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]) || true;
    if (c.u === '/api/planos' && c.m === 'GET') return json(200, { planos: [{ id: PLANO, nome: 'Plano A', descricao: '', preco: 80, cortes: 4, servicoIds: [SRV], adianta: 1, acumuloMeses: 2, intervaloDias: 0, ativo: true }],
      assinaturas: [assinatura()], pedidos: [], aReceber: [], mes: '2026-10' }) || true;
    if (c.u === `/api/assinaturas/${ASS}/fixos` && c.m === 'POST') {
      const lista = c.corpo.fixos;
      if (lista.some((f) => f.hm === '03:00')) return json(409, { mensagem: 'Esse horário é fixo de um cliente com plano. Escolha outro horário.' }) || true;
      const apagados = m.fixos.filter((a) => !lista.some((f) => f.dia === a.dia && f.hm === a.hm)).length * 2;
      m.fixos = lista.map((f) => ({ id: m.fixos.find((a) => a.dia === f.dia && a.hm === f.hm)?.id || id(m.seq++), dia: f.dia, hm: f.hm, profissionalId: f.profissionalId, servicoIds: f.servicoIds }));
      return json(200, { assinatura: assinatura(), apagados }) || true;
    }
    return false;
  };
  return m;
}

async function cenario(loja, vp, modo) {
  const rotulo = `${loja.slug}/${vp.width}/${modo}`;
  const m = modelo();
  const estado = { loja: { slug: loja.slug, nome: loja.nome, tipo: loja.tipo, logo: null, temaCor: null, temaCor2: null } };
  const srv = await subirServidor(m.trata, estado);
  const nav = await abrirNavegador();
  const { p } = await nav.abrir(srv.url, { viewport: vp, aba: 'planos', fonteLarga: vp.width < 700 });
  await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  const T = (t) => p.getByTestId(t);
  const semRolagem = (onde) => nav.semRolagem(p, `${rotulo}: ${onde}`);

  // 1. aba Planos: a linha da assinatura mostra "nenhum" e tem o botão
  await T('assinaturas-lista').waitFor();
  assert.match(await T(`fixos-resumo-${ASS}`).innerText(), /Horários fixos: nenhum/);
  await T(`fixos-${ASS}`).click();
  await T('fixos-form').waitFor();
  await T('fixo-add').waitFor();
  assert.equal(await T('fixos-vazio').count(), 1);
  await semRolagem('formulário vazio');

  // 2. adicionar até 3; o quarto não existe; remover libera de novo
  for (let n = 0; n < 3; n++) await T('fixo-add').click();
  assert.equal(await T('fixo-add').count(), 0, `${rotulo}: no máximo 3`);
  await T('fixo-remover-2').click();
  assert.equal(await T('fixo-add').count(), 1);
  await T('fixo-remover-1').click();
  await T('fixo-dia-0').selectOption('3');           // quarta
  await T('fixo-hm-0').fill('18:00');
  await T('fixo-prof-0').selectOption(KIKO);
  await semRolagem('um horário fixo');

  // 3. erro do servidor aparece com a mensagem dele e nada é salvo
  await T('fixo-hm-0').fill('03:00');
  await T('salvar-fixos').click();
  await T('planos-erro-form').waitFor();
  assert.match(await T('planos-erro-form').innerText(), /fixo de um cliente com plano/);
  assert.equal(m.fixos.length, 0);

  // 4. salvar: manda a lista inteira (dia numérico, serviço do plano) e volta com o resumo
  await T('fixo-hm-0').fill('18:00');
  await T('salvar-fixos').click();
  await T('planos-aviso').waitFor();
  assert.match(await T('planos-aviso').innerText(), /Horários fixos salvos\./);
  const corpo = srv.chamadas.filter((c) => c.m === 'POST' && c.u === `/api/assinaturas/${ASS}/fixos`).at(-1).corpo;
  assert.deepEqual(corpo.fixos, [{ dia: 3, hm: '18:00', profissionalId: KIKO, servicoIds: [SRV] }]);
  assert.match(await T(`fixos-resumo-${ASS}`).innerText(), /qua 18:00/);
  ok(`${rotulo}: aba Planos (limite de 3, erro do servidor, salvar)`);

  // 5. tirar o fixo: o servidor diz quantos agendamentos saíram da agenda
  await T(`fixos-${ASS}`).click();
  await T('fixo-linha-0').waitFor();
  assert.equal(await T('fixo-dia-0').inputValue(), '3', 'abre com o que está salvo');
  await T('fixo-remover-0').click();
  await T('salvar-fixos').click();
  await T('planos-aviso').waitFor();
  assert.match(await T('planos-aviso').innerText(), /2 agendamentos que não valem mais saíram da agenda/);
  assert.match(await T(`fixos-resumo-${ASS}`).innerText(), /nenhum/);

  // 6. na ficha do cliente: resumo, botão em Editar plano e volta à ficha sem perder o que foi digitado
  await T('nav-clientes').click();
  await T('cli-lista').waitFor();
  await p.getByRole('button', { name: 'Editar Bruno Lima' }).click();
  await T('plano-cli-ativo').waitFor();
  await T('cli-apelido').fill('Bruzão');
  assert.match(await T('plano-cli-fixos').innerText(), /Horários fixos: nenhum/);
  await T('plano-cli-editar').click();
  await T('plano-cli-fixos-btn').click();
  await T('fixos-form').waitFor();
  await T('fixo-add').click();
  await T('salvar-fixos').click();
  await T('plano-cli-aviso').waitFor();
  assert.match(await T('plano-cli-fixos').innerText(), /seg 18:00/);
  assert.equal(await T('cli-apelido').inputValue(), 'Bruzão', `${rotulo}: a ficha não perdeu o que foi digitado`);
  await semRolagem('ficha com horário fixo');
  ok(`${rotulo}: ficha do cliente`);
  assert.deepEqual(nav.erros, [], nav.erros.join('\n'));
  await nav.b.close(); srv.fechar();
}

const TELAS = [{ width: 390, height: 800 }, { width: 1366, height: 820 }];
let i = 0;
for (const loja of LOJAS) for (const vp of TELAS) await cenario(loja, vp, i++ % 2 === 0 ? 'claro' : 'escuro');
