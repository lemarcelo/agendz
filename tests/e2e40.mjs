/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F2 parte 3: Serviços no site real (dist/index-real.html) contra um servidor falso. As regras de verdade são do servidor (ServicosTest e
// ServicosEquivalenciaTest rodam no CI); aqui se confere a tela: menu, lista, novo (estética por porte; barbearia preço único), combo, erro do
// servidor na tela, editar, remover/desativar com confirmação na própria tela, profissional só lê, token fora do storage e 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const chamadas = [];
let loja = { slug: 'apex', nome: 'Apex Estética Automotiva', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null };
let papel = 'dono';
let seq = 0;
let banco = [];
const PORTES = ['pequeno', 'medio', 'grande', 'suv', 'pickup'];
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: req.url, auth: req.headers.authorization || null, corpo: c });
    if (req.url === '/api/publico/loja') return json(200, loja);
    if (req.url === '/api/auth/login') return json(200, { token: 'tok-login', id: '00000000-0000-4000-8000-0000000000aa', nome: papel === 'dono' ? 'Davi' : 'Pablo', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: papel === 'dono' ? ['clientes', 'servicos', 'estabelecimento', 'agenda', 'estoque', 'financeiro'] : ['agenda', 'clientes'] });
    if (req.headers.authorization !== 'Bearer tok-login') return json(401, { mensagem: 'Sessão inválida' });
    const url = new URL(req.url, 'http://x');
    const dono = papel === 'dono';
    if (url.pathname === '/api/servicos' && req.method === 'GET') return json(200, banco.filter((s) => dono || s.ativo));
    if (url.pathname === '/api/servicos' && req.method === 'POST') {
      if (!dono) return json(403, { mensagem: 'Sem permissão' });
      if (!String(c.nome || '').trim()) return json(400, { mensagem: 'Informe o nome do serviço.' });
      const porPorte = loja.tipo === 'estetica_automotiva';
      if (porPorte && !(c.precos && PORTES.every((p) => typeof c.precos[p] === 'number'))) return json(400, { mensagem: 'Informe o preço para o porte Médio.' });
      if (!porPorte && typeof c.preco !== 'number') return json(400, { mensagem: 'Informe o preço.' });
      if (c.combo && !(Array.isArray(c.componentes) && c.componentes.length >= 2)) return json(400, { mensagem: 'Um combo junta de 2 a 10 serviços diferentes.' });
      if (c.codigo && banco.some((s) => s.codigo.toLowerCase() === c.codigo.toLowerCase())) return json(409, { mensagem: `Já existe serviço com o código ${c.codigo}.` });
      const novo = {
        id: id(), codigo: c.codigo || String(banco.length + 1), nome: c.nome, categoria: c.categoria || null,
        preco: porPorte ? c.precos.medio : c.preco, duracaoMin: porPorte ? c.duracoes.medio : c.duracaoMin, intervaloMin: c.intervaloMin || 0, antecedenciaH: c.antecedenciaH || 0,
        multiDia: !!c.multiDia, combo: !!c.combo, componentes: c.componentes || [], comissaoPct: c.comissaoPct ?? null, ativo: c.ativo !== false,
        precos: porPorte ? c.precos : null, duracoes: porPorte ? c.duracoes : null,
      };
      banco.push(novo);
      return json(201, novo);
    }
    const m = url.pathname.match(/^\/api\/servicos\/([0-9a-f-]{36})$/);
    if (m) {
      const x = banco.find((y) => y.id === m[1]);
      if (!x) return json(404, { mensagem: 'Serviço não encontrado.' });
      if (req.method === 'GET') return json(200, x);
      if (!dono) return json(403, { mensagem: 'Sem permissão' });
      if (req.method === 'PUT') {
        Object.assign(x, { nome: c.nome, categoria: c.categoria || null, ativo: c.ativo !== false });
        if (c.precos) { x.precos = c.precos; x.preco = c.precos.medio; }
        if (c.preco !== undefined) x.preco = c.preco;
        if (c.duracoes) { x.duracoes = c.duracoes; x.duracaoMin = c.duracoes.medio; }
        if (c.duracaoMin !== undefined) x.duracaoMin = c.duracaoMin;
        return json(200, x);
      }
      if (req.method === 'DELETE') {
        if (banco.some((y) => y.componentes.includes(x.id))) { x.ativo = false; return json(200, { desativado: true }); }
        banco = banco.filter((y) => y !== x);
        return json(204);
      }
    }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport = { width: 1280, height: 800 }) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('davi'); await p.getByTestId('login-senha').fill('qualquer'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('painel-real').waitFor();
  return { ctx, p };
}
const semRolagem = async (p, nome) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${nome}: rolagem horizontal em 390 px`);
const portes = async (p, precos, duracoes) => { for (const [i, k] of PORTES.entries()) { await p.getByTestId(`srv-preco-${k}`).fill(String(precos[i])); await p.getByTestId(`srv-duracao-${k}`).fill(String(duracoes[i])); } };

// 1. estética (dono): preço e duração por porte, erro do servidor na tela, código repetido, combo, apagar x desativar, editar
{
  const { ctx, p } = await abrir();
  assert.equal(await p.getByTestId('nav-servicos').count(), 1);
  await p.getByTestId('nav-servicos').click();
  await p.getByTestId('srv-vazio').waitFor();
  await p.getByTestId('novo-servico').click();
  assert.equal(await p.getByTestId('srv-portes').count(), 1, 'estética pede preço e duração por porte');
  assert.equal(await p.getByTestId('srv-preco').count(), 0);
  await p.getByTestId('salvar-servico').click(); // vazio: erro do servidor
  assert.match(await p.getByTestId('srv-erro').innerText(), /Informe o nome do serviço/);
  await p.getByTestId('srv-nome').fill('Lavagem completa');
  await p.getByTestId('salvar-servico').click();
  assert.match(await p.getByTestId('srv-erro').innerText(), /Informe o preço para o porte Médio/);
  await portes(p, ['60,50', 70, 80, 90, 95], [40, 45, 50, 55, 60]);
  await p.getByTestId('srv-categoria').fill('Lavagem'); await p.getByTestId('srv-codigo').fill('LV-1');
  await p.getByTestId('srv-intervalo').fill('10'); await p.getByTestId('srv-antecedencia').fill('2'); await p.getByTestId('srv-comissao').fill('12,5');
  await p.getByTestId('salvar-servico').click();
  await p.getByTestId('srv-salvo').waitFor();
  const post = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/servicos').at(-1);
  assert.equal(post.auth, 'Bearer tok-login');
  assert.deepEqual(Object.keys(post.corpo).sort(), ['antecedenciaH', 'ativo', 'categoria', 'codigo', 'combo', 'comissaoPct', 'duracoes', 'intervaloMin', 'multiDia', 'nome', 'precos'], 'só os campos aceitos vão ao servidor');
  assert.equal(post.corpo.precos.pequeno, 60.5, 'vírgula decimal vira número');
  assert.equal(post.corpo.comissaoPct, 12.5);
  const texto = await p.getByTestId('srv-lista').innerText();
  assert.match(texto, /Lavagem completa/); assert.match(texto, /#LV-1/); assert.match(texto, /R\$\s?60,50 a R\$\s?95,00/); assert.match(texto, /45 min/);
  ok('estética: serviço por porte; erros do servidor na tela; vírgula decimal; lista com faixa de preço');

  // código repetido (409) com a mensagem do servidor
  await p.getByTestId('novo-servico').click();
  await p.getByTestId('srv-nome').fill('Outra'); await portes(p, [1, 1, 1, 1, 1], [10, 10, 10, 10, 10]); await p.getByTestId('srv-codigo').fill('lv-1');
  await p.getByTestId('salvar-servico').click();
  assert.match(await p.getByTestId('srv-erro').innerText(), /Já existe serviço com o código lv-1/);
  await p.getByTestId('srv-codigo').fill('');
  await p.getByTestId('srv-nome').fill('Cera'); await p.getByTestId('salvar-servico').click();
  await p.getByTestId('srv-salvo').waitFor();
  assert.ok(!('codigo' in chamadas.filter((c) => c.m === 'POST').at(-1).corpo), 'código vazio não é enviado (o servidor dá o próximo)');

  // combo: precisa de 2 serviços; a tela lista só os comuns
  await p.getByTestId('novo-servico').click();
  await p.getByTestId('srv-nome').fill('Lavagem + cera'); await portes(p, [100, 110, 120, 130, 140], [60, 70, 80, 90, 100]);
  await p.getByTestId('srv-combo').check();
  const [a, c2] = banco.map((s) => s.id);
  await p.getByTestId(`srv-comp-${a}`).check();
  await p.getByTestId('salvar-servico').click();
  assert.match(await p.getByTestId('srv-erro').innerText(), /de 2 a 10 serviços/);
  await p.getByTestId(`srv-comp-${c2}`).check();
  await p.getByTestId('salvar-servico').click();
  await p.getByTestId('srv-salvo').waitFor();
  assert.deepEqual(chamadas.filter((c) => c.m === 'POST').at(-1).corpo.componentes, [a, c2]);
  await p.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`[data-testid="${id}"]`)?.innerText || ''), ['srv-lista', 'Combo de 2']);
  ok('combo: erro do servidor com 1 serviço; salva com 2');

  // remover com confirmação na própria tela; serviço dentro de combo só desativa
  await p.getByTestId(`remover-${a}`).click();
  await p.getByTestId(`srv-confirmar-${a}`).waitFor();
  await p.getByTestId(`srv-remover-nao-${a}`).click();
  assert.equal(await p.getByTestId(`srv-confirmar-${a}`).count(), 0);
  await p.getByTestId(`remover-${a}`).click(); await p.getByTestId(`srv-remover-sim-${a}`).click();
  await p.getByTestId('srv-salvo').waitFor();
  assert.match(await p.getByTestId('srv-salvo').innerText(), /desativado em vez de apagado/);
  assert.match(await p.getByTestId(`srv-${a}`).innerText(), /Desativado/);
  const combo = banco.find((s) => s.combo);
  await p.getByTestId(`remover-${combo.id}`).click(); await p.getByTestId(`srv-remover-sim-${combo.id}`).click();
  await p.waitForFunction((cid) => !document.querySelector(`[data-testid="srv-${cid}"]`), combo.id);
  assert.match(await p.getByTestId('srv-salvo').innerText(), /Serviço removido/);

  // editar: nome e preço do porte médio
  await p.getByTestId(`editar-${c2}`).click();
  await p.getByTestId('srv-form').waitFor();
  assert.equal(await p.getByTestId('srv-preco-medio').inputValue(), '1');
  await p.getByTestId('srv-nome').fill('Cera premium'); await p.getByTestId('srv-preco-medio').fill('99');
  await p.getByTestId('salvar-servico').click();
  await p.getByTestId('srv-salvo').waitFor();
  const put = chamadas.filter((c) => c.m === 'PUT').at(-1);
  assert.equal(put.u, `/api/servicos/${c2}`); assert.equal(put.corpo.precos.medio, 99);
  await p.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`[data-testid="${id}"]`)?.innerText || ''), ['srv-lista', 'Cera premium']);
  // busca local
  await p.getByTestId('srv-busca').fill('zzzz'); await p.getByTestId('srv-vazio').waitFor();
  await p.getByTestId('srv-busca').fill('premium'); assert.equal(await p.locator('[data-testid="srv-item-nome"]').count(), 1);
  ok('remoção pede confirmação na tela; desativa quando está num combo; editar manda o id e a tabela; busca');

  const guardado = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
  assert.ok(!/tok-/.test(guardado), 'token em storage/cookie');
  await ctx.close();
}

// 2. profissional: só vê os ativos, sem botões de escrita, formulário somente leitura
{
  papel = 'profissional';
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-servicos').click();
  await p.getByTestId('srv-lista').waitFor();
  assert.equal(await p.getByTestId('novo-servico').count(), 0);
  assert.equal(await p.locator('[data-testid^="remover-"]').count(), 0);
  assert.ok(!(await p.getByTestId('srv-lista').innerText()).includes('Desativado'), 'o servidor só devolve os ativos ao profissional');
  await p.locator('[data-testid^="editar-"]').first().click();
  await p.getByTestId('srv-form').waitFor();
  assert.equal(await p.getByTestId('salvar-servico').count(), 0);
  assert.equal(await p.getByTestId('srv-comissao').count(), 0, 'comissão do serviço é do dono');
  assert.equal(await p.getByTestId('srv-nome').isDisabled(), true);
  assert.equal(await p.getByTestId('srv-somente-leitura').count(), 1);
  ok('profissional: consulta sem botões de escrita nem comissão');
  await ctx.close();
}

// 3. barbearia: preço único, sem "vários dias"; 390 px sem rolagem (fonte larga do CI)
{
  papel = 'dono'; banco = [];
  loja = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await p.getByTestId('nav-servicos').click();
  await p.getByTestId('srv-vazio').waitFor(); await semRolagem(p, 'lista vazia');
  await p.getByTestId('novo-servico').click();
  assert.equal(await p.getByTestId('srv-portes').count(), 0, 'barbearia não tem preço por porte');
  assert.equal(await p.getByTestId('srv-multidia').count(), 0, 'barbearia não tem vários dias');
  await p.getByTestId('srv-nome').fill('Corte masculino com barba e sobrancelha bem comprido'); await p.getByTestId('srv-preco').fill('45'); await p.getByTestId('srv-duracao').fill('50');
  await semRolagem(p, 'formulário');
  await p.getByTestId('salvar-servico').click();
  await p.getByTestId('srv-salvo').waitFor(); await semRolagem(p, 'lista');
  const post = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/servicos').at(-1);
  assert.equal(post.corpo.preco, 45); assert.equal(post.corpo.duracaoMin, 50);
  assert.ok(!('precos' in post.corpo) && !('multiDia' in post.corpo), 'tipo sem porte nem vários dias não manda esses campos');
  ok('barbearia: preço único; sem porte nem vários dias; 390 px sem rolagem lateral');
  await ctx.close();
}

await b.close();
servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e40 ok');
