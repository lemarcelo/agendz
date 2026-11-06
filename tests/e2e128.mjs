/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco C no SITE REAL contra um servidor falso: o card mostra apelido > nome > "Sem nome" (NUNCA o telefone) e os Detalhes têm "Editar cliente".
// (1) cliente criado só com telefone (semNome) aparece como "Sem nome" no card e nos Detalhes, em 1366 e 390 px (fonte larga), sem rolagem lateral.
// (2) Detalhes > Editar cliente (lápis): salva só o apelido (o corpo não leva o nome), o card muda na hora; Escape/Cancelar fecham só a janela de edição.
// (3) Atender: o campo é "Apelido" e lista os clientes parecidos ao digitar (sem campo de busca separado).
// E2E_CAPTURAS=pasta grava as imagens.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const pasta = process.env.E2E_CAPTURAS || '';
if (pasta) mkdirSync(pasta, { recursive: true });
const U = (s) => new Date(`${s}-03:00`).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ALAN = id(1), BRUNO = id(11), CAIO = id(12), SEMNOME = id(13), CORTE = id(50);
const TEL_SEM_NOME = '(11) 98888-0003';
let clientes, banco;
function reiniciar() {
  clientes = [
    { id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '11999990001', veiculos: [] },
    { id: CAIO, nome: 'Caio Souza', apelido: '', telefone: '11999990002', veiculos: [] },
    { id: SEMNOME, nome: TEL_SEM_NOME, apelido: '', telefone: '11988880003', semNome: true, veiculos: [] },
  ];
  banco = [];
  const ag = (n, inicio, min, cli) => banco.push({ id: id(100 + n), clienteId: cli, profissionalId: ALAN, inicio: U(inicio), fim: new Date(new Date(U(inicio)).getTime() + min * 60000).toISOString(), fimOcupado: new Date(new Date(U(inicio)).getTime() + (min + 10) * 60000).toISOString(), status: 'confirmado', encaixe: false, total: 45, servicos: [{ servicoId: CORTE, nome: 'Corte', preco: 45, duracaoMin: min }], conflitosPendentes: [], origem: 'painel', reagendado: false, statusManual: false, historico: [] });
  ag(1, '2026-10-28T09:00:00', 45, BRUNO);
  ag(2, '2026-10-28T11:00:00', 45, SEMNOME);
  ag(3, '2026-10-28T14:00:00', 45, CAIO);
}
reiniciar();
const chamadas = [];
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: corpo ? JSON.parse(corpo) : null });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/auth/login') return json(200, { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] });
    if (u.pathname === '/api/clientes' && req.method === 'GET') {
      const q = (u.searchParams.get('q') || '').toLowerCase();
      return json(200, clientes.filter((c) => !q || [c.nome, c.apelido, c.telefone].some((x) => String(x).toLowerCase().includes(q))));
    }
    const mc = /^\/api\/clientes\/([^/]+)$/.exec(u.pathname);
    if (mc && req.method === 'PUT') {
      const c = clientes.find((x) => x.id === mc[1]); const d = JSON.parse(corpo);
      if (!c) return json(404, { mensagem: 'Cliente não encontrado' });
      if (d.apelido === 'ERRO') return json(400, { mensagem: 'Texto inválido ou grande demais em apelido.' });
      if (typeof d.apelido === 'string') c.apelido = d.apelido;
      if (typeof d.nome === 'string' && d.nome !== c.nome) { c.nome = d.nome; delete c.semNome; }
      return json(200, c);
    }
    if (u.pathname === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true, podeVender: true }]);
    if (u.pathname === '/api/usuarios/me/menu') return json(200, { recolhido: false });
    if (u.pathname === '/api/agendamentos/existem-futuros') return json(200, { existem: true });
    if (u.pathname === '/api/agendamentos' && req.method === 'GET') {
      const de = Date.parse(u.searchParams.get('de')), ate = Date.parse(u.searchParams.get('ate'));
      return json(200, banco.filter((a) => Date.parse(a.inicio) < ate && Date.parse(a.fimOcupado) > de));
    }
    const m = /^\/api\/agendamentos\/([^/]+)$/.exec(u.pathname);
    if (m) { const a = banco.find((x) => x.id === m[1]); return a ? json(200, { ...a, historico: [] }) : json(404, { mensagem: 'Agendamento não encontrado.' }); }
    if (u.pathname === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [], ordemServicos: 'uso' });
    if (u.pathname === '/api/servicos') return json(200, [{ id: CORTE, codigo: '1', nome: 'Corte', duracaoMin: 45, preco: 45, ativo: true }]);
    if (u.pathname === '/api/ausencias' || u.pathname === '/api/avisos') return json(200, []);
    if (u.pathname === '/api/suporte/nao-lidas') return json(200, { total: 0 });
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
const FONTE_LARGA = '* { font-family: "DejaVu Sans", sans-serif !important; }';
async function abrir(viewport) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:00:00-03:00'));
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url);
  if (touch) await p.addStyleTag({ content: FONTE_LARGA });
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-agenda').waitFor({ state: 'attached' });
  if (!(await p.getByTestId('nav-agenda').isVisible())) await p.getByTestId('menu-alternar-real').click();
  await p.getByTestId('nav-agenda').click();
  await p.getByTestId('agenda-dia').waitFor();
  await p.locator('[data-testid="cartao"]').nth(1).waitFor();
  return { ctx, p };
}
const semRolagem = async (p, onde) => {
  const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth }));
  assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`);
};
const dentro = async (p, t, onde) => {
  const caixa = await p.getByTestId(t).boundingBox(); const vp = p.viewportSize();
  assert.ok(caixa && caixa.x >= 0 && caixa.x + caixa.width <= vp.width + 1, `${onde}: ${t} fora da tela (${JSON.stringify(caixa)})`);
  return caixa;
};

try {
  for (const vp of [{ width: 1366, height: 860 }, { width: 390, height: 800 }]) {
    reiniciar(); chamadas.length = 0;
    const { ctx, p } = await abrir(vp);
    const onde = `${vp.width}px`;
    // (1) card sem nome
    const cartoes = p.locator('[data-testid="cartao"]');
    assert.match(await cartoes.nth(0).innerText(), /Bruno/, 'apelido');
    const sem = await cartoes.nth(1).innerText();
    assert.match(sem, /Sem nome/, `${onde}: cliente só com telefone aparece como "Sem nome"`);
    assert.ok(!/9888|\(11\)/.test(sem), `${onde}: o card nunca mostra o telefone: ${sem}`);
    assert.match(await cartoes.nth(2).innerText(), /Caio Souza/, 'sem apelido: o nome');
    await semRolagem(p, `${onde} agenda`);
    if (pasta) await p.screenshot({ path: `${pasta}/c-agenda-${vp.width}.png`, fullPage: false });
    // (2) Detalhes > Editar cliente
    await cartoes.nth(1).locator('button.cartao, .cartao').first().click().catch(async () => { await cartoes.nth(1).click(); });
    await p.getByTestId('detalhe-modal').waitFor();
    assert.match(await p.locator('.detalhe-cliente-real').innerText(), /Sem nome/);
    assert.ok(!/9888/.test(await p.getByTestId('detalhe-modal').innerText()), `${onde}: os Detalhes não mostram o telefone como nome`);
    const lapis = await dentro(p, 'cliente-editar', `${onde} detalhes`);
    const nomeCx = await p.locator('.detalhe-cliente-real').boundingBox();
    assert.ok(lapis.x >= nomeCx.x + nomeCx.width - 1, `${onde}: o lápis fica à direita do nome e não sobrepõe`);
    if (pasta) await p.screenshot({ path: `${pasta}/c-detalhe-${vp.width}.png` });
    await p.getByTestId('cliente-editar').click();
    await p.getByTestId('editar-cliente-modal').waitFor();
    assert.equal(await p.getByTestId('editar-cliente-apelido').inputValue(), '');
    assert.equal(await p.getByTestId('editar-cliente-nome').inputValue(), '', 'cadastro sem nome: o campo vem vazio, nunca com o telefone');
    assert.equal(await p.getByTestId('editar-cliente-salvar').isDisabled(), true, 'sem mudança não salva');
    await semRolagem(p, `${onde} editar`);
    if (pasta) await p.screenshot({ path: `${pasta}/c-editar-${vp.width}.png` });
    // Escape fecha só a edição; os Detalhes continuam
    await p.keyboard.press('Escape');
    assert.equal(await p.getByTestId('editar-cliente-modal').count(), 0, 'Escape fecha a edição');
    assert.equal(await p.getByTestId('detalhe-modal').count(), 1, 'e os Detalhes continuam abertos');
    await p.getByTestId('cliente-editar').click();
    await p.getByTestId('editar-cliente-cancelar').click();
    assert.equal(await p.getByTestId('editar-cliente-modal').count(), 0);
    assert.equal(chamadas.filter((c) => c.m === 'PUT').length, 0, 'cancelar não grava nada');
    // erro do servidor aparece na janela e não fecha
    await p.getByTestId('cliente-editar').click();
    await p.getByTestId('editar-cliente-apelido').fill('ERRO'); await p.getByTestId('editar-cliente-salvar').click();
    assert.match(await p.getByTestId('editar-cliente-erro').innerText(), /apelido/);
    assert.equal(await p.getByTestId('editar-cliente-modal').count(), 1);
    // salva só o apelido
    await p.getByTestId('editar-cliente-apelido').fill('Zé da Loja'); await p.getByTestId('editar-cliente-salvar').click();
    await p.getByTestId('editar-cliente-modal').waitFor({ state: 'detached' });
    const put = chamadas.filter((c) => c.m === 'PUT' && c.u === `/api/clientes/${SEMNOME}`).at(-1);
    assert.deepEqual(put.corpo, { apelido: 'Zé da Loja' }, 'o corpo leva só o que mudou (o nome do cadastro não é reescrito)');
    await p.locator('.detalhe-cliente-real', { hasText: 'Zé da Loja' }).waitFor();
    assert.match(await cartoes.nth(1).innerText(), /Zé da Loja/, `${onde}: o card passa a mostrar o apelido`);
    assert.equal(clientes.find((c) => c.id === SEMNOME).semNome, true, 'mexer só no apelido não vira "nome de verdade"');
    // fecha os Detalhes e o fundo não intercepta cliques
    await p.keyboard.press('Escape');
    assert.equal(await p.getByTestId('detalhe-modal').count(), 0);
    await cartoes.nth(0).click(); await p.getByTestId('detalhe-modal').waitFor();
    assert.equal(await p.getByTestId('cliente-editar').count(), 1);
    await p.getByTestId('detalhe-fechar').click();
    ok(`${onde}: card "Sem nome" (nunca o telefone), lápis nos Detalhes, edição grava só o apelido, Escape/Cancelar fecham só a edição`);

    // nome de verdade: sai a marca "só telefone"
    await cartoes.nth(1).click(); await p.getByTestId('detalhe-modal').waitFor();
    await p.getByTestId('cliente-editar').click();
    await p.getByTestId('editar-cliente-nome').fill('Zeca Ribeiro'); await p.getByTestId('editar-cliente-salvar').click();
    await p.getByTestId('editar-cliente-modal').waitFor({ state: 'detached' });
    assert.deepEqual(chamadas.filter((c) => c.m === 'PUT').at(-1).corpo, { nome: 'Zeca Ribeiro' });
    assert.equal(clientes.find((c) => c.id === SEMNOME).semNome, undefined);
    await p.getByTestId('detalhe-fechar').click();
    ok(`${onde}: informar o nome do cadastro grava só o nome`);

    // (3) Atender: campo Apelido com lista ao digitar
    await p.getByTestId('atender-abrir').click();
    await p.getByTestId('atender-srv-' + CORTE).check();
    await p.getByTestId('atender-prox-quando').click(); await p.getByTestId('atender-prox-cliente').click();
    assert.equal(await p.getByTestId('atender-busca').count(), 0, 'sem campo de busca separado');
    assert.match(await p.locator('label.campo', { has: p.getByTestId('atender-nome') }).innerText(), /Apelido/);
    await p.getByTestId('atender-nome').fill('bru');
    await p.getByTestId('atender-achados').waitFor();
    assert.match(await p.getByTestId('atender-achados').innerText(), /Bruno/);
    await semRolagem(p, `${onde} atender`);
    if (pasta) await p.screenshot({ path: `${pasta}/c-atender-${vp.width}.png` });
    await p.getByTestId(`atender-cli-${BRUNO}`).click();
    assert.match(await p.getByTestId('atender-vinculo').innerText(), /Bruno/);
    assert.equal(await p.getByTestId('atender-nome').inputValue(), 'Bruno');
    ok(`${onde}: Atender pede só o Apelido e lista os clientes ao digitar`);
    await ctx.close();
  }
} finally {
  await b.close(); servidor.close();
}
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e128 ok');
