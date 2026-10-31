/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F2 parte 2: Clientes no site real (dist/index-real.html) contra um servidor falso. As regras de verdade são do servidor (ClientesTest e
// ClientesEquivalenciaTest rodam no CI); aqui se confere a tela: menu, lista, busca, novo, editar, veículos por tipo, dados restritos,
// mensagens do servidor, token fora do storage e 390 px sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const chamadas = [];
let loja = { slug: 'apex', nome: 'Apex Estética Automotiva', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null };
let papel = 'dono';
let dadosCompletos = true; // o que o servidor devolve na ficha
let seq = 0;
let banco = [];
const mascara = (cpf) => (cpf ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(9)}` : undefined);
const dig = (s) => String(s || '').replace(/\D/g, '');
const tel55 = (t) => { const d = dig(t); return d.startsWith('55') && d.length >= 12 ? d : `55${d}`; };
const resumo = (c) => ({ id: c.id, nome: c.nome, apelido: c.apelido, telefone: c.telefone, cpfMascarado: mascara(c.cpf), veiculos: c.veiculos });
const ficha = (c) => ({ ...c, cpfMascarado: mascara(c.cpf), dadosCompletos, ...(dadosCompletos ? {} : { cpf: undefined, nascimento: undefined }) });

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: req.url, auth: req.headers.authorization || null, corpo: c });
    if (req.url === '/api/publico/loja') return json(200, loja);
    if (req.url === '/api/auth/login') return json(200, { token: 'tok-login', id: '00000000-0000-4000-8000-0000000000aa', nome: papel === 'dono' ? 'Davi' : 'Pablo', papel, deveTrocarSenha: false, onboardingPendente: false, secoes: papel === 'dono' ? ['clientes', 'servicos', 'estabelecimento', 'agenda', 'estoque', 'financeiro'] : ['agenda', 'clientes'] });
    if (req.headers.authorization !== 'Bearer tok-login') return json(401, { mensagem: 'Sessão inválida' });
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/clientes' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      return json(200, banco.filter((x) => !q || x.nome.toLowerCase().includes(q) || x.veiculos.some((v) => v.placa.toLowerCase().replace('-', '').includes(q))).map(resumo));
    }
    if (url.pathname === '/api/clientes' && req.method === 'POST') {
      if (!String(c.nome || '').trim()) return json(400, { mensagem: 'Informe o nome ou apelido do cliente.' });
      if (dig(c.telefone).length < 10) return json(400, { mensagem: 'Informe o telefone com DDD.' });
      if (banco.some((x) => x.nome.toLowerCase() === c.nome.toLowerCase() && x.telefone === tel55(c.telefone))) return json(409, { mensagem: 'Já existe um cliente com esse nome e telefone.' });
      const novo = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, nome: c.nome, apelido: c.apelido || '', telefone: tel55(c.telefone), cpf: dig(c.cpf) || undefined, nascimento: c.nascimento || undefined, veiculos: (c.veiculos || []).map((v, i) => ({ id: `00000000-0000-4000-9000-${String(seq * 10 + i).padStart(12, '0')}`, ...v })) };
      banco.push(novo);
      return json(201, ficha(novo));
    }
    const m = url.pathname.match(/^\/api\/clientes\/([0-9a-f-]{36})$/);
    if (m) {
      const x = banco.find((y) => y.id === m[1]);
      if (!x) return json(404, { mensagem: 'Cliente não encontrado' });
      if (req.method === 'GET') return json(200, ficha(x));
      if (req.method === 'PUT') {
        if (!dadosCompletos && ('cpf' in c || 'nascimento' in c)) return json(403, { mensagem: 'Só o proprietário ou o profissional que atende esse cliente altera o CPF e o nascimento.' });
        for (const k of ['nome', 'apelido', 'nascimento']) if (k in c) x[k] = c[k] || undefined;
        if ('cpf' in c) x.cpf = dig(c.cpf) || undefined;
        if ('telefone' in c) x.telefone = tel55(c.telefone);
        if ('veiculos' in c) x.veiculos = c.veiculos.map((v, i) => ({ id: v.id || `00000000-0000-4000-9000-${String(++seq * 10 + i).padStart(12, '0')}`, ...v }));
        return json(200, ficha(x));
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
  await p.getByTestId('nav-clientes').waitFor();
  return { ctx, p };
}
const semRolagem = async (p, nome) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${nome}: rolagem horizontal em 390 px`);

// 1. estética (dono): menu, lista vazia, novo cliente com veículos, erro do servidor, lista, busca por placa, editar com CPF completo
{
  const { ctx, p } = await abrir();
  assert.equal(await p.getByTestId('nav-clientes').count(), 1);
  assert.equal(await p.locator('[data-testid^="nav-"]').count(), 14, 'só Início, Clientes, Serviços, Equipe, Planos, Cupons, Avaliações, Estabelecimento, Estoque, Relatórios, Comissões, Agenda, Boxes (estética) e Suporte: nada de botão de tela que não existe');
  await p.getByTestId('nav-clientes').click();
  await p.getByTestId('cli-vazio').waitFor();
  await p.getByTestId('novo-cliente').click();
  await p.getByTestId('salvar-cliente').click(); // vazio: erro do servidor
  assert.match(await p.getByTestId('cli-erro').innerText(), /Informe o nome ou apelido do cliente/);
  await p.getByTestId('cli-nome').fill('Ana Souza');
  await p.getByTestId('cli-tel').fill('53999000001');
  assert.equal(await p.getByTestId('cli-tel').inputValue(), '(53) 99900-0001', 'máscara do telefone');
  await p.getByTestId('cli-cpf').fill('52998224725');
  assert.equal(await p.getByTestId('cli-cpf').inputValue(), '529.982.247-25');
  await p.getByTestId('cli-nasc').fill('1990-05-17');
  await p.getByTestId('cli-veiculo-add').click();
  await p.getByTestId('cli-v-placa-0').fill('abc-1234'); await p.getByTestId('cli-v-modelo-0').fill('Civic'); await p.getByTestId('cli-v-porte-0').selectOption('medio');
  await p.getByTestId('cli-veiculo-add').click();
  await p.getByTestId('cli-v-placa-1').fill('bra2e19'); await p.getByTestId('cli-v-modelo-1').fill('Strada'); await p.getByTestId('cli-v-porte-1').selectOption('pickup');
  await p.getByTestId('salvar-cliente').click();
  await p.getByTestId('cli-salvo').waitFor();
  const post = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/clientes').at(-1);
  assert.equal(post.auth, 'Bearer tok-login');
  assert.equal(post.corpo.cpf, '529.982.247-25');
  assert.deepEqual(Object.keys(post.corpo).sort(), ['apelido', 'cpf', 'nascimento', 'nome', 'telefone', 'veiculos'], 'só os campos aceitos vão ao servidor');
  assert.equal(post.corpo.veiculos.length, 2);
  const linha = p.locator('[data-testid="cli-item-nome"]').first();
  assert.equal(await linha.innerText(), 'Ana Souza');
  const texto = await p.getByTestId('cli-lista').innerText();
  assert.match(texto, /\(53\) 99900-0001/); assert.match(texto, /CPF 529\.\*\*\*\.\*\*\*-25/); assert.match(texto, /Civic/); assert.match(texto, /Pickup/);
  assert.ok(!texto.includes('52998224725') && !texto.includes('529.982.247-25'), 'a lista nunca mostra o CPF completo');
  ok('estética: novo cliente com CPF, nascimento e 2 veículos; lista com CPF mascarado');

  // duplicado: mensagem do servidor na própria tela
  await p.getByTestId('novo-cliente').click();
  await p.getByTestId('cli-nome').fill('ana souza'); await p.getByTestId('cli-tel').fill('(53) 99900-0001');
  await p.getByTestId('salvar-cliente').click();
  await p.getByTestId('cli-erro').waitFor();
  assert.match(await p.getByTestId('cli-erro').innerText(), /Já existe um cliente com esse nome e telefone/);
  await p.getByTestId('cli-cancelar').click();
  await p.getByTestId('cli-lista').waitFor();

  // busca (por placa) manda ?q= ao servidor; sem resultado mostra a mensagem
  await p.getByTestId('cli-busca').fill('bra2e19');
  for (let i = 0; i < 40 && !chamadas.some((c) => c.u === '/api/clientes?q=bra2e19'); i++) await new Promise((r) => setTimeout(r, 100)); // a busca espera um instante digitando
  assert.ok(chamadas.some((c) => c.u === '/api/clientes?q=bra2e19'), 'a busca vai ao servidor');
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="cli-item-nome"]').length === 1);
  await p.getByTestId('cli-busca').fill('zzzz');
  await p.getByTestId('cli-vazio').waitFor();
  assert.match(await p.getByTestId('cli-vazio').innerText(), /Nenhum cliente encontrado/);
  await p.getByTestId('cli-busca').fill('');
  await p.getByTestId('cli-lista').waitFor();

  // editar: abre a ficha (CPF completo no campo), muda o apelido e tira um veículo
  const id = banco[0].id;
  await p.getByTestId(`editar-${id}`).click();
  await p.getByTestId('cli-form').waitFor();
  assert.equal(await p.getByTestId('cli-cpf').inputValue(), '529.982.247-25');
  assert.equal(await p.getByTestId('cli-nasc').inputValue(), '1990-05-17');
  assert.equal(await p.getByTestId('cli-v-placa-0').inputValue(), 'ABC-1234');
  await p.getByTestId('cli-apelido').fill('Aninha');
  await p.getByTestId('cli-v-remover-1').click();
  await p.getByTestId('salvar-cliente').click();
  await p.getByTestId('cli-salvo').waitFor();
  const put = chamadas.filter((c) => c.m === 'PUT').at(-1);
  assert.equal(put.u, `/api/clientes/${id}`);
  assert.equal(put.corpo.veiculos.length, 1);
  assert.ok(put.corpo.veiculos[0].id, 'o id do veículo que ficou volta ao servidor');
  await p.waitForFunction(([id, src]) => new RegExp(src).test(document.querySelector(`[data-testid="${id}"]`)?.innerText || ''), ['cli-lista', '“Aninha”']);
  ok('editar: ficha com CPF completo, veículo removido, id mantido; busca por placa; duplicado recusado com a mensagem do servidor');

  const guardado = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
  assert.ok(!/tok-|52998224725|529\.982/.test(guardado), 'token ou CPF em storage/cookie');
  await ctx.close();
}

// 2. profissional que não atende o cliente: CPF só mascarado, sem campos de CPF/nascimento, e eles não vão no PUT
{
  papel = 'profissional'; dadosCompletos = false;
  const { ctx, p } = await abrir();
  await p.getByTestId('nav-clientes').click();
  await p.getByTestId(`editar-${banco[0].id}`).click();
  await p.getByTestId('cli-form').waitFor();
  assert.equal(await p.getByTestId('cli-cpf').count(), 0);
  assert.equal(await p.getByTestId('cli-nasc').count(), 0);
  assert.match(await p.getByTestId('cli-dados-restritos').innerText(), /529\.\*\*\*\.\*\*\*-25/);
  assert.ok(!(await p.getByTestId('cli-form').innerText()).includes('52998224725'));
  await p.getByTestId('cli-apelido').fill('Ani');
  await p.getByTestId('salvar-cliente').click();
  await p.getByTestId('cli-salvo').waitFor();
  const put = chamadas.filter((c) => c.m === 'PUT').at(-1);
  assert.ok(!('cpf' in put.corpo) && !('nascimento' in put.corpo), 'quem não vê o CPF não o envia');
  ok('profissional sem acesso aos dados fortes: CPF mascarado, campos escondidos e fora do PUT');
  await ctx.close();
}

// 3. barbearia: sem veículos; 390 px sem rolagem na lista e no formulário (fonte larga do CI)
{
  papel = 'dono'; dadosCompletos = true; banco = [];
  loja = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await semRolagem(p, 'início');
  await p.getByTestId('nav-clientes').click();
  await p.getByTestId('cli-vazio').waitFor(); await semRolagem(p, 'lista vazia');
  await p.getByTestId('novo-cliente').click();
  assert.equal(await p.getByTestId('cli-veiculos').count(), 0, 'barbearia não tem veículos');
  await p.getByTestId('cli-nome').fill('Beto da Silva Sauro Rex Muito Comprido'); await p.getByTestId('cli-tel').fill('53999000003');
  await semRolagem(p, 'formulário');
  await p.getByTestId('salvar-cliente').click();
  await p.getByTestId('cli-salvo').waitFor(); await semRolagem(p, 'lista');
  const post = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/clientes').at(-1);
  assert.ok(!('veiculos' in post.corpo), 'tipo sem veículo não manda veículos');
  ok('barbearia: sem veículos no formulário; 390 px sem rolagem lateral');
  await ctx.close();
}

assert.deepEqual(erros, [], erros.join('\n'));
await b.close();
servidor.close();
console.log('e2e39 ok');
