/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Página do cliente: os horários pedidos ficam guardados no navegador (sem consultar a agenda), aparecem à direita em "Seus horários" (data em negrito e hora grande),
// o nome e o telefone vêm preenchidos na volta, tudo some quando o horário passa, e "Esquecer meus dados" apaga na hora. 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), BETO = id(2), SRV_CORTE = id(50), SRV_BARBA = id(51);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const GENERICO = 'Cupom inválido ou indisponível.';
const OCUPADO = 'Esse horário acabou de ser ocupado. Escolha outro.';
const CUPOM_BOM = 'ABCD-EFGH-JKLM';
const chamadas = [];
let ativo = true;
let falhaOcupado = true;
let link = { ativo: true, diasMax: 30, disponivel: true };
let seq = 0;
const ocupados = new Set();
const feitos = []; // { token, resumo }
const servicos = [{ id: SRV_CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }, { id: SRV_BARBA, nome: 'Barba', duracao: 30, preco: 30, antecedenciaH: 2 }];
const profissionais = [{ id: ALAN, nome: 'Alan', foto: null }, { id: BETO, nome: 'Beto', foto: null }];
const DIAS = ['2026-10-30', '2026-10-31', '2026-11-02'];
const HORAS = ['12:00:00Z', '12:30:00Z', '13:00:00Z']; // 09:00, 09:30 e 10:00 em Brasília

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: c, auth: req.headers.authorization || '', acesso: req.headers['x-acesso'] || '' });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: ['nome', 'telefone'], local: [] });
    if (u.pathname === '/api/estabelecimento/link-agendamento') {
      if (req.method === 'PUT') { link = { ...link, ...c }; return json(200, link); }
      return json(200, link);
    }
    // ---- rotas do cliente (sem login)
    if (u.pathname === '/api/publico/agendar') return json(200, ativo ? { ativo: true, aviso: null, diasMax: 30, servicos, profissionais } : { ativo: false, aviso: 'O agendamento pelo link não está disponível agora. Fale com a loja.', diasMax: 30, servicos: [], profissionais: [] });
    if (u.pathname === '/api/publico/dias') return json(200, DIAS.filter((d) => d >= u.searchParams.get('de')));
    if (u.pathname === '/api/publico/horarios') {
      const d = u.searchParams.get('data');
      return json(200, HORAS.map((h) => `${d}T${h}`).filter((i) => !ocupados.has(i)).map((i) => ({ inicio: i, profissionalId: ALAN })));
    }
    if (u.pathname === '/api/publico/agendamentos' && req.method === 'POST') {
      if (c.inicio && falhaOcupado) { falhaOcupado = false; ocupados.add(c.inicio.replace('.000Z', 'Z')); return json(409, { mensagem: OCUPADO }); }
      if (c.cupomChave && c.cupomChave.toUpperCase() !== CUPOM_BOM) return json(400, { mensagem: GENERICO });
      seq += 1;
      const quando = Date.parse(c.inicio);
      const nomes = servicos.filter((s) => c.servicoIds.includes(s.id));
      const total = nomes.reduce((t, s) => t + s.preco, 0);
      const resumo = { id: id(400 + seq), inicio: new Date(quando).toISOString(), fim: new Date(quando + 1800000).toISOString(), status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: nomes.map((s) => s.nome), duracao: nomes.length * 30, total,
        desconto: c.cupomChave ? 4 : 0, cupom: c.cupomChave ? 'Boas-vindas' : null, profissional: 'Alan', ativo: true, podeCancelar: true };
      const token = seq.toString(16).padStart(2, '0').repeat(24);
      feitos.push({ token, resumo });
      ocupados.add(new Date(quando).toISOString().replace('.000Z', 'Z'));
      return json(201, { agendamento: resumo, token });
    }
    if (u.pathname === '/api/publico/meus' && req.method === 'POST') return json(200, feitos.filter((f) => c.tokens.includes(f.token)).map((f) => f.resumo));
    const cc = u.pathname.match(/^\/api\/publico\/agendamentos\/([^/]+)\/cancelar$/);
    if (cc && req.method === 'POST') {
      const f = feitos.find((x) => x.resumo.id === cc[1] && x.token === req.headers['x-acesso']);
      if (!f) return json(404, { mensagem: 'Agendamento não encontrado.' });
      if (!f.resumo.podeCancelar) return json(409, { mensagem: 'Esse horário não pode mais ser cancelado por aqui (faltam menos de 24 horas). Fale com a loja.' });
      Object.assign(f.resumo, { status: 'cancelado', rotulo: 'Cancelado', ativo: false, podeCancelar: false });
      return json(200, f.resumo);
    }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 860 }, hash = '#agendar', ctxExistente = null, agora = AGORA, estado = undefined) {
  const touch = viewport.width < 700;
  const ctx = ctxExistente || await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', storageState: estado });
  if (!ctxExistente) await ctx.clock.setFixedTime(agora);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url + hash);
  return { ctx, p };
}
const deHoje = (m, u) => chamadas.filter((c) => c.m === m && c.u === u);

const textoDe = (p, t) => p.getByTestId(t).innerText();
const semRolagem = async (p, onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };
let estado;
{
  // 1. primeira visita: sem painel; pede um horário
  const { ctx, p } = await abrir();
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).waitFor();
  assert.equal(await p.getByTestId('pub-reservas').count(), 0, 'na primeira visita não há "Seus horários"');
  assert.equal(await p.getByTestId('pub-nome').count(), 0);
  falhaOcupado = false;
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).check(); await p.getByTestId('pub-continuar-1').click();
  await p.getByTestId('pub-dia-2026-10-30').waitFor(); await p.getByTestId('pub-hora-0900').click(); await p.getByTestId('pub-continuar-2').click();
  await p.getByTestId('pub-nome').fill('Maria Souza'); await p.getByTestId('pub-tel').fill('53999000001');
  await p.getByTestId('pub-enviar').click(); await p.getByTestId('pub-feito').waitFor();
  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('agendz-reservas-dalforno')));
  assert.equal(guardado.itens.length, 1); assert.equal(guardado.cliente.nome, 'Maria Souza'); assert.equal(guardado.cliente.telefone, '(53) 99900-0001');
  assert.ok(!JSON.stringify(guardado).match(/[0-9a-f]{48}/), 'o token de acesso não vai para a chave dos horários');
  ok('pediu um horário: guardado no navegador com nome e telefone');
  estado = await ctx.storageState();
  await ctx.close();
}
{
  // 2. volta ao link: "Seus horários" à direita, data em negrito e hora grande, formulário preenchido, sem chamar a agenda
  const antes = chamadas.length;
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, '#agendar', null, AGORA, estado);
  await p.getByTestId('pub-reservas').waitFor();
  const r = await p.getByTestId('pub-reservas').boundingBox();
  const li = p.locator('[data-testid^="pub-reserva-"]').first();
  assert.equal((await li.locator('.pub-reserva-data').innerText()).trim(), 'sex 30/10');
  assert.equal((await li.locator('.pub-reserva-hora').innerText()).trim(), '09:00');
  const est = await li.evaluate((el) => ({ peso: Number(getComputedStyle(el.querySelector('.pub-reserva-data')).fontWeight), hora: parseFloat(getComputedStyle(el.querySelector('.pub-reserva-hora')).fontSize) }));
  assert.ok(est.peso >= 700 && est.hora >= 20, JSON.stringify(est));
  const cartao = await p.locator('.pub-principal .pub-cartao').first().boundingBox();
  assert.ok(r.x > cartao.x + cartao.width - 4, `o painel fica à direita do formulário (${r.x} > ${cartao.x + cartao.width})`);
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).check(); await p.getByTestId('pub-continuar-1').click();
  await p.getByTestId('pub-dia-2026-10-31').click(); await p.getByTestId('pub-hora-0900').click(); await p.getByTestId('pub-continuar-2').click();
  assert.equal(await p.getByTestId('pub-nome').inputValue(), 'Maria Souza'); assert.equal(await p.getByTestId('pub-tel').inputValue(), '(53) 99900-0001');
  assert.equal(chamadas.slice(antes).filter((c) => c.u === '/api/publico/meus').length, 0, 'mostrar o painel não consulta a agenda');
  ok('volta ao link: horários à direita (data em negrito, hora grande) e formulário preenchido, sem consultar a agenda');
  // cancelar em "Meus agendamentos" tira do painel
  await ctx.close();
}
{
  // 3. depois do horário: tudo some do navegador
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, '#agendar', null, new Date('2026-10-30T10:00:00-03:00'), estado);
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).waitFor();
  assert.equal(await p.getByTestId('pub-reservas').count(), 0, 'o horário passou: o painel some');
  assert.equal(await p.evaluate(() => localStorage.getItem('agendz-reservas-dalforno')), null, 'e o nome e o telefone saem do navegador junto');
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).check(); await p.getByTestId('pub-continuar-1').click();
  await p.getByTestId('pub-dia-2026-10-30').waitFor(); await p.getByTestId('pub-hora-0930').click(); await p.getByTestId('pub-continuar-2').click();
  assert.equal(await p.getByTestId('pub-nome').inputValue(), '', 'formulário vazio');
  await ctx.close();
  ok('passou o horário: o painel, o nome e o telefone somem do navegador');
}
{
  // 4. celular: painel acima do formulário, sem rolagem lateral; cancelar tira o horário; esquecer apaga tudo
  const { ctx, p } = await abrir({ width: 390, height: 800 }, '#agendar', null, AGORA, estado);
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  await p.getByTestId('pub-reservas').waitFor();
  const r = await p.getByTestId('pub-reservas').boundingBox(), c = await p.locator('.pub-principal .pub-cartao').first().boundingBox();
  assert.ok(r.y + r.height <= c.y + 2, 'no celular o painel fica acima do formulário');
  await semRolagem(p, 'página do cliente 390');
  await p.getByTestId('pub-reservas-ver').click();
  await p.getByTestId('pub-meus').waitFor();
  const idAg = (await p.locator('[data-testid^="pub-ag-"]').first().getAttribute('data-testid')).replace('pub-ag-', '');
  await p.getByTestId(`pub-cancelar-${idAg}`).click(); await p.getByTestId(`pub-cancelar-sim-${idAg}`).click();
  await p.getByTestId('pub-aviso').waitFor();
  await p.getByTestId('pub-aba-agendar').click();
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).waitFor();
  assert.equal(await p.getByTestId('pub-reservas').count(), 0, 'cancelado: sai do painel');
  assert.equal(await p.evaluate(() => localStorage.getItem('agendz-reservas-dalforno')), null);
  ok('celular: painel acima do formulário; cancelar tira o horário e limpa os dados');
  await ctx.close();
}
{
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, '#agendar', null, AGORA, estado);
  // o cancelamento acima foi feito em outro contexto: este ainda tem o horário guardado
  await p.getByTestId('pub-reservas').waitFor();
  await p.getByTestId('pub-reservas-esquecer').click();
  assert.equal(await p.getByTestId('pub-reservas').count(), 0);
  assert.equal(await p.evaluate(() => localStorage.getItem('agendz-reservas-dalforno')), null);
  await ctx.close();
  ok('Esquecer meus dados apaga na hora');
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e62 ok');
