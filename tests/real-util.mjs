/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Peças comuns dos testes do site real (dist/index-real.html) contra um servidor falso: servidor que serve a página, responde a loja e o login e registra as
// chamadas; falha injetada (uma vez) por rota; navegador com relógio fixo, fuso de Brasília e login feito. Não é um teste (o run-e2e só pega e2e<N>.mjs).
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync } from 'node:fs';

export const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
export const ok = (m) => console.log('✓', m);
export const U = (s) => new Date(`${s}-03:00`).toISOString();
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// `trata(chamada, { json })` devolve true quando respondeu. Login, loja, 404 padrão e as falhas injetadas ficam aqui.
// estado.loja / estado.sessao podem ser trocados pelo teste; estado.falhar = { rota: RegExp, metodo?, status } (status 'rede' derruba a conexão) vale uma vez.
export async function subirServidor(trata, estado = {}) {
  estado.loja ||= { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };
  estado.sessao ||= { token: 'tok', id: id(1), nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes', 'planos'] };
  const chamadas = [];
  const servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); return true; };
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
      const c = { m: req.method, u: u.pathname, q: u.search, corpo: corpo ? JSON.parse(corpo) : null };
      chamadas.push(c);
      const f = estado.falhar;
      if (f && f.rota.test(u.pathname) && (!f.metodo || f.metodo === req.method)) {
        if (f.vezes > 1) f.vezes -= 1; else estado.falhar = null; // 'rede' pede vezes: 2 (o Chromium repete sozinho uma requisição idempotente cuja conexão caiu)
        if (f.status === 'rede') return req.socket.destroy();
        return json(f.status, { mensagem: f.mensagem || `Erro ${f.status} do servidor.` });
      }
      if (u.pathname === '/api/publico/loja') return json(200, estado.loja);
      if (u.pathname === '/api/auth/login') return json(200, estado.sessao);
      if (!trata(c, { json, estado })) json(404, {});
    });
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${servidor.address().port}/`;
  const ultimo = (m, rota) => chamadas.filter((c) => c.m === m && c.u.endsWith(rota)).at(-1);
  const quantas = (m, rota) => chamadas.filter((c) => c.m === m && c.u.endsWith(rota)).length;
  return { url, chamadas, estado, ultimo, quantas, fechar: () => servidor.close() };
}

export async function abrirNavegador() {
  const b = await chromium.launch();
  const erros = [];
  const pedidosWa = [];
  // Abre a página, entra como `alan` e (se `aba`) vai para o menu. Relógio fixo em 28/10/2026 10:00 (Brasília).
  const abrir = async (url, { viewport = { width: 1280, height: 860 }, aba = 'agenda', fonteLarga = false } = {}) => {
    const touch = viewport.width < 700;
    const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
    await ctx.route(/^https:\/\/(wa\.me|web\.whatsapp\.com)\//, (r) => { pedidosWa.push(r.request().url()); return r.fulfill({ contentType: 'text/html', body: '<title>wa</title>' }); });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(url);
    await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
    if (fonteLarga) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
    if (aba) await p.getByTestId(`nav-${aba}`).click();
    return { ctx, p };
  };
  const semRolagem = async (p, nome) => { if (!(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) throw new Error(`${nome}: rolagem horizontal`); };
  return { b, erros, pedidosWa, abrir, semRolagem };
}
