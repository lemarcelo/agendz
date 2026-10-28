/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Assistente de primeiro acesso (docs/F3-primeiro-acesso.md): (A) pré-visualização no Artifact/demonstração, nada é gravado;
// (B) site real (dist/index-real.html) contra um servidor falso: dono novo → troca a senha → serviços → equipe (senhas uma vez) → painel,
// retomando do passo em que parou. 390 px sem rolagem lateral, com fonte larga.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';

// Depois dos serviços o assistente passa por Produtos e Comissão (opcionais): estes testes só querem chegar à Equipe.
const passarProdutosEComissao = async (p) => { await p.getByTestId('pa-pular-produtos').click(); await p.getByTestId('pa-pular-comissao').click(); };
import { readFileSync } from 'node:fs';

const ok = (m) => console.log('✓', m);
const erros = [];
const b = await chromium.launch();
const novaPagina = async (viewport = { width: 1280, height: 800 }) => {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  return { ctx, p };
};
const semRolagem = async (p, nome) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${nome}: rolagem horizontal`);

// ---------- A. pré-visualização no Artifact ----------
{
  const base = new URL('../dist/index.html', import.meta.url).href;
  const { ctx, p } = await novaPagina();
  await p.goto(`${base}?loja=dalforno`);
  await p.getByTestId('ver-primeiro-acesso').click();
  await p.getByTestId('pa-servicos').waitFor();
  assert.equal(await p.getByTestId('pa-previa').count(), 1);
  assert.match(await p.locator('h1').first().innerText(), /Vamos preparar/);
  // a barbearia tem uma lista ampla, agrupada por categoria
  assert.ok((await p.locator('[data-testid^=pa-categoria-]').count()) >= 5, 'categorias do catálogo da barbearia');
  assert.equal(await p.getByTestId('pa-item-s-barboterapia').count(), 1);
  assert.ok((await p.locator('[data-testid^=pa-item-]').count()) >= 25);
  // nenhum item marcado: Continuar desligado; marcar todos liga e mostra a contagem; edita preço e duração
  assert.equal(await p.getByTestId('pa-continuar-servicos').isDisabled(), true);
  await p.getByTestId('pa-marcar-todos').click();
  assert.equal(await p.getByTestId('pa-continuar-servicos').isDisabled(), false);
  await p.getByTestId('pa-preco-s-barba').fill('abc');
  await p.getByTestId('pa-continuar-servicos').click();
  assert.match(await p.getByTestId('pa-erro').innerText(), /preço de “Barba”/);
  await p.getByTestId('pa-preco-s-barba').fill('37,5');
  await p.getByTestId('pa-continuar-servicos').click();
  await passarProdutosEComissao(p); await p.getByTestId('pa-equipe').waitFor();
  assert.match(await p.getByTestId('pa-aviso').innerText(), /serviços criados/);
  // equipe: nomes com acento e repetidos viram logins distintos; senha de 12 caracteres sem ambíguos
  await p.getByTestId('pa-nome-0').fill('Zé Maria');
  await p.getByTestId('pa-add').click();
  await p.getByTestId('pa-nome-1').fill('Zé Carlos');
  await p.getByTestId('pa-atende-1').uncheck();
  await p.getByTestId('pa-criar-acessos').click();
  await p.getByTestId('pa-acessos').waitFor();
  const s1 = await p.getByTestId('pa-senha-ze').innerText(); const s2 = await p.getByTestId('pa-senha-ze2').innerText();
  assert.match(s1, /^[A-HJ-NP-Za-km-z2-9]{12}$/); assert.notEqual(s1, s2);
  await p.getByTestId('pa-copiar').click();
  await p.getByTestId('pa-anotei').click();
  // expediente: sugestão do tipo já marcada; pausa fora do horário é recusada; depois continua
  await p.getByTestId('pa-expediente').waitFor();
  assert.equal(await p.getByTestId('pa-dia-1').isChecked(), true);
  assert.equal(await p.getByTestId('pa-dia-0').isChecked(), false);
  await p.getByTestId('pa-pausa-de').fill('20:00');
  await p.getByTestId('pa-continuar-expediente').click();
  assert.match(await p.getByTestId('pa-erro').innerText(), /pausa/i);
  await p.getByTestId('pa-pausa-de').fill('12:00');
  await p.getByTestId('pa-continuar-expediente').click();
  await p.getByTestId('pa-pronto').waitFor();
  await p.getByTestId('pa-concluir').click();
  await p.getByTestId('login-id').waitFor();
  assert.equal(await p.evaluate(() => location.hash), '');
  ok('A: pré-visualização (Dalforno): serviços, validação, equipe com logins únicos, senhas, pronto → volta ao login');
  await ctx.close();

  // estética: serviço com preço por porte mostra a faixa e não pede preço; 390 px com fonte larga
  const m = await novaPagina({ width: 390, height: 780 });
  await m.p.goto(`${base}?loja=apex#primeiro-acesso`);
  await m.p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await m.p.getByTestId('pa-servicos').waitFor();
  await m.p.getByTestId('pa-marcar-s-lav-simples').check();
  assert.match(await m.p.getByTestId('pa-item-s-lav-simples').innerText(), /por porte.*R\$\s?40,00 a R\$\s?70,00/s);
  assert.equal(await m.p.getByTestId('pa-preco-s-lav-simples').count(), 0);
  await semRolagem(m.p, 'serviços');
  await m.p.getByTestId('pa-pular-servicos').click();
  await passarProdutosEComissao(m.p); await m.p.getByTestId('pa-equipe').waitFor();
  assert.match(await m.p.getByTestId('pa-equipe').innerText(), /Profissionais|esteticistas/i);
  await semRolagem(m.p, 'equipe');
  await m.p.getByTestId('pa-pular-equipe').click();
  await m.p.getByTestId('pa-expediente').waitFor(); await semRolagem(m.p, 'expediente');
  await m.p.getByTestId('pa-pular-expediente').click();
  await m.p.getByTestId('pa-pronto').waitFor(); await semRolagem(m.p, 'pronto');
  ok('A: estética (390 px, fonte larga): preço por porte sem campo de preço; sem rolagem lateral; pular passos');
  await m.ctx.close();

  // reconfigurar em Estabelecimento (só o dono): serviços do tipo (os da loja já marcados), equipe só adiciona, nada é gravado
  const r = await novaPagina();
  await r.p.goto(`${base}?loja=apex`);
  await r.p.getByTestId('demo-davi').click();
  await r.p.getByTestId('nav-estab').click();
  await r.p.getByRole('tab', { name: 'Reconfigurar' }).click();
  assert.match(await r.p.getByTestId('reconfigurar').innerText(), /ninguém da equipe é excluído/);
  const usuariosAntes = await r.p.evaluate(() => document.body.innerText.length);
  await r.p.getByTestId('reconfigurar-abrir').click();
  await r.p.getByTestId('pa-reconf-senha').waitFor();
  assert.equal(await r.p.getByTestId('pa-servicos').count(), 0, 'sem a senha não há passos');
  await r.p.getByTestId('pa-reconf-confirmar').click();
  assert.match(await r.p.getByTestId('pa-erro').innerText(), /Digite a sua senha/);
  await r.p.getByTestId('pa-reconf-senha').fill('qualquer');
  await r.p.getByTestId('pa-reconf-confirmar').click();
  await r.p.getByTestId('pa-servicos').waitFor();
  assert.match(await r.p.getByTestId('pa').locator('h1').innerText(), /Reconfigurar Apex/);
  assert.equal(await r.p.getByTestId('pa-previa').count(), 1);
  assert.match(await r.p.getByTestId('pa-reconf-nota').innerText(), /só adiciona/);
  assert.match(await r.p.getByTestId('pa-item-s-lav-simples').innerText(), /já está na sua loja/);
  assert.equal(await r.p.getByTestId('pa-continuar-servicos').isDisabled(), true);
  await r.p.getByTestId('pa-pular-servicos').click();
  await passarProdutosEComissao(r.p); await r.p.getByTestId('pa-equipe').waitFor();
  assert.match(await r.p.getByTestId('pa-equipe').innerText(), /ninguém|não é alterado/);
  await r.p.getByTestId('pa-nome-0').fill('Zeca Novo');
  await r.p.getByTestId('pa-criar-acessos').click();
  await r.p.getByTestId('pa-acessos').waitFor();
  assert.match(await r.p.getByTestId('pa-senha-zeca').innerText(), /^[A-HJ-NP-Za-km-z2-9]{12}$/);
  await r.p.getByTestId('pa-anotei').click();
  await r.p.getByTestId('pa-expediente').waitFor();
  assert.equal(await r.p.getByTestId('pa-dia-1').isChecked(), true); // o expediente atual da loja
  assert.equal(await r.p.getByTestId('pa-dia-0').isChecked(), false);
  await r.p.getByTestId('pa-pular-expediente').click();
  await r.p.getByTestId('pa-pronto').waitFor();
  assert.match(await r.p.getByTestId('pa-pronto').innerText(), /Nada que já existia foi removido/);
  await r.p.getByTestId('pa-concluir').click(); // "Voltar ao estabelecimento"
  await r.p.getByTestId('reconfigurar').waitFor();
  assert.equal(await r.p.getByTestId('pa').count(), 0);
  // histórico: a reconfiguração aparece com as contagens; Desfazer e Refazer pedem a senha e não mexem em nada lançado
  await r.p.getByTestId('reconfigurar-abrir').click();
  await r.p.getByTestId('pa-reconf-senha').waitFor();
  assert.match(await r.p.getByTestId('pa-reconf-historico').innerText(), /1 pessoa/);
  await r.p.locator('[data-testid^="pa-reconf-desfazer-"]').click();
  assert.match(await r.p.getByTestId('pa-erro').innerText(), /Digite a sua senha para desfazer/);
  await r.p.getByTestId('pa-reconf-senha').fill('qualquer');
  await r.p.locator('[data-testid^="pa-reconf-desfazer-"]').click();
  await r.p.locator('[data-testid^="pa-reconf-refazer-"]').waitFor();
  assert.match(await r.p.getByTestId('pa-reconf-historico').innerText(), /desfeita/);
  assert.equal(await r.p.locator('[data-testid^="pa-reconf-desfazer-"]').count(), 0);
  await r.p.getByTestId('pa-reconf-senha').fill('qualquer');
  await r.p.locator('[data-testid^="pa-reconf-refazer-"]').click();
  await r.p.locator('[data-testid^="pa-reconf-desfazer-"]').waitFor();
  await r.p.getByTestId('pa-voltar').click();
  await r.p.getByTestId('reconfigurar').waitFor();
  // nada foi gravado: a Equipe não ganhou o Zeca
  await r.p.getByTestId('nav-equipe').click();
  assert.equal(await r.p.getByText('Zeca Novo').count(), 0);
  await r.ctx.close();
  // quem não é dono não vê a aba
  const q = await novaPagina();
  await q.p.goto(`${base}?loja=apex`);
  await q.p.getByTestId('demo-pablo').click();
  if (await q.p.getByTestId('nav-estab').count()) { await q.p.getByTestId('nav-estab').click(); assert.equal(await q.p.getByRole('tab', { name: 'Reconfigurar' }).count(), 0); }
  await q.ctx.close();
  ok('A: Reconfigurar em Estabelecimento (só dono): serviços da loja marcados, equipe só adiciona, expediente atual, nada gravado');
}

// ---------- B. site real com servidor falso ----------
const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const chamadas = [];
const dia = (a) => ({ aberto: a, faixas: a ? [['09:00', '12:00'], ['14:00', '18:00']] : [] });
const SUGESTAO = { semana: { 0: dia(false), 1: dia(true), 2: dia(true), 3: dia(true), 4: dia(true), 5: dia(true), 6: dia(true) } };
const banco = { passo: 'senha', concluido: false, servicos: [], logins: new Set(['marcos']), senhaTemp: true , autorizado: false, hist: [{ id: '11111111-1111-1111-1111-111111111111', criadaEm: '2026-10-28T12:00:00Z', por: 'Alan', servicosCriados: 1, pessoasCriadas: 1, expedienteTrocado: false, desfeitaEm: '', podeDesfazer: true, podeRefazer: false }] };
const CATALOGO = [
  { chave: 's-corte', nome: 'Corte', categoria: null, preco: 40, duracaoMin: 30, precos: null, duracoes: null },
  { chave: 's-barba', nome: 'Barba', categoria: null, preco: 35, duracaoMin: 40, precos: null, duracoes: null },
];
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj, extra = {}) => { res.writeHead(st, { 'Content-Type': 'application/json', ...extra }); res.end(JSON.stringify(obj)); };
    if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: req.url, auth: req.headers.authorization || null, c });
    const tok = req.headers.authorization;
    if (req.url === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (req.url === '/api/auth/login') {
      if (c.identificador !== 'alan' || c.senha !== (banco.senhaTemp ? 'Temporaria-123' : 'Minha-senha-nova')) return json(401, { mensagem: 'Usuário ou senha inválidos' });
      return json(200, { token: banco.senhaTemp ? 'tok-temp' : 'tok-ok', nome: 'Alan', papel: 'dono', deveTrocarSenha: banco.senhaTemp, onboardingPendente: !banco.concluido });
    }
    if (req.url === '/api/usuarios/me/senha') {
      banco.senhaTemp = false; if (banco.passo === 'senha') banco.passo = 'servicos';
      return json(200, { token: 'tok-ok', nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: !banco.concluido });
    }
    if (tok !== 'Bearer tok-ok') return json(403, { mensagem: 'Sem permissão' });
    if (req.url === '/api/onboarding') return json(200, { tipo: 'barbearia', passo: banco.passo, concluido: banco.concluido, servicos: CATALOGO, jaCadastrados: banco.servicos, expedienteSugerido: SUGESTAO });
    if (req.url === '/api/onboarding/reconfiguracoes' && req.method === 'POST') {
      if (c.senha !== 'Minha-senha-nova') return json(403, { mensagem: 'Senha incorreta' });
      banco.autorizado = true; return json(200, { id: '22222222-2222-2222-2222-222222222222', autorizadaAte: '2026-10-28T13:00:00Z' });
    }
    if (req.url === '/api/onboarding/reconfiguracoes' && req.method === 'GET') return json(200, { itens: banco.hist });
    const tr = /^\/api\/onboarding\/reconfiguracoes\/([0-9a-f-]{36})\/(desfazer|refazer)$/.exec(req.url);
    if (tr) {
      if (c.senha !== 'Minha-senha-nova') return json(403, { mensagem: 'Senha incorreta' });
      const h = banco.hist.find((x) => x.id === tr[1]);
      if (tr[2] === 'desfazer') { h.desfeitaEm = '2026-10-28T12:30:00Z'; h.podeDesfazer = false; h.podeRefazer = true; } else { h.desfeitaEm = ''; h.podeDesfazer = true; h.podeRefazer = false; }
      return json(200, { itens: banco.hist });
    }
    if (banco.concluido && !banco.autorizado && /^\/api\/onboarding\/(servicos|equipe|expediente)$/.test(req.url)) return json(403, { mensagem: 'Confirme sua senha para reconfigurar a loja' });
    if (req.url === '/api/onboarding/servicos') {
      if (banco.falhar) { banco.falhar = false; return json(500, { trace: 'detalhe interno que não pode aparecer' }); }
      let criados = 0;
      for (const i of c.itens) if (!banco.servicos.includes(i.chave)) { banco.servicos.push(i.chave); criados++; }
      banco.passo = 'equipe';
      return json(200, { criados, jaExistiam: c.itens.length - criados });
    }
    if (req.url === '/api/onboarding/equipe') {
      const pessoas = c.pessoas.map((p, i) => { let l = p.nome.split(' ')[0].toLowerCase(); let n = 2; const base = l; while (banco.logins.has(l)) l = base + n++; banco.logins.add(l); return { nome: p.nome, login: l, senhaTemporaria: `Senha${i}Fake12`.slice(0, 12), atende: p.atende }; });
      banco.passo = 'expediente';
      return json(200, { pessoas }, { 'Cache-Control': 'no-store' });
    }
    if (req.url === '/api/onboarding/expediente') { banco.expediente = c.semana; banco.passo = 'pronto'; return json(200, { criados: Object.keys(c.semana || {}).length ? 1 : 0, ignorados: 0 }); }
    if (req.url === '/api/onboarding/concluir') { banco.concluido = true; banco.passo = 'pronto'; return json(200, { tipo: 'barbearia', passo: 'pronto', concluido: true, servicos: [], jaCadastrados: [] }); }
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;

{
  const { ctx, p } = await novaPagina({ width: 390, height: 780 });
  await p.goto(url);
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Temporaria-123'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('troca-nova').waitFor();
  await p.getByTestId('troca-atual').fill('Temporaria-123'); await p.getByTestId('troca-usuario').fill('alan'); await p.getByTestId('troca-nova').fill('Minha-senha-nova'); await p.getByTestId('troca-repetir').fill('Minha-senha-nova'); await p.getByTestId('troca-salvar').click();
  // dono com onboarding pendente cai no assistente, no passo "servicos"
  await p.getByTestId('pa-servicos').waitFor();
  assert.equal(chamadas.at(-1).u, '/api/onboarding');
  assert.equal(await p.getByTestId('pa-previa').count(), 0, 'no site real não há aviso de pré-visualização');
  await semRolagem(p, 'serviços (real)');
  // um item marcado → manda só a chave e os números; falha do servidor mostra mensagem genérica e mantém a tela
  await p.getByTestId('pa-marcar-s-barba').check();
  await p.getByTestId('pa-preco-s-barba').fill('37,50');
  banco.falhar = true;
  await p.getByTestId('pa-continuar-servicos').click();
  await p.getByTestId('pa-erro').waitFor();
  const msg = await p.getByTestId('pa-erro').innerText();
  assert.ok(!/detalhe interno|trace/.test(msg), 'detalhe técnico na tela');
  assert.match(msg, /servidor não respondeu/);
  await p.getByTestId('pa-continuar-servicos').click();
  await passarProdutosEComissao(p); await p.getByTestId('pa-equipe').waitFor();
  const envio = chamadas.filter((c) => c.u === '/api/onboarding/servicos').at(-1);
  assert.deepEqual(envio.c, { itens: [{ chave: 's-barba', preco: 37.5, duracaoMin: 40 }], proprios: [] });
  assert.equal(envio.auth, 'Bearer tok-ok');
  ok('B: dono novo troca a senha, cai no assistente, envia só chave+números, erro do servidor não derruba a tela');

  // recarregar no meio: o login traz de volta ao passo da Equipe (o servidor guardou), com o serviço já marcado como existente
  await p.reload();
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha-nova'); await p.getByTestId('login-entrar').click();
  await passarProdutosEComissao(p); await p.getByTestId('pa-equipe').waitFor();
  ok('B: recarregar no meio retoma do passo da Equipe');

  await p.getByTestId('pa-nome-0').fill('Marcos Silva');
  await p.getByTestId('pa-add').click(); await p.getByTestId('pa-nome-1').fill('Marcos Souza');
  await p.getByTestId('pa-criar-acessos').click();
  await p.getByTestId('pa-acessos').waitFor();
  assert.equal(await p.getByTestId('pa-senha-marcos2').innerText(), 'Senha0Fake12'.slice(0, 12));
  assert.match(await p.getByTestId('pa-acessos').innerText(), /não aparecem de novo/);
  await semRolagem(p, 'acessos');
  await p.getByTestId('pa-anotei').click();
  await p.getByTestId('pa-expediente').waitFor();
  await p.getByTestId('pa-dia-0').check();
  await p.getByTestId('pa-continuar-expediente').click();
  await p.getByTestId('pa-pronto').waitFor();
  const exp = chamadas.filter((c) => c.u === '/api/onboarding/expediente').at(-1);
  assert.deepEqual(exp.c.semana[0], { aberto: true, faixas: [['09:00', '12:00'], ['14:00', '18:00']] });
  assert.deepEqual(exp.c.semana[3], { aberto: true, faixas: [['09:00', '12:00'], ['14:00', '18:00']] });
  await p.getByTestId('pa-concluir').click();
  await p.getByTestId('painel-real').waitFor();
  assert.equal(chamadas.at(-1).u, '/api/onboarding/concluir');
  // as senhas não ficaram em nenhum storage
  const guardado = await p.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]));
  assert.ok(!/Senha\dFake|tok-/.test(guardado));
  ok('B: equipe criada com login único (marcos já existia → marcos2), senhas só na tela, conclusão abre o painel');
  await ctx.close();

  // depois de concluído, o próximo login vai direto ao painel
  const n = await novaPagina();
  await n.p.goto(url);
  await n.p.getByTestId('login-id').fill('alan'); await n.p.getByTestId('login-senha').fill('Minha-senha-nova'); await n.p.getByTestId('login-entrar').click();
  await n.p.getByTestId('painel-real').waitFor();
  assert.equal(await n.p.getByTestId('pa').count(), 0);
  ok('B: assistente concluído não volta');
  // reconfigurar: o dono reabre o assistente pelo painel; começa nos serviços, os existentes ficam travados, nada é concluído de novo
  const antesConcluir = chamadas.filter((c) => c.u === '/api/onboarding/concluir').length;
  // sem a senha, o servidor recusa os passos (403) e o assistente não os mostra
  banco.autorizado = false;
  await n.p.getByTestId('reconfigurar-abrir').click();
  await n.p.getByTestId('pa-reconf-senha').waitFor();
  assert.equal(await n.p.getByTestId('pa-servicos').count(), 0);
  await n.p.getByTestId('pa-reconf-senha').fill('errada');
  await n.p.getByTestId('pa-reconf-confirmar').click();
  assert.match(await n.p.getByTestId('pa-erro').innerText(), /Senha incorreta/);
  assert.equal(await n.p.getByTestId('pa-servicos').count(), 0);
  // o histórico vem do servidor; desfazer manda a senha e o id; senha errada não muda nada
  assert.match(await n.p.getByTestId('pa-reconf-historico').innerText(), /1 serviço, 0 produtos, 1 pessoa/);
  await n.p.getByTestId('pa-reconf-senha').fill('errada');
  await n.p.getByTestId('pa-reconf-desfazer-11111111-1111-1111-1111-111111111111').click();
  assert.match(await n.p.getByTestId('pa-erro').innerText(), /Senha incorreta/);
  assert.equal(banco.hist[0].desfeitaEm, '');
  await n.p.getByTestId('pa-reconf-senha').fill('Minha-senha-nova');
  await n.p.getByTestId('pa-reconf-desfazer-11111111-1111-1111-1111-111111111111').click();
  await n.p.getByTestId('pa-reconf-refazer-11111111-1111-1111-1111-111111111111').waitFor();
  assert.deepEqual(chamadas.filter((c) => c.u.endsWith('/desfazer')).at(-1).c, { senha: 'Minha-senha-nova' });
  await n.p.getByTestId('pa-reconf-senha').fill('Minha-senha-nova');
  await n.p.getByTestId('pa-reconf-refazer-11111111-1111-1111-1111-111111111111').click();
  await n.p.getByTestId('pa-reconf-desfazer-11111111-1111-1111-1111-111111111111').waitFor();
  await n.p.getByTestId('pa-reconf-senha').fill('Minha-senha-nova');
  await n.p.getByTestId('pa-reconf-confirmar').click();
  await n.p.getByTestId('pa-servicos').waitFor();
  assert.match(await n.p.getByTestId('pa').locator('h1').innerText(), /Reconfigurar Dalforno/);
  assert.equal(await n.p.getByTestId('pa-marcar-s-barba').isDisabled(), true); // já existe
  await n.p.getByTestId('pa-voltar').click();
  await n.p.getByTestId('painel-real').waitFor();
  await n.p.getByTestId('reconfigurar-abrir').click();
  await n.p.getByTestId('pa-reconf-senha').fill('Minha-senha-nova');
  await n.p.getByTestId('pa-reconf-confirmar').click();
  await n.p.getByTestId('pa-marcar-s-corte').waitFor();
  await n.p.getByTestId('pa-marcar-s-corte').check();
  await n.p.getByTestId('pa-continuar-servicos').click();
  await passarProdutosEComissao(n.p); await n.p.getByTestId('pa-equipe').waitFor();
  await n.p.getByTestId('pa-nome-0').fill('Zeca Novo');
  await n.p.getByTestId('pa-criar-acessos').click();
  await n.p.getByTestId('pa-acessos').waitFor();
  await n.p.getByTestId('pa-anotei').click();
  await n.p.getByTestId('pa-expediente').waitFor();
  await n.p.getByTestId('pa-continuar-expediente').click();
  await n.p.getByTestId('pa-pronto').waitFor();
  await n.p.getByTestId('pa-concluir').click();
  await n.p.getByTestId('painel-real').waitFor();
  assert.equal(chamadas.filter((c) => c.u === '/api/onboarding/concluir').length, antesConcluir, 'reconfigurar não chama concluir de novo');
  assert.deepEqual(chamadas.filter((c) => c.u === '/api/onboarding/servicos').at(-1).c.itens.map((i) => i.chave), ['s-corte']);
  assert.ok(banco.logins.has('zeca'));
  ok('B: reconfigurar pelo painel (só dono): serviço novo, pessoa nova, expediente; voltar ao painel');
  await n.ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e37 ok');
