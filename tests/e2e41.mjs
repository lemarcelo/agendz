/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F2 parte 4: Equipe no site real (dist/index-real.html) contra um servidor falso. As regras de verdade são do servidor (UsuariosTest e
// EquipeEquivalenciaTest rodam no CI); aqui se confere a tela: menu por perfil e permissão, lista, nova pessoa com senha temporária mostrada uma vez,
// editar com permissões, parar/voltar a atender, refazer senha, remover com confirmação, mensagens do servidor, token e senha fora do storage e 390 px sem rolagem.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const chamadas = [];
const MEU = '00000000-0000-4000-8000-0000000000aa';
let loja = { slug: 'apex', nome: 'Apex Estética Automotiva', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null };
let papel = 'dono';
let secoes = ['clientes', 'servicos', 'estabelecimento', 'agenda', 'estoque', 'financeiro'];
let seq = 0;
let banco = [{ id: MEU, nome: 'Davi Souza', apelido: 'Davi', usuario: 'davi', papel: 'dono', atende: true, podeVender: true, comissaoPct: null, permissoes: {}, corSlot: 0, deveTrocarSenha: false, cpfMascarado: '529.***.***-25' }];
const SENHA = 'Zq7mKd4Wp9Xe';

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: req.url, auth: req.headers.authorization || null, corpo: c });
    if (req.url === '/api/publico/loja') return json(200, loja);
    if (req.url === '/api/auth/login') return json(200, { token: 'tok-login', id: MEU, nome: papel === 'dono' ? 'Davi' : 'Pablo', papel, deveTrocarSenha: false, onboardingPendente: false, secoes });
    if (req.headers.authorization !== 'Bearer tok-login') return json(401, { mensagem: 'Sessão inválida' });
    if (papel !== 'dono' && req.url.startsWith('/api/usuarios')) return json(403, { mensagem: 'Sem permissão' });
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/usuarios' && req.method === 'GET') return json(200, banco);
    if (url.pathname === '/api/usuarios' && req.method === 'POST') {
      if (!String(c.nome || '').trim() || !String(c.apelido || '').trim()) return json(400, { mensagem: 'Informe o nome e o apelido.' });
      if (banco.some((x) => x.apelido.toLowerCase() === c.apelido.toLowerCase())) return json(409, { mensagem: 'Já existe alguém com esse apelido.' });
      if ('senha' in c) return json(400, { mensagem: 'Campo não aceito' });
      const novo = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, nome: c.nome, apelido: c.apelido, usuario: c.usuario || c.apelido.toLowerCase(), papel: c.papel, atende: c.atende !== false, podeVender: c.podeVender !== false, comissaoPct: c.comissaoPct ?? null, permissoes: c.permissoes || {}, corSlot: seq, deveTrocarSenha: true, email: c.email, cpfMascarado: c.cpf ? '111.***.***-35' : undefined, cpf: (c.cpf || '').replace(/\D/g, '') || undefined };
      banco.push(novo);
      return json(201, { usuario: novo, senhaTemporaria: SENHA });
    }
    let m = url.pathname.match(/^\/api\/usuarios\/([0-9a-f-]{36})(\/atendimento|\/senha-temporaria)?$/);
    if (m) {
      const x = banco.find((y) => y.id === m[1]);
      if (!x) return json(404, { mensagem: 'Usuário não encontrado.' });
      if (m[2] === '/atendimento') {
        if (!c.atende && x.apelido === 'Pablo') return json(409, { mensagem: 'Pablo ainda tem 2 agendamentos futuros (a confirmar ou confirmado). Remarque ou cancele antes de desativar.' });
        x.atende = c.atende; return json(200, x);
      }
      if (m[2] === '/senha-temporaria') { x.deveTrocarSenha = true; return json(200, { usuario: x, senhaTemporaria: 'Nv5tHc8Ra3Lw' }); }
      if (req.method === 'GET') return json(200, x);
      if (req.method === 'PUT') { Object.assign(x, c); return json(200, x); }
      if (req.method === 'DELETE') {
        if (x.apelido === 'Pablo') return json(409, { mensagem: 'Esse usuário tem histórico de agendamentos e não pode ser removido. Desative-o: o histórico fica e ele deixa de receber novos agendamentos.' });
        banco = banco.filter((y) => y !== x); return json(204);
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
  await p.locator('.nav button').first().waitFor();
  return { ctx, p };
}
const semRolagem = async (p, nome) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${nome}: rolagem horizontal em 390 px`);

// 1. proprietário: nova pessoa, senha temporária uma vez, edição com permissões, atender, refazer senha, remover
{
  const { ctx, p } = await abrir();
  assert.equal(await p.getByTestId('nav-equipe').count(), 1);
  await p.getByTestId('nav-equipe').click();
  await p.getByTestId('eq-lista').waitFor();
  assert.equal(await p.locator(`[data-testid="senha-${MEU}"], [data-testid="remover-${MEU}"]`).count(), 0, 'ninguém refaz a própria senha nem se remove por aqui');
  await p.getByTestId('nova-pessoa').click();
  await p.getByTestId('salvar-pessoa').click(); // vazio: erro do servidor
  assert.match(await p.getByTestId('eq-erro').innerText(), /Informe o nome e o apelido/);
  await p.getByTestId('eq-nome').fill('Pablo Ferreira'); await p.getByTestId('eq-apelido').fill('Pablo');
  await p.getByTestId('eq-cpf').fill('11144477735');
  assert.equal(await p.getByTestId('eq-cpf').inputValue(), '111.444.777-35');
  await p.getByTestId('eq-tel').fill('53999000001');
  assert.equal(await p.getByTestId('eq-tel').inputValue(), '(53) 99900-0001');
  assert.match(await p.getByTestId('eq-papel').innerText(), /Esteticista/, 'rótulo do tipo, não texto fixo');
  await p.getByTestId('eq-comissao').fill('12,5');
  await p.getByTestId('eq-perm-servicos').selectOption('sim');
  // senha temporária escolhida pelo dono (opcional): curta é recusada na tela, sem ir ao servidor; vazia = gerada
  const postsAntes = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/usuarios').length;
  await p.getByTestId('eq-senha').fill('curta'); await p.getByTestId('salvar-pessoa').click();
  assert.match(await p.getByTestId('eq-erro').innerText(), /de 8 a 100 caracteres/);
  assert.equal(chamadas.filter((c) => c.m === 'POST' && c.u === '/api/usuarios').length, postsAntes, 'senha curta nem vai ao servidor');
  await p.getByTestId('eq-senha').fill('');
  await p.getByTestId('salvar-pessoa').click();
  await p.getByTestId('equipe-senha').waitFor();
  assert.equal(await p.getByTestId('equipe-senha-valor').innerText(), SENHA);
  assert.equal(await p.getByTestId('equipe-senha-usuario').innerText(), 'pablo');
  const post = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/usuarios').at(-1);
  assert.equal(post.auth, 'Bearer tok-login');
  assert.ok(!('senha' in post.corpo) && !('usuario' in post.corpo), 'senha nunca vai; usuário vazio não é enviado');
  assert.deepEqual(Object.keys(post.corpo).sort(), ['apelido', 'atende', 'comissaoPct', 'cpf', 'email', 'nascimento', 'nome', 'papel', 'permissoes', 'podeVender', 'telefone'], 'só os campos aceitos');
  assert.deepEqual(post.corpo.permissoes, { servicos: true }, 'só a escolha explícita vai; o padrão do perfil fica com o servidor');
  assert.equal(post.corpo.comissaoPct, 12.5);
  // some ao tocar em Anotei; nada em storage
  const guardado = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie, location.href]));
  assert.ok(!guardado.includes(SENHA) && !/tok-/.test(guardado), 'senha ou token em storage/URL');
  await p.getByTestId('equipe-senha-anotei').click();
  assert.equal(await p.getByTestId('equipe-senha').count(), 0);
  assert.ok(!(await p.locator('body').innerText()).includes(SENHA), 'a senha some da tela depois de "Anotei"');
  assert.match(await p.getByTestId('eq-lista').innerText(), /Pablo/);
  assert.match(await p.getByTestId('eq-lista').innerText(), /Ainda não fez o primeiro acesso/);
  ok('nova pessoa: senha temporária aparece uma vez e some; só campos aceitos; rótulo do tipo');

  // apelido repetido: mensagem do servidor
  await p.getByTestId('nova-pessoa').click();
  await p.getByTestId('eq-nome').fill('Outro Pablo'); await p.getByTestId('eq-apelido').fill('pablo');
  await p.getByTestId('salvar-pessoa').click();
  assert.match(await p.getByTestId('eq-erro').innerText(), /Já existe alguém com esse apelido/);
  await p.getByTestId('eq-cancelar').click();

  // editar: ficha, permissão bloqueada vai como false, sem campo usuário na edição
  const pablo = banco.find((x) => x.apelido === 'Pablo');
  await p.getByTestId(`editar-${pablo.id}`).click();
  await p.getByTestId('eq-form').waitFor();
  assert.equal(await p.getByTestId('eq-usuario').count(), 0);
  assert.equal(await p.getByTestId('eq-perm-servicos').inputValue(), 'sim');
  await p.getByTestId('eq-perm-clientes').selectOption('nao');
  await p.getByTestId('eq-papel').selectOption('atendente');
  await p.getByTestId('salvar-pessoa').click();
  await p.getByTestId('eq-salvo').waitFor();
  const put = chamadas.filter((c) => c.m === 'PUT').at(-1);
  assert.equal(put.u, `/api/usuarios/${pablo.id}`); assert.equal(put.corpo.papel, 'atendente'); assert.deepEqual(put.corpo.permissoes, { servicos: true, clientes: false });
  ok('editar: permissões liberar/bloquear/padrão; perfil trocado');

  // dono não tem bloco de permissões
  await p.getByTestId(`editar-${MEU}`).click();
  await p.getByTestId('eq-form').waitFor();
  assert.equal(await p.getByTestId('eq-permissoes').count(), 0, 'o proprietário pode tudo: sem permissões a escolher');
  await p.getByTestId('eq-cancelar').click();

  // atender: o servidor recusa com agendamentos futuros e a mensagem aparece
  await p.getByTestId(`atender-${pablo.id}`).click();
  await p.getByTestId('eq-erro-lista').waitFor();
  assert.match(await p.getByTestId('eq-erro-lista').innerText(), /ainda tem 2 agendamentos futuros/);
  pablo.apelido = 'Pablo2'; // sem agendamento futuro no servidor falso
  await p.getByTestId(`atender-${pablo.id}`).click();
  await p.getByTestId('eq-salvo').waitFor();
  assert.match(await p.getByTestId('eq-salvo').innerText(), /parou de atender/);

  // refazer senha: nova temporária, uma vez
  await p.getByTestId(`senha-${pablo.id}`).click();
  await p.getByTestId('equipe-senha').waitFor();
  assert.equal(await p.getByTestId('equipe-senha-valor').innerText(), 'Nv5tHc8Ra3Lw');
  await p.getByTestId('equipe-senha-anotei').click();

  // remover com confirmação na tela; com histórico o servidor recusa
  pablo.apelido = 'Pablo';
  await p.getByTestId(`remover-${pablo.id}`).click();
  await p.getByTestId(`eq-confirmar-${pablo.id}`).waitFor();
  await p.getByTestId(`eq-remover-nao-${pablo.id}`).click();
  assert.equal(await p.getByTestId(`eq-confirmar-${pablo.id}`).count(), 0);
  await p.getByTestId(`remover-${pablo.id}`).click(); await p.getByTestId(`eq-remover-sim-${pablo.id}`).click();
  await p.getByTestId('eq-erro-lista').waitFor();
  assert.match(await p.getByTestId('eq-erro-lista').innerText(), /tem histórico de agendamentos/);
  pablo.apelido = 'Pablo3';
  await p.getByTestId(`remover-${pablo.id}`).click(); await p.getByTestId(`eq-remover-sim-${pablo.id}`).click();
  await p.waitForFunction((id) => !document.querySelector(`[data-testid="eq-${id}"]`), pablo.id);
  assert.match(await p.getByTestId('eq-salvo').innerText(), /Pessoa removida/);
  ok('atender, refazer senha e remover: mensagens do servidor, confirmação na tela');
  await ctx.close();
}

// 2. menu por perfil: profissional sem Equipe e só com as seções liberadas; sem Clientes quando bloqueado
{
  papel = 'profissional'; secoes = ['agenda', 'clientes'];
  let t = await abrir();
  assert.equal(await t.p.getByTestId('nav-equipe').count(), 0, 'Equipe é do proprietário');
  assert.equal(await t.p.getByTestId('nav-clientes').count(), 1);
  assert.equal(await t.p.getByTestId('nav-servicos').count(), 1);
  await t.ctx.close();
  secoes = ['agenda'];
  t = await abrir();
  assert.equal(await t.p.getByTestId('nav-clientes').count(), 0, 'sem a seção Clientes não há botão');
  await t.ctx.close();
  ok('menu por perfil e permissão');
}

// 3. barbearia no celular: rótulo do tipo e 390 px sem rolagem (fonte larga do CI)
{
  papel = 'dono'; secoes = ['clientes', 'servicos', 'estabelecimento', 'agenda', 'estoque', 'financeiro'];
  loja = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };
  const { ctx, p } = await abrir({ width: 390, height: 780 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await semRolagem(p, 'início');
  await p.getByTestId('nav-equipe').click();
  await p.getByTestId('eq-lista').waitFor(); await semRolagem(p, 'lista');
  await p.getByTestId('nova-pessoa').click();
  assert.match(await p.getByTestId('eq-papel').innerText(), /Barbeiro/);
  assert.ok(!/esteticista/i.test(await p.getByTestId('eq-form').innerText()), 'nenhum rótulo de outro tipo');
  await semRolagem(p, 'formulário');
  await p.getByTestId('eq-nome').fill('Beto da Silva Sauro Rex Muito Comprido'); await p.getByTestId('eq-apelido').fill('Beto');
  await p.getByTestId('eq-senha').fill('Minha-Senha-9');
  await semRolagem(p, 'formulário com senha');
  await p.getByTestId('salvar-pessoa').click();
  await p.getByTestId('equipe-senha').waitFor(); await semRolagem(p, 'senha temporária');
  const cx = await p.getByTestId('equipe-senha').boundingBox();
  assert.ok(cx.y >= -1 && cx.y < 700, `a senha temporária aparece na tela depois de salvar (y=${cx.y})`);
  assert.equal(chamadas.filter((c) => c.m === 'POST' && c.u === '/api/usuarios').at(-1).corpo.senhaTemporaria, 'Minha-Senha-9', 'a senha escolhida vai no corpo (campo senhaTemporaria)');
  ok('barbearia: rótulo do tipo; 390 px sem rolagem lateral');
  await ctx.close();
}

await b.close();
servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e41 ok');
