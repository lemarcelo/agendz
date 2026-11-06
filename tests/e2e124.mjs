/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Bloco A no SITE REAL (dist/index-real.html) contra um servidor falso: serviços por funcionário (Serviços > Editar e Equipe > Editar gravam o mesmo vínculo),
// horário de funcionamento por pessoa (Equipe > Editar) e ausência (Agenda > Calendário > Ausência: horários por clique, dia inteiro, conflito do servidor, lista ao lado dos cancelados).
// 1366 e 390 px (fonte larga): sem rolagem lateral, sem sobreposição, janela fecha com botão e Escape. Com E2E_CAPTURAS=pasta grava as imagens (claro e escuro).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const pasta = process.env.E2E_CAPTURAS || '';
if (pasta) mkdirSync(pasta, { recursive: true });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DONO = id(1), KIKO = id(2), BRUNO = id(3), CORTE = id(50), BARBA = id(51), SOBR = id(52), CANC = id(99);
const HOJE = new Date('2026-11-09T07:00:00-03:00'); // segunda-feira

const usuario = (i, nome, papel) => ({ id: i, nome, apelido: nome.split(' ')[0], usuario: nome.split(' ')[0].toLowerCase(), papel, atende: true, podeVender: true, permissoes: {}, email: '', telefone: '' });
const usuarios = [usuario(DONO, 'Alan Dalforno', 'dono'), usuario(KIKO, 'Kiko Gindri', 'profissional'), usuario(BRUNO, 'Bruno Souza', 'profissional')];
const servicos = [
  { id: CORTE, codigo: '1', nome: 'Corte', preco: 50, duracaoMin: 40, ativo: true }, { id: BARBA, codigo: '2', nome: 'Barba', preco: 35, duracaoMin: 30, ativo: true },
  { id: SOBR, codigo: '3', nome: 'Sobrancelha', preco: 20, duracaoMin: 15, ativo: true },
];
const vinculos = { [CORTE]: [DONO, KIKO, BRUNO], [BARBA]: [DONO, KIKO], [SOBR]: [BRUNO] };
const lojaSemana = Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => [d, { aberto: true, faixas: [['09:00', '12:00'], ['14:00', '19:00']] }]));
let escalaKiko = { semana: {} };
const chamadas = [];
let conflito = false;
let ausencias = [];

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    const dados = corpo ? JSON.parse(corpo) : null;
    const p = u.pathname;
    if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    if (req.method !== 'GET') chamadas.push({ m: req.method, p, dados });
    if (p === '/api/publico/loja') return json(200, { slug: 'teste', nome: 'Barbearia Dalforno', tipo: 'barbearia' });
    if (p === '/api/auth/login') return json(200, { token: 'tok', id: DONO, nome: 'Alan Dalforno', papel: 'dono', secoes: ['agenda'] });
    if (p === '/api/profissionais') return json(200, usuarios.map((x) => ({ id: x.id, nome: x.nome, papel: x.papel, atende: true, podeVender: true })));
    if (p === '/api/usuarios') return json(200, usuarios);
    if (p === `/api/usuarios/${KIKO}`) return json(200, { ...usuarios[1], cpf: '', nascimento: '' });
    if (p === `/api/usuarios/${KIKO}/servicos`) {
      if (req.method === 'PUT') { for (const s of Object.keys(vinculos)) vinculos[s] = vinculos[s].filter((x) => x !== KIKO).concat(dados.ids.includes(s) ? [KIKO] : []); return json(200, { ids: dados.ids }); }
      return json(200, { ids: Object.keys(vinculos).filter((s) => vinculos[s].includes(KIKO)) });
    }
    if (p === '/api/servicos/profissionais') return json(200, vinculos);
    if (p.startsWith('/api/servicos/') && p.endsWith('/profissionais') && req.method === 'PUT') { vinculos[p.split('/')[3]] = dados.ids; return json(200, { ids: dados.ids }); }
    if (p === '/api/servicos' && req.method === 'GET') return json(200, servicos);
    if (p === `/api/servicos/${CORTE}` && req.method === 'PUT') return json(200, servicos[0]);
    if (p === '/api/estabelecimento/escala') return json(200, { semana: lojaSemana });
    if (p === `/api/profissionais/${KIKO}/escala`) { if (req.method === 'PUT') escalaKiko = dados.semana && Object.keys(dados.semana).length ? { semana: dados.semana } : { semana: {} }; return json(200, escalaKiko); }
    if (p.startsWith('/api/profissionais/') && p.endsWith('/escala')) return json(200, { semana: {} });
    if (p === '/api/ausencias' && req.method === 'POST') {
      if (conflito) return json(409, { mensagem: 'Há 2 agendamentos nesse período: 09/11 10:00 (Carlos), 09/11 10:30 (Marcos). Remarque ou cancele antes de lançar a ausência.' });
      const novas = dados.intervalos.map((v, i) => ({ id: id(700 + ausencias.length + i), profissionalId: dados.profissionalId, ini: v.dia ? new Date(`${v.dia}T00:00:00-03:00`).toISOString() : v.ini, fim: v.dia ? new Date(`${v.dia}T23:59:59-03:00`).toISOString() : v.fim, diaInteiro: !!v.dia }));
      ausencias.push(...novas);
      return json(201, novas);
    }
    if (p === '/api/ausencias') return json(200, ausencias);
    if (p === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
    if (p === '/api/agendamentos') {
      return json(200, [{ id: CANC, nomeAvulso: 'Carlos Cancelado', profissionalId: KIKO, inicio: new Date('2026-11-09T09:00:00-03:00').toISOString(), fim: new Date('2026-11-09T09:40:00-03:00').toISOString(), fimOcupado: new Date('2026-11-09T09:40:00-03:00').toISOString(),
        servicos: [{ servicoId: CORTE, nome: 'Corte', preco: 50, duracaoMin: 40, desconto: 0 }], total: 50, status: 'cancelado', motivoCancelamento: 'cliente' }]);
    }
    if (p === '/api/estabelecimento/comissao') return json(200, { comissaoPadrao: 50 });
    if (p === '/api/estabelecimento/regras-atendimento') return json(200, { formaPagamentoPadrao: 'pix', futuro: [], local: [], ordemServicos: 'uso' });
    if (p === '/api/estabelecimento/link-agendamento') return json(200, { ativo: true, diasMax: 30, limiteAbertos: 3, intervaloMin: 0, telefoneObrigatorio: true, nomeObrigatorio: true, veiculoObrigatorio: [], pendencias: [] });
    if (p === '/api/estabelecimento/local') return json(200, {});
    if (p === '/api/onboarding') return json(200, { tipo: 'barbearia', passo: 'servicos', concluido: true, servicos: [], jaCadastrados: [], expedienteSugerido: {} });
    if (p === '/api/onboarding/reconfiguracoes') return json(200, { itens: [] });
    if (p === '/api/suporte/chamados') return json(200, []);
    if (p === '/api/suporte/nao-lidas') return json(200, { total: 0 });
    if (p === '/api/usuarios/me/menu') return json(200, { recolhido: false });
    if (p === '/api/usuarios/me') return json(200, { id: DONO, nome: 'Alan Dalforno', papel: 'dono' });
    if (p === '/api/clientes') return json(200, []);
    if (p === '/api/portes') return json(200, { portes: [] });
    json(404, {});
  });
});

const FONTE_LARGA = '* { font-family: "DejaVu Sans", sans-serif !important; }';
const sobrepoe = (x, y) => x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
const erros = [];

await new Promise((r) => servidor.listen(0, r));
const porta = servidor.address().port;
const b = await chromium.launch();
try {
  for (const vp of [{ nome: '1366', width: 1366, height: 800 }, { nome: '390', width: 390, height: 780 }]) {
    chamadas.length = 0; ausencias = []; conflito = false; escalaKiko = { semana: {} };
    Object.assign(vinculos, { [CORTE]: [DONO, KIKO, BRUNO], [BARBA]: [DONO, KIKO], [SOBR]: [BRUNO] }); // estado inicial a cada tamanho de tela
    const touch = vp.width < 700;
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await ctx.clock.setFixedTime(HOJE);
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
    p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
    await p.goto(`http://127.0.0.1:${porta}`);
    if (touch) await p.addStyleTag({ content: FONTE_LARGA });
    const T = (t) => p.getByTestId(t);
    await p.fill('[data-testid="login-id"]', 'alan'); await p.fill('[data-testid="login-senha"]', '12345678'); await p.click('[data-testid="login-entrar"]');
    await T('agenda-real').waitFor();
    const semLateral = async (onde) => { const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]); assert.ok(w[0] <= w[1], `${onde}: sem rolagem lateral (${w[0]} <= ${w[1]})`); };
    const nav = async (k) => { const alvo = T(`nav-${k}`); const menu = T('menu-alternar-real'); if (!(await alvo.isVisible()) && await menu.count()) await menu.click(); await alvo.click(); };

    // ---------- A3: Ausência na Agenda
    assert.equal(await T('ausencia-abrir').count(), 0, 'o botão Ausência só aparece na aba Calendário');
    await T('aba-calendario').click();
    await T('ausencia-abrir').waitFor();
    const abas = await T('aba-calendario').boundingBox(); const botao = await T('ausencia-abrir').boundingBox();
    assert.ok(botao.x > abas.x + abas.width && Math.abs((botao.y + botao.height / 2) - (abas.y + abas.height / 2)) < 30, 'o botão Ausência fica ao lado de Horários | Calendário');
    assert.ok(botao.width >= 60 && botao.height >= 28, 'parece um botão, não uma aba');
    if (pasta) await p.screenshot({ path: `${pasta}/real-calendario-botao-ausencia-${vp.nome}.png` });
    await T('ausencia-abrir').click();
    await T('aus-grade').waitFor();
    await T('aus-profissional').selectOption({ label: 'Kiko Gindri' });
    await T('aus-grade').waitFor();
    await T('aus-hora-1000').click(); await T('aus-hora-1030').click(); await T('aus-hora-1500').click();
    assert.match(await T('aus-resumo').innerText(), /3 horário/);
    await T('aus-hora-x-1500').click();
    assert.match(await T('aus-resumo').innerText(), /2 horário/);
    const dias = await T('aus-dias').locator('[data-testid^="aus-dia-20"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    const cx = await T(dias[2]).boundingBox();
    await p.mouse.move(cx.x + cx.width / 2, cx.y + cx.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
    await T('aus-dia-x-' + dias[2].replace('aus-dia-', '')).waitFor();
    await T(dias[3]).click();
    await T('aus-dia-x-' + dias[3].replace('aus-dia-', '')).waitFor();
    assert.match(await T('aus-resumo').innerText(), /2 dia\(s\) inteiro\(s\)/);
    await semLateral('janela de ausência');
    const cancelar = await T('aus-cancelar').boundingBox(); const salvar = await T('aus-salvar').boundingBox();
    assert.ok(!sobrepoe(cancelar, salvar), 'rodapé sem sobreposição');
    const jan = await p.evaluate(() => { const e = document.querySelector('[data-testid=aus-janela]'); return [e.scrollWidth, e.clientWidth]; });
    assert.ok(jan[0] <= jan[1] + 1, 'sem rolagem lateral dentro da janela');
    assert.equal(await p.evaluate(() => window.scrollY), 0, 'fundo travado');
    if (pasta) { await p.screenshot({ path: `${pasta}/real-ausencia-${vp.nome}-escuro.png` }); await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light')); await p.screenshot({ path: `${pasta}/real-ausencia-${vp.nome}-claro.png` }); await p.evaluate(() => document.documentElement.removeAttribute('data-theme')); }
    // servidor recusa por conflito: a mensagem inteira aparece e nada é fechado
    conflito = true;
    await T('aus-salvar').click();
    await T('aus-erro').waitFor();
    assert.match(await T('aus-erro').innerText(), /Há 2 agendamentos nesse período/);
    assert.ok(await T('ausencia-modal').isVisible(), 'a janela continua aberta para ajustar');
    if (pasta) await p.screenshot({ path: `${pasta}/real-ausencia-conflito-${vp.nome}.png` });
    conflito = false;
    await T('aus-salvar').click();
    await T('ausencia-modal').waitFor({ state: 'detached' });
    const post = chamadas.find((c) => c.m === 'POST' && c.p === '/api/ausencias');
    assert.equal(post.dados.profissionalId, KIKO);
    assert.ok(post.dados.intervalos.some((v) => v.dia), 'o dia inteiro vai como { dia }');
    const horarios = post.dados.intervalos.filter((v) => v.ini);
    assert.equal(horarios.length, 1, 'horários que se encostam viram um intervalo só');
    assert.equal(new Date(horarios[0].fim) - new Date(horarios[0].ini), 60 * 60000, '10:00 e 10:30 = 1 hora');
    ok(`${vp.nome}px: ausência (horários, dia inteiro, conflito do servidor) no site real`);

    // fecha com Escape / botão sem deixar o fundo preso
    await T('ausencia-abrir').click(); await T('aus-grade').waitFor();
    await p.keyboard.press('Escape'); await T('ausencia-modal').waitFor({ state: 'detached' });
    await T('ausencia-abrir').click(); await T('aus-fechar').click(); await T('ausencia-modal').waitFor({ state: 'detached' });
    assert.equal(await p.locator('.atender-fundo-real').count(), 0);
    ok(`${vp.nome}px: Escape e botão fecham a janela de ausência`);

    // lista ao lado dos cancelados, no dia da ausência de horário (Kiko, 10:00)
    ausencias.push({ id: id(790), profissionalId: KIKO, ini: new Date('2026-11-09T10:00:00-03:00').toISOString(), fim: new Date('2026-11-09T11:00:00-03:00').toISOString(), diaInteiro: false });
    await T('aba-horarios').click();
    await p.getByRole('button', { name: 'Hoje', exact: true }).click();
    await T('agenda-extras').waitFor();
    const cB = await T('cancelados-dia').boundingBox(); const aB = await T('ausencias-dia').boundingBox();
    assert.ok(!sobrepoe(cB, aB), 'cancelados e ausências não se sobrepõem');
    if (vp.width >= 700) assert.ok(Math.abs(cB.y - aB.y) < 4 && aB.x > cB.x, 'lado a lado no computador');
    await T('ausencias-resumo').click();
    assert.match(await T('ausencias-lista').innerText(), /Kiko.*10:00–11:00/);
    await semLateral('agenda com ausências');
    if (pasta) await p.screenshot({ path: `${pasta}/real-agenda-ausencias-${vp.nome}.png` });
    ok(`${vp.nome}px: ausências aparecem ao lado dos cancelados`);

    // ---------- A1/A2: Equipe > Editar
    await nav('equipe'); await T(`editar-${KIKO}`).or(p.getByRole('button', { name: /Editar Kiko/ })).first().click();
    await T('eq-servicos').waitFor();
    assert.ok(await T(`eq-servicos-${CORTE}`).isChecked() && await T(`eq-servicos-${BARBA}`).isChecked() && !(await T(`eq-servicos-${SOBR}`).isChecked()), 'mostra os serviços que ele realiza');
    await T(`eq-servicos-${BARBA}`).uncheck(); await T(`eq-servicos-${SOBR}`).check();
    await T('eq-expediente').waitFor();
    await T('exp-form').waitFor();
    await semLateral('Equipe > Editar');
    if (pasta) await p.screenshot({ path: `${pasta}/real-equipe-form-completo-${vp.nome}.png`, fullPage: true });
    if (pasta) { await T('eq-servicos').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${pasta}/real-equipe-servicos-${vp.nome}.png` }); await T('eq-expediente').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${pasta}/real-equipe-expediente-${vp.nome}.png` }); }
    await T('salvar-pessoa').click(); // um botão só: dados, serviços e (se mudou) horário
    await p.waitForFunction(() => !document.querySelector('[data-testid=eq-form]'));
    assert.ok(!chamadas.some((c) => c.p === `/api/profissionais/${KIKO}/escala` && c.m === 'PUT'), 'horário que não mudou não é reenviado');
    const put = chamadas.find((c) => c.m === 'PUT' && c.p === `/api/usuarios/${KIKO}/servicos`);
    assert.deepEqual([...put.dados.ids].sort(), [CORTE, SOBR].sort(), 'Equipe grava os serviços marcados');
    ok(`${vp.nome}px: Equipe > Editar mostra e grava os serviços da pessoa`);

    // horário próprio: abre segunda-feira e salva (PUT da escala da pessoa); sem dia aberto voltaria a seguir a loja
    await T(`editar-${KIKO}`).or(p.getByRole('button', { name: /Editar Kiko/ })).first().click();
    await T('exp-form').waitFor();
    assert.ok(await T('exp-sem').isVisible(), 'sem horário próprio: avisa que segue o da loja');
    await T('exp-dia-1').check();
    await T('salvar-pessoa').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid=eq-form]'));
    const putEscala = chamadas.find((c) => c.m === 'PUT' && c.p === `/api/profissionais/${KIKO}/escala`);
    assert.ok(putEscala.dados.semana[1] && putEscala.dados.semana[1].aberto, 'grava a escala própria junto com o resto');
    await T(`editar-${KIKO}`).or(p.getByRole('button', { name: /Editar Kiko/ })).first().click();
    await T('exp-form').waitFor();
    await T('exp-dia-1').uncheck(); await T('salvar-pessoa').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid=eq-form]'));
    assert.deepEqual(chamadas.filter((c) => c.m === 'PUT' && c.p === `/api/profissionais/${KIKO}/escala`).pop().dados.semana, {}, 'sem dia aberto = volta a seguir a loja');
    ok(`${vp.nome}px: horário por pessoa (própria ou seguindo a loja), salvo junto`);

    // ---------- A1: Serviços > Editar
    await nav('servicos'); await T(`editar-${CORTE}`).click();
    await T('srv-quem').waitFor();
    assert.ok(await T(`srv-quem-${DONO}`).isChecked() && await T(`srv-quem-${KIKO}`).isChecked());
    await T(`srv-quem-${BRUNO}`).uncheck();
    await semLateral('Serviços > Editar');
    if (pasta) { await T('srv-quem').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${pasta}/real-servicos-quem-${vp.nome}.png` }); }
    await T('salvar-servico').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid=srv-form]'));
    const putSrv = chamadas.find((c) => c.m === 'PUT' && c.p === `/api/servicos/${CORTE}/profissionais`);
    assert.deepEqual([...putSrv.dados.ids].sort(), [DONO, KIKO].sort(), 'Serviços grava quem realiza');
    ok(`${vp.nome}px: Serviços > Editar mostra e grava quem realiza`);
    await ctx.close();
  }
  assert.deepEqual(erros, [], 'sem erros de página nem diálogos nativos');
} finally {
  await b.close();
  servidor.close();
}
console.log('e2e124 ok');
