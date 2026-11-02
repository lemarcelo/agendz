/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B1 (Modo homologação por cliente) no site real (dist/index-real.html) contra um servidor falso:
//  (a) loja com emHomologacao: true: a faixa fixa 'Modo de homologação ativo' aparece no login, no #agendar e na área logada;
//  (b) loja com emHomologacao: false: a faixa não aparece;
//  (c) 390 px com fonte larga (sem rolagem lateral) e desktop × claro/escuro.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const ALAN = id(1);
const LOJA_HOMOLOG = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null, captchaChave: '', emHomologacao: true };
const LOJA_NORMAL = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null, captchaChave: '', emHomologacao: false };
const SESSAO = { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda'] };

async function novaPagina(nav, vp, modo) {
  const touch = vp.width < 700;
  const ctx = await nav.b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => nav.erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { nav.erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  return { ctx, p, aplicarTema: async () => {
    if (vp.width < 700) await p.addStyleTag({ content: '*{font-family:"DejaVu Sans" !important}' });
    await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  } };
}

async function cenarioComHomologacao(vp, modo) {
  const rotulo = `com-homolog/${vp.width}/${modo}`;
  const srv = await subirServidor((c, { json }) => {
    if (c.u === '/api/agendamentos') return json(200, []);
    if (c.u === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true, podeVender: true }]);
    if (c.u === '/api/servicos') return json(200, [{ id: id(2), nome: 'Corte', preco: 40, duracaoMin: 30, intervaloMin: 0, ativo: true }]);
    if (c.u === '/api/estabelecimento/regras-atendimento') return json(200, {});
    if (c.u === '/api/estabelecimento/escala') return json(200, { semana: {} });
    if (c.u === '/api/meu-perfil') return json(200, { id: ALAN, nome: 'Alan' });
    if (c.u === '/api/suporte/nao-lidas') return json(200, { naoLidas: 0 });
    return false;
  }, { loja: LOJA_HOMOLOG, sessao: null });

  const nav = await abrirNavegador();
  const { p, aplicarTema, ctx } = await novaPagina(nav, vp, modo);

  try {
    // 1. Tela de Login com modo homologação
    await p.goto(srv.url);
    await aplicarTema();
    const faixaLogin = p.getByTestId('faixa-homologacao');
    await assert.rejects(faixaLogin.waitFor({ state: 'attached', timeout: 500 }).then(() => Promise.reject(new Error('esperado'))), /esperado/, `${rotulo}: faixa deve aparecer no login`);
    const txt = await faixaLogin.textContent();
    assert.match(txt, /Modo de homologação ativo/, `${rotulo}: texto da faixa no login`);
    await nav.semRolagem(p, rotulo + '-login');

    // 2. Tela pública #agendar com modo homologação
    await p.goto(srv.url + '#agendar');
    await aplicarTema();
    const faixaPublica = p.getByTestId('faixa-homologacao');
    await assert.rejects(faixaPublica.waitFor({ state: 'attached', timeout: 500 }).then(() => Promise.reject(new Error('esperado'))), /esperado/, `${rotulo}: faixa deve aparecer no #agendar`);
    await nav.semRolagem(p, rotulo + '-agendar');
  } finally {
    await ctx.close();
    await srv.fechar();
  }
}

async function cenarioSemHomologacao(vp, modo) {
  const rotulo = `sem-homolog/${vp.width}/${modo}`;
  const srv = await subirServidor((c, { json }) => {
    return false;
  }, { loja: LOJA_NORMAL, sessao: null });

  const nav = await abrirNavegador();
  const { p, aplicarTema, ctx } = await novaPagina(nav, vp, modo);

  try {
    await p.goto(srv.url);
    await aplicarTema();
    const count = await p.getByTestId('faixa-homologacao').count();
    assert.equal(count, 0, `${rotulo}: faixa NÃO deve aparecer com modo desativado`);
  } finally {
    await ctx.close();
    await srv.fechar();
  }
}

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

let falhas = 0;
for (const vp of VIEWPORTS) {
  for (const modo of ['claro', 'escuro']) {
    try {
      await cenarioComHomologacao(vp, modo);
      ok(`cenarioComHomologacao (${vp.width}px ${modo})`);
    } catch (e) {
      falhas++;
      console.error(`FALHA em cenarioComHomologacao (${vp.width}px ${modo}):`, e.message);
    }

    try {
      await cenarioSemHomologacao(vp, modo);
      ok(`cenarioSemHomologacao (${vp.width}px ${modo})`);
    } catch (e) {
      falhas++;
      console.error(`FALHA em cenarioSemHomologacao (${vp.width}px ${modo}):`, e.message);
    }
  }
}

const nav = await abrirNavegador();
await nav.b.close();
if (nav.erros.length) {
  console.error('Erros de navegador:', nav.erros);
  falhas++;
}
if (falhas) process.exit(1);
console.log('Todos os cenários de e2e118 passaram com sucesso.');
