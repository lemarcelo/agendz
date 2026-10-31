/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Suporte (chamados) no site real: a loja e o usuário nunca vão no corpo, abrir chamado e conversar, selo de não lidas no menu (consulta de fundo), erro do
// servidor (429) aparece na tela, chamado fechado não recebe resposta, dono vê quem abriu, 390 px sem rolagem lateral. Servidor falso.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EU = id(1), CH = id(201);
const chamadas = [];
let papel = 'profissional';
let secoes = ['suporte']; // v119: o profissional só vê o Suporte se o dono liberou a seção
let naoLidas = 2;
let status429 = false;
let chamado = null; // vira objeto depois de abrir
const msg = (n, tipo, nome, texto) => ({ id: n, autorTipo: tipo, autorNome: nome, texto, criadoEm: '2026-10-29T13:00:00Z' });
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, corpo: corpo ? JSON.parse(corpo) : null });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: EU, nome: 'Alan', papel, deveTrocarSenha: false, onboardingPendente: false, secoes });
    if (u.pathname === '/api/usuarios/me') return json(200, { id: EU, nome: 'Alan Dalforno', apelido: 'Alan', usuario: 'alan', papel, email: '', telefone: '', nascimento: '', foto: null });
    if (u.pathname === '/api/suporte/chamados/nao-lidas') return json(200, { naoLidas });
    if (u.pathname === '/api/suporte/chamados' && req.method === 'GET') {
      return json(200, chamado ? [{ id: CH, usuarioNome: 'Bruno (profissional)', assunto: chamado.assunto, categoria: chamado.categoria, status: chamado.status, criadoEm: '2026-10-29T13:00:00Z', atualizadoEm: '2026-10-29T13:05:00Z', naoLidas: 0 }] : []);
    }
    if (u.pathname === '/api/suporte/chamados' && req.method === 'POST') {
      if (status429) return json(429, { mensagem: 'Você abriu muitos chamados em pouco tempo. Aguarde um pouco.' });
      const c = JSON.parse(corpo);
      chamado = { assunto: c.assunto, categoria: c.categoria, status: 'aberto', msgs: [msg(1, 'cliente', 'Alan', c.texto)] };
      return json(201, { id: CH, usuarioNome: 'Alan', assunto: c.assunto, categoria: c.categoria, status: 'aberto', criadoEm: '2026-10-29T13:00:00Z', atualizadoEm: '2026-10-29T13:00:00Z', naoLidas: 0, msgs: chamado.msgs });
    }
    if (u.pathname === `/api/suporte/chamados/${CH}` && req.method === 'GET') {
      naoLidas = 0;
      return json(200, { id: CH, usuarioNome: 'Alan', assunto: chamado.assunto, categoria: chamado.categoria, status: chamado.status, criadoEm: '2026-10-29T13:00:00Z', atualizadoEm: '2026-10-29T13:05:00Z', naoLidas: 0, msgs: chamado.msgs });
    }
    if (u.pathname === `/api/suporte/chamados/${CH}/mensagens` && req.method === 'POST') {
      if (chamado.status === 'fechado') return json(409, { mensagem: 'Este chamado foi fechado. Abra um novo chamado.' });
      chamado.msgs.push(msg(chamado.msgs.length + 1, 'cliente', 'Alan', JSON.parse(corpo).texto));
      return json(201, { id: CH, usuarioNome: 'Alan', assunto: chamado.assunto, categoria: chamado.categoria, status: 'em_atendimento', criadoEm: '2026-10-29T13:00:00Z', atualizadoEm: '2026-10-29T13:06:00Z', naoLidas: 0, msgs: chamado.msgs });
    }
    return json(404, { mensagem: 'Não encontrado' });
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
async function abrir(viewport, { semSuporte = false } = {}) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  if (semSuporte) await p.getByTestId('nav-servicos').waitFor(); else await p.getByTestId('nav-suporte').waitFor();
  return { ctx, p };
}
const semRolagem = async (p, onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };

for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 780 }]) {
  chamado = null; naoLidas = 2; status429 = false; papel = 'profissional'; chamadas.length = 0;
  const { ctx, p } = await abrir(vp);
  const T = (i) => p.getByTestId(i);
  await T('badge-suporte').waitFor();
  assert.equal(await T('badge-suporte').innerText(), '2', 'o selo mostra as respostas novas');
  await T('nav-suporte').click();
  await T('sup-vazio').waitFor();
  // 429 do servidor aparece na tela e não cria nada
  status429 = true;
  await T('sup-novo').click();
  await T('sup-assunto').fill('Agenda travou');
  await T('sup-texto').fill('Não carrega o calendário');
  await T('sup-abrir').click();
  assert.match(await T('sup-erro').innerText(), /muitos chamados/);
  status429 = false;
  await T('sup-abrir').click();
  await T('sup-conversa').waitFor();
  const post = chamadas.filter((c) => c.m === 'POST' && c.u === '/api/suporte/chamados').at(-1);
  assert.deepEqual(post.corpo, { assunto: 'Agenda travou', categoria: 'duvida', texto: 'Não carrega o calendário' }, 'só assunto, tipo e texto: loja e usuário vêm do servidor');
  assert.equal(await T('sup-msg').count(), 1);
  await T('sup-resposta').fill('Mais um detalhe');
  await T('sup-enviar').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=sup-msg]').length === 2);
  assert.match(await T('sup-status').innerText(), /Em atendimento/);
  await semRolagem(p, 'conversa');
  await T('sup-voltar').click();
  await T('sup-item').waitFor();
  assert.equal(await T('badge-suporte').count(), 0, 'abrir a conversa zerou o selo');
  await semRolagem(p, 'lista');
  ok(`${vp.width}px: abrir chamado, erro 429 na tela, conversar e selo zerado`);

  // chamado fechado: responder mostra o motivo do servidor
  chamado.status = 'fechado';
  await T('sup-item').click();
  await T('sup-conversa').waitFor();
  assert.match(await T('sup-status').innerText(), /Fechado/);
  assert.equal(await T('sup-resposta').count(), 0, 'fechado não tem campo de resposta');
  ok(`${vp.width}px: chamado fechado não recebe resposta`);
  await ctx.close();
}

// dono: a lista mostra quem abriu
papel = 'dono'; chamado = { assunto: 'Cobrança errada', categoria: 'cobranca', status: 'aberto', msgs: [msg(1, 'cliente', 'Bruno', 'Veio valor errado')] };
{
  const { ctx, p } = await abrir({ width: 1280, height: 860 });
  await p.getByTestId('nav-suporte').click();
  await p.getByTestId('sup-item').waitFor();
  assert.match(await p.getByTestId('sup-item').innerText(), /Bruno/, 'o dono vê quem abriu');
  assert.match(await p.getByTestId('suporte').innerText(), /toda a loja/);
  ok('o proprietário vê os chamados da loja com o nome de quem abriu');
  await ctx.close();
}
// v119: de fábrica só o proprietário abre chamado: profissional sem a seção não vê o menu e o site nem consulta o Suporte
{
  secoes = []; papel = 'profissional'; chamadas.length = 0;
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, { semSuporte: true });
  await p.waitForTimeout(500);
  assert.equal(await p.getByTestId('nav-suporte').count(), 0, 'sem a seção: sem menu');
  assert.equal(chamadas.filter((c) => c.u.includes('/api/suporte')).length, 0, 'sem a seção: nenhuma consulta ao Suporte');
  ok('profissional sem a seção Suporte: sem menu e sem consulta');
  await ctx.close();
  secoes = ['suporte'];
}
await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e66 ok');
