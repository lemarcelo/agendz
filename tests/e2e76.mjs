/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Auditoria da Agenda do site real (dist/index-real.html): o que o e2e46 não cobre. Estado que se perde quando o cartão sai da lista ou o componente desmonta
// (cancelar, reativar, remarcar com troca de profissional), dado vazio ou estranho (cliente sem permissão de ler Clientes, cliente fora da lista, telefone inválido,
// sem serviço, só produto, sem cadastro), erro do servidor e da rede com a mensagem na tela, duplo clique, navegar com cartão aberto, muitos cartões em 390 px.
import assert from 'node:assert/strict';
import { subirServidor, abrirNavegador, ok, U, id } from './real-util.mjs';

const ALAN = id(1), KIKO = id(2), BRUNO = id(11), CAIO = id(12), DEBORA = id(13), LONGO = id(14), EVA = id(15), FORA = id(99);
const clientes = [
  { id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '11999990001' }, { id: CAIO, nome: 'Caio Souza', apelido: '', telefone: '11999990002' },
  { id: DEBORA, nome: 'Débora Reis', apelido: '', telefone: '' }, { id: EVA, nome: 'Eva Dias', apelido: '', telefone: '123' },
  { id: LONGO, nome: 'Maria Aparecida de Fátima Nascimento Albuquerque Cavalcanti da Silva Sauro', apelido: '', telefone: '11999990003' },
];
let banco = [];
let n = 0;
const ag = (inicio, min, prof, cli, status, nome, extra = {}) => {
  const i = Date.parse(U(inicio));
  banco.push({ id: id(100 + ++n), clienteId: cli, profissionalId: prof, inicio: new Date(i).toISOString(), fim: new Date(i + min * 60000).toISOString(), fimOcupado: new Date(i + (min + 10) * 60000).toISOString(), status, encaixe: false, total: 45,
    servicos: nome ? [{ servicoId: id(50), nome, preco: 45, duracaoMin: min }] : [], conflitosPendentes: [], origem: 'painel', reagendado: false, statusManual: false, historico: [], ...extra });
  return banco.at(-1);
};
const semear = () => {
  banco = []; n = 0;
  ag('2026-10-28T09:00:00', 45, ALAN, BRUNO, 'confirmado', 'Corte');      // 101 cancelar
  ag('2026-10-28T11:00:00', 30, ALAN, CAIO, 'confirmado', 'Barba');       // 102 remarcar trocando de profissional
  ag('2026-10-28T12:00:00', 30, ALAN, DEBORA, 'a_confirmar', 'Corte');    // 103 cliente sem telefone
  ag('2026-10-28T13:00:00', 30, ALAN, EVA, 'confirmado', 'Corte');        // 104 telefone inválido
  ag('2026-10-28T14:00:00', 30, ALAN, FORA, 'confirmado', 'Corte');       // 105 cadastro que a lista de clientes não traz
  ag('2026-10-28T15:00:00', 30, ALAN, BRUNO, 'cancelado', 'Corte', { motivoCancelamento: 'cliente' }); // 106 reativar
  ag('2026-10-28T16:00:00', 30, ALAN, null, 'confirmado', null);          // 107 sem serviço e sem cadastro
  ag('2026-10-28T17:00:00', 30, ALAN, CAIO, 'confirmado', 'Corte');       // 108 troca profissional e horário
  ag('2026-10-28T18:00:00', 30, ALAN, null, 'confirmado', null, { totalProdutos: 30, total: 0, produtos: [{ materialId: id(70), nome: 'Pomada', qtd: 2, preco: 15, vendedorId: ALAN }] }); // 109 só produto
  ag('2026-10-28T19:00:00', 30, ALAN, null, 'confirmado', 'Corte', { nomeAvulso: 'Passante', total: 0 }); // 110 serviço sem preço
  ag('2026-10-29T10:00:00', 45, ALAN, BRUNO, 'confirmado', 'Corte');      // 111 cancelar pela lista de próximos
};
semear();
const estado = {};
let clientesStatus = 200;
let atraso = 0;
const srv = await subirServidor((c, { json }) => {
  if (c.u === '/api/clientes') return clientesStatus === 200 ? json(200, clientes) : json(clientesStatus, { mensagem: 'Você não tem acesso a esta área.' });
  if (c.u === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]);
  if (c.u === '/api/agendamentos' && c.m === 'GET') {
    const de = Date.parse(new URLSearchParams(c.q).get('de')), ate = Date.parse(new URLSearchParams(c.q).get('ate'));
    return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) > de));
  }
  const m = /^\/api\/agendamentos\/([^/]+)(\/status|\/remarcar)?$/.exec(c.u);
  if (!m) return false;
  const a = banco.find((x) => x.id === m[1]);
  if (!a) return json(404, { mensagem: 'Agendamento não encontrado.' });
  if (!m[2]) return json(200, a);
  setTimeout(() => {
    if (m[2] === '/status') a.status = c.corpo.status;
    else { a.inicio = c.corpo.inicio; a.fim = new Date(Date.parse(c.corpo.inicio) + 30 * 60000).toISOString(); a.fimOcupado = new Date(Date.parse(c.corpo.inicio) + 40 * 60000).toISOString(); a.reagendado = true; if (c.corpo.profissionalId) a.profissionalId = c.corpo.profissionalId; }
    json(200, a);
  }, atraso);
  return true;
}, estado);
const { b, erros, pedidosWa, abrir, semRolagem } = await abrirNavegador();
const T = (p, t) => p.locator(`[data-testid="${t}"]`);
const texto = (p, t) => T(p, t).innerText();
const cartaoDe = (p, hora, lista = 'cartao') => p.locator(`[data-testid="${lista}"]`, { hasText: hora }).first();
const abrirCartao = (p, hora) => cartaoDe(p, hora).locator('[data-testid="cartao-abrir"]').click();
const remarcarPara = async (p, hora, destino, { prof } = {}) => {
  await abrirCartao(p, hora);
  await T(p, 'acao-remarcar').click();
  await T(p, 'remarcar-quando').fill(destino);
  if (prof) await T(p, 'remarcar-prof').selectOption(prof);
  await T(p, 'remarcar-salvar').click();
};

// 1. cancelar: erro do servidor (500) com a mensagem e botões livres; depois certo; o aviso sobrevive à saída do cartão da lista
{
  semear(); atraso = 0;
  const { ctx, p } = await abrir(srv.url);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 9);
  await abrirCartao(p, '09:00'); await T(p, 'acao-cancelar').click();
  srv.estado.falhar = { rota: /\/status$/, status: 500, mensagem: 'Falha ao gravar o status.' };
  await T(p, 'cancelar-sim').click();
  await T(p, 'agendamento-erro').waitFor();
  assert.match(await texto(p, 'agendamento-erro'), /Falha ao gravar o status/);
  assert.equal(await T(p, 'cancelar-sim').isDisabled(), false, 'depois do erro dá para tentar de novo');
  await T(p, 'cancelar-sim').click();
  await p.waitForFunction(() => /Agendamento cancelado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  assert.equal(await T(p, 'agendamento-erro').count(), 0, 'o erro antigo some');
  assert.equal(await p.locator('[data-testid="cartao"]', { hasText: '09:00' }).count(), 0, 'o cartão sai da lista do dia');
  assert.match(await texto(p, 'cancelados-resumo'), /Cancelados \(2\)/);
  assert.match(await texto(p, 'agenda-aviso'), /Agendamento cancelado/, 'o aviso continua depois do cartão sair');
  ok('cancelar: 500 mostra a mensagem do servidor, tentar de novo funciona, aviso e linha de cancelados atualizados');

  // 403 e queda de rede também aparecem na tela
  await abrirCartao(p, '11:00'); await T(p, 'acao-cancelar').click();
  srv.estado.falhar = { rota: /\/status$/, status: 403, mensagem: 'Sem permissão para cancelar.' };
  await T(p, 'cancelar-sim').click();
  assert.match(await (await T(p, 'agendamento-erro').elementHandle()).evaluate((e) => e.textContent), /Sem permissão para cancelar/);
  srv.estado.falhar = { rota: /\/status$/, status: 'rede', vezes: 99 };
  await T(p, 'cancelar-sim').click();
  await p.waitForFunction(() => /conex|Não foi possível/i.test(document.querySelector('[data-testid="agendamento-erro"]')?.textContent || ''));
  assert.equal(banco.find((x) => x.id === id(102)).status, 'confirmado', 'a queda de rede não gravou nada');
  srv.estado.falhar = null;
  await T(p, 'cancelar-nao').click();
  ok('cancelar: 403 e queda de rede mostram mensagem; escrita sem chave não é reenviada');

  // 2. duplo clique em "Sim, cancelar" e em "Reativar": uma chamada só
  atraso = 250;
  const antes = srv.quantas('PUT', '/status');
  await abrirCartao(p, '12:00'); await T(p, 'acao-cancelar').click();
  await T(p, 'cancelar-sim').dblclick();
  await p.waitForFunction(() => /Agendamento cancelado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  assert.equal(srv.quantas('PUT', '/status') - antes, 1, 'duplo clique em cancelar = uma chamada');
  await T(p, 'cancelados-resumo').click();
  await cartaoDe(p, '15:00').locator('[data-testid="cartao-abrir"]').click();
  const antes2 = srv.quantas('PUT', '/status');
  await T(p, 'acao-reativar').dblclick();
  await p.waitForFunction(() => /reativado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  assert.equal(srv.quantas('PUT', '/status') - antes2, 1, 'duplo clique em reativar = uma chamada');
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="cartao"][data-status="a_confirmar"]')].some((e) => /15:00/.test(e.textContent)), null, { timeout: 4000 }); // voltou para a lista como "a confirmar"
  atraso = 0;
  ok('duplo clique em cancelar e em reativar envia uma vez só');

  // 2b. reativar recusado (409): mensagem e o cartão continua cancelado
  await T(p, 'cancelados-cartoes').waitFor();
  await cartaoDe(p, '12:00').locator('[data-testid="cartao-abrir"]').click();
  srv.estado.falhar = { rota: /\/status$/, status: 409, mensagem: 'Esse horário já está ocupado por um agendamento confirmado.' };
  await T(p, 'acao-reativar').click();
  await T(p, 'agendamento-erro').waitFor();
  assert.match(await texto(p, 'agendamento-erro'), /já está ocupado/);
  assert.equal(await cartaoDe(p, '12:00').getAttribute('data-status'), 'cancelado', 'continua cancelado');
  ok('reativar recusado (409): mensagem do servidor e o cartão continua cancelado');

  // 3. cancelar pela lista de próximos: aviso e cartão fora da lista
  await abrirCartao(p, '10:00').catch(() => {});
  await p.locator('[data-testid="cartao-proximo-abrir"]').first().click();
  await T(p, 'acao-cancelar').click(); await T(p, 'cancelar-sim').click();
  await p.waitForFunction(() => /Agendamento cancelado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao-proximo"]').length === 0);
  assert.match(await texto(p, 'proximos-vazio'), /Nenhum agendamento nos próximos 7 dias/);
  ok('cancelar pela lista de próximos: aviso e lista vazia com a frase certa');
  await ctx.close();
}

// 4. variações do cartão: sem serviço, só produto, serviço sem preço, sem cadastro, cadastro fora da lista
{
  semear();
  const { ctx, p } = await abrir(srv.url);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 9);
  const txt = (h) => cartaoDe(p, h).innerText();
  assert.match(await txt('16:00'), /Sem serviço/); assert.match(await txt('16:00'), /Sem cadastro/);
  assert.match(await txt('18:00'), /Venda de produtos/); assert.match(await txt('18:00'), /R\$\s*30,00/);
  assert.match(await txt('19:00'), /Passante/); assert.match(await txt('19:00'), /R\$\s*0,00/);
  assert.match(await txt('14:00'), /Cliente/, 'cadastro que a lista não traz mostra "Cliente", não vazio');
  await abrirCartao(p, '18:00');
  assert.match(await texto(p, 'detalhe-produto'), /2× Pomada/);
  ok('cartão: sem serviço, só produto, serviço sem preço, sem cadastro e cadastro fora da lista têm texto certo');
  await ctx.close();
}

// 5. remarcar: troca de profissional com o filtro de um profissional (o cartão sai da lista), cliente sem acesso a Clientes, telefone inválido, campo vazio, duplo clique
{
  semear();
  const { ctx, p } = await abrir(srv.url);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 9);
  await T(p, `sel-${ALAN}`).click();
  // a) só o profissional muda: o cartão sai da lista, o aviso continua, o corpo leva o profissional
  await remarcarPara(p, '11:00', '2026-10-28T11:00', { prof: KIKO });
  await p.waitForFunction(() => /remarcado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  assert.equal(srv.ultimo('PUT', '/remarcar').corpo.profissionalId, KIKO);
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="cartao"]')].some((e) => /11:00/.test(e.textContent))); // saiu da lista do Alan
  // b) profissional e horário mudam: o aviso de WhatsApp sobrevive à saída do cartão
  await remarcarPara(p, '17:00', '2026-10-28T17:30', { prof: KIKO });
  await T(p, 'avisar-whats-pergunta').waitFor();
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="cartao"]')].some((e) => /17:00/.test(e.textContent)));
  assert.equal(await T(p, 'avisar-whats-pergunta').count(), 1, 'o aviso sobrevive à troca de profissional');
  assert.match(await texto(p, 'avisar-whats-texto'), /17:30/, 'a mensagem traz o horário novo');
  await T(p, 'avisar-whats-nao').click();
  ok('remarcar trocando de profissional: cartão sai da lista, aviso de remarcado e de WhatsApp continuam');
  // c) telefone inválido: não oferece WhatsApp, diz que não há telefone
  await remarcarPara(p, '13:00', '2026-10-28T13:30');
  await T(p, 'avisar-sem-telefone').waitFor();
  assert.equal(await T(p, 'avisar-whats-pergunta').count(), 0);
  await T(p, 'avisar-sem-telefone-ok').click();
  // d) campo vazio: erro na tela e nada enviado
  const antes = srv.quantas('PUT', '/remarcar');
  await abrirCartao(p, '12:00'); await T(p, 'acao-remarcar').click();
  await T(p, 'remarcar-quando').fill(''); await T(p, 'remarcar-salvar').click();
  assert.match(await texto(p, 'agendamento-erro'), /Informe a nova data e hora/);
  assert.equal(srv.quantas('PUT', '/remarcar'), antes, 'nada enviado');
  // e) duplo clique em Remarcar: uma chamada
  atraso = 250;
  await T(p, 'remarcar-quando').fill('2026-10-28T12:30');
  await T(p, 'remarcar-salvar').dblclick();
  await p.waitForFunction(() => /remarcado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  assert.equal(srv.quantas('PUT', '/remarcar') - antes, 1, 'duplo clique em remarcar = uma chamada');
  atraso = 0;
  await T(p, 'avisar-sem-telefone-ok').click().catch(() => {});
  ok('remarcar: telefone inválido avisa, campo vazio não envia, duplo clique envia uma vez');
  await ctx.close();
}
// 5f. quem não lê Clientes (403) ou cadastro fora da lista: remarcar o horário precisa avisar que não deu para conferir o telefone (antes: silêncio)
for (const [rotulo, status, hora] of [['sem acesso a Clientes (403)', 403, '09:00'], ['lista de clientes com erro (500)', 500, '09:00']]) {
  semear(); clientesStatus = status;
  const { ctx, p } = await abrir(srv.url);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 9);
  await remarcarPara(p, hora, '2026-10-28T09:30');
  await p.waitForFunction(() => /remarcado/.test(document.querySelector('[data-testid="agenda-aviso"]')?.textContent || ''));
  await T(p, 'avisar-nao-conferido').waitFor({ timeout: 3000 });
  assert.match(await texto(p, 'avisar-nao-conferido'), /telefone/i);
  assert.equal(pedidosWa.length, 0, 'não abriu WhatsApp sem telefone');
  await T(p, 'avisar-nao-conferido-ok').click();
  await p.waitForFunction(() => !document.querySelector('[data-testid="avisar-nao-conferido"]'));
  await ctx.close();
  clientesStatus = 200;
  ok(`remarcar ${rotulo}: avisa que não deu para conferir o telefone`);
}
{
  semear();
  const { ctx, p } = await abrir(srv.url);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 9);
  await remarcarPara(p, '14:00', '2026-10-28T14:30'); // cadastro que a lista de clientes não traz
  await T(p, 'avisar-nao-conferido').waitFor({ timeout: 3000 });
  ok('remarcar cadastro fora da lista de clientes: avisa que não deu para conferir o telefone');
  await ctx.close();
}

// 6. lista vazia, erro ao carregar, navegar com cartão aberto
{
  semear();
  srv.estado.falhar = { rota: /^\/api\/agendamentos$/, metodo: 'GET', status: 500, mensagem: 'Falha ao listar a agenda.' };
  const { ctx, p } = await abrir(srv.url);
  await T(p, 'agenda-erro').waitFor();
  assert.match(await texto(p, 'agenda-erro'), /Falha ao listar a agenda/);
  await T(p, 'agenda-proximo').click(); // outro dia: consulta de novo, sem erro
  await p.waitForFunction(() => !document.querySelector('[data-testid="agenda-erro"]'));
  assert.match(await texto(p, 'agenda-titulo'), /quinta, 29 de outubro/i);
  ok('erro ao listar a agenda aparece com a mensagem e some ao navegar para um dia que carrega');
  // dia vazio
  await T(p, 'agenda-proximo').click(); await T(p, 'agenda-proximo').click();
  await T(p, 'agenda-vazio').waitFor();
  assert.match(await texto(p, 'agenda-vazio'), /Nenhum agendamento neste dia/);
  // cartão aberto + formulário de remarcar: ao mudar de dia fecha tudo e some o aviso do dia anterior
  await T(p, 'agenda-hoje').click();
  await abrirCartao(p, '09:00'); await T(p, 'acao-remarcar').click();
  await T(p, 'agenda-proximo').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="remarcar-form"]').length === 0);
  assert.equal(await T(p, 'agendamento-detalhe').count(), 0);
  await T(p, 'agenda-anterior').click();
  assert.equal(await T(p, 'agendamento-detalhe').count(), 0, 'voltar ao dia não reabre o cartão');
  ok('dia vazio com a frase certa; mudar de dia fecha cartão e formulário');
  await ctx.close();
}

// 7. muitos cartões (40 no mesmo dia, nome enorme) em 390 px com fonte larga e em 1280 px; calendário com a contagem
{
  semear();
  for (let i = 0; i < 40; i++) ag('2026-11-02T08:00:00', 15, i % 2 ? KIKO : ALAN, i % 3 ? LONGO : BRUNO, 'confirmado', 'Corte e barba com hidratação e acabamento premium');
  for (const vp of [{ width: 390, height: 780 }, { width: 1280, height: 860 }]) {
    const { ctx, p } = await abrir(srv.url, { viewport: vp, fonteLarga: true });
    await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length >= 9);
    await T(p, 'aba-calendario').click();
    await p.waitForFunction(() => document.querySelector('[data-testid="mes-cont-2026-11-02"]'));
    assert.equal(await texto(p, 'mes-cont-2026-11-02'), '40');
    await semRolagem(p, `calendário ${vp.width}`);
    await T(p, 'mes-dia-2026-11-02').click();
    await p.waitForFunction(() => document.querySelectorAll('[data-testid="cartao"]').length === 40);
    await semRolagem(p, `40 cartões ${vp.width}`);
    const estouro = await p.evaluate(() => [...document.querySelectorAll('[data-testid="cartao"]')].filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    assert.equal(estouro, 0, `${vp.width}: nenhum cartão com texto para fora`);
    await abrirCartao(p, '08:00'); await T(p, 'acao-remarcar').click();
    await semRolagem(p, `remarcar aberto ${vp.width}`);
    await ctx.close();
    ok(`40 cartões com nome enorme em ${vp.width} px: sem rolagem lateral nem texto para fora`);
  }
}

await b.close(); srv.fechar();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e76 ok');
