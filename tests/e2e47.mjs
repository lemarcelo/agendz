/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F2 parte 5c: botão Atender no site real (dist/index-real.html) contra um servidor falso: atendimento local (agora), agendamento futuro, dia anterior
// com motivo, profissional só lança hoje e como ele mesmo, busca de cliente cadastrado, erro do servidor na tela e 390 px com fonte larga.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), KIKO = id(2), BRUNO = id(11), SRV_CORTE = id(50), SRV_BARBA = id(51), NOVO = id(900);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const INICIO_DO_DIA = new Date('2026-10-28T00:00:00-03:00').getTime();
const banco = [];
const chamadas = [];
let papel = 'dono';
let tipoLoja = 'barbearia';
let seq = 0;
let derrubar = 0; // quantas respostas de POST /api/atendimentos o servidor falso "perde" (grava e derruba a conexão)
const porChave = new Map(); // Idempotency-Key → agendamento já gravado
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: c });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: tipoLoja, logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: papel === 'profissional' ? KIKO : ALAN, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/clientes') {
      const q = (u.searchParams.get('q') || '').toLowerCase();
      const todos = [{ id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '5511999990001' }];
      return json(200, todos.filter((x) => !q || x.nome.toLowerCase().includes(q)));
    }
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }, { id: KIKO, nome: 'Kiko', papel: 'profissional', atende: true }]);
    if (u.pathname === '/api/servicos') return json(200, [
      { id: SRV_CORTE, codigo: '1', nome: 'Corte', categoria: '', preco: 45, duracaoMin: 45, intervaloMin: 0, ativo: true },
      { id: SRV_BARBA, codigo: '2', nome: 'Barba', categoria: '', preco: 30, duracaoMin: 30, intervaloMin: 0, ativo: true },
      { id: id(52), codigo: '3', nome: 'Pigmentação antiga', categoria: '', preco: 99, duracaoMin: 60, intervaloMin: 0, ativo: false },
    ]);
    if (u.pathname === '/api/atendimentos' && req.method === 'POST') {
      if (c.inicio === '2026-11-03T13:00:00.000Z' && papel === 'dono' && !c.nome) return json(400, { mensagem: 'Preencha os campos obrigatórios: nome, telefone.' });
      const quando = c.inicio ? Date.parse(c.inicio) : AGORA.getTime();
      const futuro = quando > AGORA.getTime() + 60000;
      if (!futuro && quando < INICIO_DO_DIA && !(c.motivoRetroativo && c.motivoRetroativo.length >= 5)) return json(400, { mensagem: 'Informe o motivo do lançamento de um dia anterior (por que não foi registrado na hora).' });
      const a = { id: id(300 + (seq += 1)), clienteId: c.clienteId || NOVO, profissionalId: papel === 'profissional' ? KIKO : (c.profissionalId || ALAN), inicio: new Date(quando).toISOString(), fim: new Date(quando + 45 * 60000).toISOString(), fimOcupado: new Date(quando + 45 * 60000).toISOString(), status: futuro ? (c.status || 'a_confirmar') : 'concluido', encaixe: !!c.encaixe, total: 45, servicos: [{ servicoId: SRV_CORTE, nome: 'Corte', preco: 45, duracaoMin: 45 }], conflitosPendentes: [], origem: futuro ? 'painel' : 'atendimento', reagendado: false, statusManual: false, motivoRetroativo: c.motivoRetroativo || null, historico: [] };
      const chave = req.headers['idempotency-key'];
      if (chave && porChave.has(chave)) return json(201, porChave.get(chave)); // repetição: devolve o que já gravou
      banco.push(a);
      if (chave) porChave.set(chave, a);
      if (derrubar > 0) { derrubar -= 1; return req.socket.destroy(); } // gravou, mas a resposta se perde
      return json(201, a);
    }
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) >= de));
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
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  return { ctx, p };
}
const ultimo = () => chamadas.filter((c) => c.m === 'POST' && c.u === '/api/atendimentos').at(-1);
const textoDe = (p, t) => p.getByTestId(t).innerText();

// 1. atendimento local (agora): só serviço e telefone; vai sem data; concluído aparece na agenda de hoje; serviço inativo não aparece
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-form').waitFor();
  // ordem (pedido do Marcelo): Cliente → Serviços → Quando (Agora / Escolher data) → Produtos…; botões de Quando com alvo de toque maior
  const y = async (rotulo) => (await p.locator('.atender-real legend', { hasText: rotulo }).first().boundingBox()).y;
  const [yc, ys, yq] = [await y('Cliente'), await y('Serviços'), await y('Quando')];
  assert.ok(yc < ys && ys < yq, `ordem dos blocos: Cliente ${yc}, Serviços ${ys}, Quando ${yq}`);
  if (await p.getByTestId('atender-produtos-bloco').count()) assert.ok(yq < await y('Produtos'), 'Produtos vem depois de Quando');
  for (const id of ['atender-agora', 'atender-quando']) assert.ok((await p.getByTestId(id).boundingBox()).height >= 44, `${id}: altura de toque`);
  assert.match(await textoDe(p, 'atender-tipo'), /Atendimento já feito/);
  assert.equal(await p.getByTestId(`atender-srv-${id(52)}`).count(), 0, 'serviço desativado não é oferecido');
  assert.match(await textoDe(p, 'atender-total'), /Escolha ao menos um serviço/);
  { // nome do serviço e "duração · preço" em duas linhas dentro do mesmo item (antes viravam peças soltas do flex, com distância errada)
    const item = p.getByTestId(`atender-srv-${SRV_CORTE}`).locator('xpath=ancestor::label').locator('.atender-real-item');
    assert.equal(await item.count(), 1);
    assert.equal((await item.locator('b').innerText()).trim(), 'Corte'); assert.match(await item.locator('small').innerText(), /^45 min · R\$\s?45,00$/);
    const [bn, sm] = [await item.locator('b').boundingBox(), await item.locator('small').boundingBox()];
    assert.ok(sm.y > bn.y + bn.height - 2 && sm.y - (bn.y + bn.height) < 8, 'o valor fica logo abaixo do nome');
  }
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  assert.match(await textoDe(p, 'atender-total'), /1 serviço · 45 min · R\$\s?45,00/);
  await p.getByTestId('atender-telefone').fill('(11) 98888-7777');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.match(await textoDe(p, 'agenda-aviso'), /Atendimento registrado/);
  assert.equal(await p.getByTestId('atender-form').count(), 0, 'o painel fecha ao salvar');
  const c = ultimo().corpo;
  assert.deepEqual(c.servicoIds, [SRV_CORTE]); assert.equal(c.telefone, '(11) 98888-7777'); assert.equal(c.profissionalId, ALAN);
  assert.ok(!('inicio' in c), 'sem data: o servidor decide "agora"'); assert.ok(!('status' in c));
  await p.waitForFunction(() => document.querySelector('[data-testid="cartao"][data-status="concluido"]'));
  ok('atendimento local: vai sem data, fecha o painel e o cartão concluído aparece');
  await ctx.close();
}

// 2. agendamento futuro: pede nome e telefone (mensagem do servidor na tela), depois salva a confirmar com data ISO
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-11-03T10:00');
  assert.match(await textoDe(p, 'atender-tipo'), /Agendamento/);
  assert.match(await textoDe(p, 'atender-faltam'), /nome, telefone/);
  assert.equal(await p.getByTestId('atender-status-a_confirmar').isChecked(), true);
  await p.getByTestId(`atender-srv-${SRV_BARBA}`).check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('atender-erro').waitFor();
  assert.match(await textoDe(p, 'atender-erro'), /Preencha os campos obrigatórios: nome, telefone/);
  assert.equal(await p.getByTestId('atender-form').count(), 1, 'erro não fecha o painel');
  await p.getByTestId('atender-nome').fill('Ana Lima'); await p.getByTestId('atender-telefone').fill('11977776666');
  await p.getByTestId('atender-status-confirmado').check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.match(await textoDe(p, 'agenda-aviso'), /Agendamento criado/);
  const c = ultimo().corpo;
  assert.equal(c.inicio, '2026-11-03T13:00:00.000Z'); assert.equal(c.status, 'confirmado'); assert.equal(c.nome, 'Ana Lima'); assert.equal(c.encaixe, false);
  assert.match(await textoDe(p, 'agenda-titulo'), /3 de novembro/i, 'a agenda vai para o dia do novo agendamento');
  ok('agendamento futuro: erro do servidor na tela, depois salva confirmado e a agenda salta para o dia');
  await ctx.close();
}

// 3. dia anterior: pede o motivo e manda no corpo; sem motivo o servidor recusa e a tela mostra a mensagem
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-10-26T15:00');
  await p.getByTestId('atender-motivo-retro').waitFor();
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('atender-erro').waitFor();
  assert.match(await textoDe(p, 'atender-erro'), /Informe o motivo do lançamento de um dia anterior/);
  await p.getByTestId('atender-motivo-retro').fill('Esqueci de lançar na hora');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(ultimo().corpo.motivoRetroativo, 'Esqueci de lançar na hora');
  ok('dia anterior: motivo no corpo e mensagem do servidor quando falta');
  await ctx.close();
}

// 4. busca de cliente cadastrado: escolhe, preenche nome e telefone e manda o clienteId
{
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-busca').fill('bru');
  await p.getByTestId(`atender-cli-${BRUNO}`).click();
  assert.match(await textoDe(p, 'atender-vinculo'), /Bruno/);
  assert.equal(await p.getByTestId('atender-nome').inputValue(), 'Bruno');
  assert.equal(await p.getByTestId('atender-telefone').inputValue(), '(11) 99999-0001');
  await p.getByTestId(`atender-srv-${SRV_CORTE}`).check();
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor();
  assert.equal(ultimo().corpo.clienteId, BRUNO);
  ok('cliente cadastrado: escolhido na busca e enviado pelo id');
  await ctx.close();
}

// 5. profissional: atende como ele mesmo (seletor travado) e não lança dia anterior
{
  papel = 'profissional';
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  assert.equal(await p.getByTestId('atender-profissional').isDisabled(), true);
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-10-26T15:00');
  await p.getByTestId('atender-retro-bloqueado').waitFor();
  assert.equal(await p.getByTestId('salvar-atender').isDisabled(), true);
  assert.equal(await p.getByTestId('atender-motivo-retro').count(), 0);
  ok('profissional: seletor travado e dia anterior bloqueado');
  await ctx.close();
  papel = 'dono';
}

// 6. celular (390 px) com fonte larga: sem rolagem lateral com o painel aberto (agora e data)
{
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  const semRolagem = async (n) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${n}: rolagem horizontal`);
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-busca').fill('bru');
  await p.getByTestId(`atender-cli-${BRUNO}`).waitFor();
  await semRolagem('atender com resultados');
  await p.getByTestId(`atender-cli-${BRUNO}`).click();
  await p.getByTestId('atender-quando').click();
  await p.getByTestId('atender-data').fill('2026-11-03T10:00');
  await semRolagem('atender futuro');
  ok('390 px com fonte larga: sem rolagem lateral');
  await ctx.close();
}

// 8. resposta perdida com o aparelho online: o site reenvia sozinho com a MESMA chave e o servidor não grava duas vezes
{
  const { ctx, p } = await abrir();
  const antes = banco.length;
  derrubar = 1;
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId(`atender-srv-${SRV_BARBA}`).check();
  await p.getByTestId('atender-telefone').fill('(11) 95555-4444');
  await p.getByTestId('salvar-atender').click();
  await p.getByTestId('agenda-aviso').waitFor({ timeout: 15000 });
  assert.match(await textoDe(p, 'agenda-aviso'), /Atendimento registrado/);
  const envios = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/atendimentos').slice(-2);
  assert.equal(envios.length, 2, 'duas tentativas: a primeira perdeu a resposta');
  assert.equal(banco.length, antes + 1, 'gravou uma vez só');
  ok('resposta perdida: reenvio automático com a mesma chave, sem duplicar');
  await ctx.close();
}

// 7. loja com veículo e porte (estética): o botão Atender aparece e o formulário ganha o bloco do veículo (o fluxo completo está em e2e57)
{
  tipoLoja = 'estetica_automotiva';
  const { ctx, p } = await abrir();
  await p.getByTestId('atender-abrir').click();
  await p.getByTestId('atender-veiculo-bloco').waitFor();
  ok('estética: o botão Atender existe e o formulário pede o veículo');
  await ctx.close();
  tipoLoja = 'barbearia';
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e47 ok');
