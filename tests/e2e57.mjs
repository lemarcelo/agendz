/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estética no site real (dist/index-real.html) contra um servidor falso: Atender com veículo do cadastro (preço do porte) e com veículo novo, box escolhido,
// veículo exigido só com serviço, cartão e ficha com veículo/box, Remarcar com box, tela Boxes do proprietário (salvar, erro do servidor) e 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAVI = id(1), CLI = id(20), V_ONIX = id(30), V_HILUX = id(31), SRV = id(50), BX1 = id(60), BX2 = id(61), NOVO = id(900);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const chamadas = [];
const banco = [];
let boxes = [{ id: BX1, nome: 'Box 1', ativo: true }, { id: BX2, nome: 'Box 2', ativo: true }];
let recusarBoxes = '';
let seq = 0;
const ultimo = (m, u) => chamadas.filter((c) => c.m === m && c.u === u).at(-1);
const CLIENTE = { id: CLI, nome: 'Carlos Lima', apelido: 'Carlos', telefone: '5511977776666', cpfMascarado: '', veiculos: [{ id: V_ONIX, placa: 'ABC1D23', marca: 'Chevrolet', modelo: 'Onix', cor: 'Prata', porte: 'medio' }, { id: V_HILUX, placa: 'DEF4567', marca: 'Toyota', modelo: 'Hilux', cor: 'Preta', porte: 'pickup' }], dadosCompletos: false };
const SERVICO = { id: SRV, codigo: '1', nome: 'Lavagem completa', categoria: '', preco: 80, duracaoMin: 60, intervaloMin: 0, antecedenciaH: 0, ativo: true, precos: { pequeno: 60, medio: 80, grande: 100, suv: 120, pickup: 150 }, duracoes: { pequeno: 45, medio: 60, grande: 75, suv: 90, pickup: 120 } };

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, corpo: c });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: DAVI, nome: 'Davi', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/clientes') return json(200, [CLIENTE]);
    if (u.pathname === '/api/profissionais') return json(200, [{ id: DAVI, nome: 'Davi', papel: 'dono', atende: true, podeVender: true }]);
    if (u.pathname === '/api/servicos') return json(200, [SERVICO]);
    if (u.pathname === '/api/produtos') return json(200, []);
    if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [] });
    if (u.pathname === '/api/boxes') return json(200, boxes);
    if (u.pathname === '/api/estabelecimento/boxes' && req.method === 'PUT') {
      if (recusarBoxes) return json(409, { mensagem: recusarBoxes });
      boxes = c.boxes.map((b, i) => ({ id: b.id || id(70 + i), nome: b.nome, ativo: b.ativo }));
      return json(200, boxes);
    }
    if (u.pathname === '/api/atendimentos' && req.method === 'POST') {
      const futuro = c.inicio && Date.parse(c.inicio) > AGORA.getTime() + 60000;
      if (c.servicoIds.length && !c.veiculoId && !c.veiculo) return json(400, { mensagem: 'Escolha o veículo do atendimento.' });
      const v = c.veiculoId ? CLIENTE.veiculos.find((x) => x.id === c.veiculoId) : c.veiculo;
      const porte = (v && v.porte) || 'medio';
      const box = futuro ? boxes.find((b) => b.id === c.boxId) || boxes[0] : null;
      const quando = c.inicio ? Date.parse(c.inicio) : AGORA.getTime();
      const a = { id: id(300 + (seq += 1)), clienteId: CLI, profissionalId: DAVI, inicio: new Date(quando).toISOString(), fim: new Date(quando + SERVICO.duracoes[porte] * 60000).toISOString(), fimOcupado: new Date(quando + SERVICO.duracoes[porte] * 60000).toISOString(), status: futuro ? 'a_confirmar' : 'concluido', encaixe: false, total: SERVICO.precos[porte], servicos: [{ servicoId: SRV, nome: SERVICO.nome, preco: SERVICO.precos[porte], duracaoMin: SERVICO.duracoes[porte] }], conflitosPendentes: [], origem: futuro ? 'painel' : 'atendimento', reagendado: false, statusManual: false, historico: [], produtos: [], totalProdutos: 0,
        estetica: { boxId: box ? box.id : null, box: box ? box.nome : '', veiculoId: v.id || NOVO, porte, placa: v.placa, marca: v.marca || '', modelo: v.modelo, cor: v.cor || '' } };
      banco.push(a);
      return json(201, a);
    }
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) >= de));
    }
    const rem = /^\/api\/agendamentos\/([^/]+)\/remarcar$/.exec(u.pathname);
    if (rem && req.method === 'PUT') {
      const a = banco.find((x) => x.id === rem[1]);
      a.inicio = c.inicio;
      if (c.boxId) { const bx = boxes.find((x) => x.id === c.boxId); a.estetica = { ...a.estetica, boxId: bx.id, box: bx.nome }; }
      return json(200, a);
    }
    const m = /^\/api\/agendamentos\/([^/]+)$/.exec(u.pathname);
    if (m) { const a = banco.find((x) => x.id === m[1]); return a ? json(200, a) : json(404, { mensagem: 'Agendamento não encontrado.' }); }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 860 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(AGORA);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('davi'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  return { ctx, p };
}
const texto = (p, t) => p.getByTestId(t).innerText();

// 1. veículo do cadastro: o preço e o tempo seguem o porte; o corpo leva veiculoId (nunca a placa solta); atendimento de agora não leva box
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-veiculo-bloco').waitFor();
  await p.getByTestId('atender-nome').fill('Carlos');
  await p.getByTestId('atender-busca').fill('Carlos');
  await p.getByTestId(`atender-cli-${CLI}`).click();
  await p.getByTestId(`atender-veiculo-${V_HILUX}`).check();
  await p.getByTestId(`atender-srv-${SRV}`).check();
  assert.match(await texto(p, 'atender-total'), /120 min.*150,00/, 'pickup: 120 min e R$ 150');
  await p.getByTestId(`atender-veiculo-${V_ONIX}`).check();
  assert.match(await texto(p, 'atender-total'), /60 min.*80,00/, 'médio: 60 min e R$ 80');
  assert.equal(await p.getByTestId('atender-box').count(), 0, 'atendimento de agora não escolhe box');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('cartao').first().waitFor();
  const corpo = ultimo('POST', '/api/atendimentos').corpo;
  assert.equal(corpo.veiculoId, V_ONIX); assert.equal(corpo.veiculo, undefined); assert.equal(corpo.boxId, undefined);
  assert.match(await texto(p, 'cartao-veiculo'), /Chevrolet Onix · ABC1D23/);
  ok('veículo do cadastro: preço e tempo do porte, corpo com veiculoId, cartão mostra o carro');
  await ctx.close();
}

// 2. veículo novo: placa, modelo e porte obrigatórios (a tela barra antes de enviar); serviço exige veículo, mas só produto/sem serviço não
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId(`atender-srv-${SRV}`).check();
  const antes = chamadas.filter((c) => c.u === '/api/atendimentos').length;
  await p.getByTestId('salvar-atender').click();
  assert.match(await texto(p, 'atender-erro'), /Informe a placa/);
  await p.getByTestId('atender-v-placa').fill('abc');
  await p.getByTestId('salvar-atender').click();
  assert.match(await texto(p, 'atender-erro'), /Placa inválida/);
  await p.getByTestId('atender-v-placa').fill('XYZ-9A87');
  assert.equal(await p.getByTestId('atender-v-placa').inputValue(), 'XYZ-9A87');
  await p.getByTestId('atender-v-placa').fill('XYZ9A87');
  await p.getByTestId('salvar-atender').click();
  assert.match(await texto(p, 'atender-erro'), /Informe o modelo/);
  await p.getByTestId('atender-v-modelo').fill('Compass');
  await p.getByTestId('salvar-atender').click();
  assert.match(await texto(p, 'atender-erro'), /Escolha o porte/);
  await p.getByTestId('atender-v-porte').selectOption('suv');
  assert.match(await texto(p, 'atender-total'), /90 min.*120,00/, 'SUV: 90 min e R$ 120');
  assert.equal(chamadas.filter((c) => c.u === '/api/atendimentos').length, antes, 'nada foi enviado enquanto faltava dado');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('cartao').first().waitFor();
  const corpo = ultimo('POST', '/api/atendimentos').corpo;
  assert.deepEqual(corpo.veiculo, { placa: 'XYZ9A87', marca: '', modelo: 'Compass', cor: '', porte: 'suv' });
  ok('veículo novo: validação na tela e corpo com os dados digitados');
  await ctx.close();
}

// 3. agendamento futuro com box escolhido: o corpo leva boxId; o cartão e a ficha mostram o box; Remarcar troca o box
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-10-30T10:00');
  await p.getByTestId('atender-nome').fill('Carlos'); await p.getByTestId('atender-telefone').fill('11977776666');
  await p.getByTestId('atender-busca').fill('Carlos');
  await p.getByTestId(`atender-cli-${CLI}`).click();
  await p.getByTestId(`atender-veiculo-${V_ONIX}`).check();
  await p.getByTestId(`atender-srv-${SRV}`).check();
  await p.getByTestId('atender-box').selectOption(BX2);
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(ultimo('POST', '/api/atendimentos').corpo.boxId, BX2);
  const cartao = p.locator('[data-testid="cartao"]').first();
  await cartao.waitFor();
  assert.match(await cartao.innerText(), /Box 2/);
  await cartao.getByTestId('cartao-abrir').click();
  assert.match(await texto(p, 'detalhe-veiculo'), /ABC1D23.*porte Médio.*Box 2/);
  await p.getByTestId('acao-remarcar').click();
  assert.match(await p.getByTestId('remarcar-box').innerText(), /Manter Box 2/);
  await p.getByTestId('remarcar-box').selectOption(BX1);
  await p.getByTestId('remarcar-salvar').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(ultimo('PUT', `/api/agendamentos/${banco.at(-1).id}/remarcar`).corpo.boxId, BX1);
  await p.locator('[data-testid="cartao"]').filter({ hasText: 'Box 1' }).first().waitFor(); // a lista recarrega depois do aviso
  ok('futuro com box: corpo com boxId, cartão e ficha mostram veículo e box, Remarcar troca o box');
  await ctx.close();
}

// 4. tela Boxes (proprietário): lista, novo, renomear, salvar; erro do servidor aparece; nome repetido barrado na tela
{
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-boxes').click();
  await p.getByTestId('boxes-lista').waitFor();
  assert.equal(await p.locator('[data-testid^="box-linha-"]').count(), 2);
  await p.getByTestId('box-novo').click();
  assert.equal(await p.getByTestId('box-nome-2').inputValue(), 'Box 3');
  await p.getByTestId('box-nome-2').fill('box 1');
  await p.getByTestId('boxes-salvar').click();
  assert.match(await texto(p, 'boxes-erro'), /mesmo nome/);
  await p.getByTestId('box-nome-2').fill('Box 3');
  await p.getByTestId('box-ativo-0').uncheck();
  recusarBoxes = 'Box 1 tem carro agendado. Remarque antes de desativar.';
  await p.getByTestId('boxes-salvar').click();
  assert.match(await texto(p, 'boxes-erro'), /tem carro agendado/);
  recusarBoxes = '';
  await p.getByTestId('boxes-salvar').click();
  await p.getByTestId('boxes-ok').waitFor();
  const corpo = ultimo('PUT', '/api/estabelecimento/boxes').corpo;
  assert.deepEqual(corpo.boxes.map((x) => [x.nome, x.ativo, !!x.id]), [['Box 1', false, true], ['Box 2', true, true], ['Box 3', true, false]]);
  await p.getByTestId('box-remover-2').click();
  assert.equal(await p.locator('[data-testid^="box-linha-"]').count(), 2);
  ok('Boxes: novo, nome repetido barrado, erro do servidor mostrado, salvar leva id só dos existentes');
  await ctx.close();
}

// 5. 390 px com fonte larga: Atender com veículo novo e a tela Boxes sem rolagem lateral
{
  boxes = [{ id: BX1, nome: 'Box 1', ativo: true }, { id: BX2, nome: 'Box 2', ativo: true }];
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-veiculo-novo').waitFor();
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-10-30T10:00');
  await p.getByTestId(`atender-srv-${SRV}`).check();
  const largura = () => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  let l = await largura();
  assert.ok(l.doc <= l.janela, `Atender: rolagem lateral ${l.doc} > ${l.janela}`);
  await p.getByTestId('atender-cancelar').click();
  await p.getByTestId('nav-boxes').click();
  await p.getByTestId('boxes-lista').waitFor();
  l = await largura();
  assert.ok(l.doc <= l.janela, `Boxes: rolagem lateral ${l.doc} > ${l.janela}`);
  ok('390 px com fonte larga: Atender (estética) e Boxes sem rolagem lateral');
  await ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e57 ok');
