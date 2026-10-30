/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// 5e-1: link do cliente no site real (dist/index-real.html, #agendar) contra um servidor falso: abre sem login e sem Authorization, serviço → dia e horário
// (só os livres) → dados, horário ocupado devolve ao passo do horário, cupom errado mostra a mensagem genérica, pedido enviado com desconto, "Meus agendamentos"
// lembra do horário depois de recarregar (token só neste aparelho), cancelar com confirmação na tela e a recusa de menos de 24 h; link desligado; cartão do
// proprietário no Início (copiar/abrir, ligar/desligar, dias de 1 a 60); 390 px com fonte larga sem rolagem lateral.
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
let semBox = false; // v119: o servidor avisa o que falta para o cliente ver horários
let link = { ativo: true, diasMax: 30, disponivel: true, telefoneObrigatorio: true };
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
      return json(200, { ...link, pendencias: semBox ? ['Nenhum box ativo cadastrado (Estabelecimento > Boxes): na estética o carro precisa de um box, então o cliente não vê nenhum horário.'] : [] });
    }
    // ---- rotas do cliente (sem login)
    if (u.pathname === '/api/publico/agendar') return json(200, ativo ? { ativo: true, aviso: null, diasMax: 30, exigeTelefone: link.telefoneObrigatorio !== false, servicos, profissionais } : { ativo: false, aviso: 'O agendamento pelo link não está disponível agora. Fale com a loja.', diasMax: 30, servicos: [], profissionais: [] });
    if (u.pathname === '/api/publico/dias') return json(200, DIAS.filter((d) => d >= u.searchParams.get('de')));
    if (u.pathname === '/api/publico/horarios') {
      const d = u.searchParams.get('data');
      return json(200, HORAS.map((h) => `${d}T${h}`).filter((i) => !ocupados.has(i)).map((i) => ({ inicio: i, profissionalId: ALAN })));
    }
    if (u.pathname === '/api/publico/agendamentos' && req.method === 'POST') {
      if (c.inicio && falhaOcupado) { falhaOcupado = false; ocupados.add(c.inicio.replace('.000Z', 'Z')); return json(409, { mensagem: OCUPADO }); }
      if (!c.telefone && link.telefoneObrigatorio !== false) return json(400, { mensagem: 'Informe o telefone com DDD.' });
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
async function abrir(viewport = { width: 1280, height: 860 }, hash = '#agendar', ctxExistente = null) {
  const touch = viewport.width < 700;
  const ctx = ctxExistente || await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  if (!ctxExistente) await ctx.clock.setFixedTime(AGORA);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url + hash);
  return { ctx, p };
}
const deHoje = (m, u) => chamadas.filter((c) => c.m === m && c.u === u);

// 1. abre sem login: serviços, quem atende, nenhum Authorization; horários vêm do servidor
let contexto;
{
  const { ctx, p } = await abrir();
  contexto = ctx;
  await p.getByTestId('pagina-publica').waitFor();
  assert.equal(await p.getByTestId('login-id').count(), 0, 'o link do cliente não pede login');
  assert.match(await p.getByTestId('pub-nome-loja').innerText(), /Dalforno/);
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).waitFor();
  assert.equal(await p.getByTestId('pub-barb-qualquer').count(), 1); assert.equal(await p.getByTestId(`pub-barb-${BETO}`).count(), 1);
  assert.ok(chamadas.every((c) => !c.auth), 'nenhuma chamada do cliente leva Authorization');
  assert.match(await p.getByTestId(`pub-srv-${SRV_BARBA}`).locator('xpath=ancestor::label').innerText(), /2 h de antecedência/);
  ok('abre sem login, mostra serviços e quem atende, sem Authorization');

  // 2. escolhe, o horário já tomado devolve ao passo do horário (409) e some da lista
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).check();
  await p.getByTestId('pub-continuar-1').click();
  await p.getByTestId('pub-dia-2026-10-30').waitFor();
  assert.equal(await p.getByTestId('pub-dia-2026-10-29').count(), 0, 'só aparecem dias com horário livre');
  assert.match(deHoje('GET', '/api/publico/dias')[0].q, /de=2026-10-28&dias=14&servicos=/, 'o dia de hoje é o de Brasília');
  await p.getByTestId('pub-hora-0900').click();
  await p.getByTestId('pub-continuar-2').click();
  await p.getByTestId('pub-resumo').waitFor();
  assert.match(await p.getByTestId('pub-resumo').innerText(), /Corte/); assert.match(await p.getByTestId('pub-resumo').innerText(), /09:00/);
  await p.getByTestId('pub-nome').fill('Maria Souza'); await p.getByTestId('pub-tel').fill('53999000001');
  assert.equal(await p.getByTestId('pub-tel').inputValue(), '(53) 99900-0001');
  await p.getByTestId('pub-enviar').click();
  await p.getByTestId('pub-hora-0930').waitFor();
  assert.equal(await p.getByTestId('pub-hora-0900').count(), 0, 'o horário tomado saiu da lista');
  assert.match(await p.getByTestId('pub-erro').innerText(), /acabou de ser ocupado/);
  ok('horário ocupado: volta ao passo do horário, mostra a mensagem e some da lista');

  // 3. cupom errado: mensagem genérica e nada é criado; cupom certo: pedido enviado com desconto
  await p.getByTestId('pub-hora-0930').click();
  await p.getByTestId('pub-continuar-2').click();
  assert.equal(await p.getByTestId('pub-nome').inputValue(), 'Maria Souza', 'os dados digitados continuam');
  await p.getByTestId('pub-cupom').fill('errada-errada');
  await p.getByTestId('pub-enviar').click();
  await p.getByTestId('pub-erro').waitFor();
  assert.equal((await p.getByTestId('pub-erro').innerText()).trim(), GENERICO);
  assert.equal(feitos.length, 0);
  await p.getByTestId('pub-cupom').fill(CUPOM_BOM.toLowerCase());
  await p.getByTestId('pub-enviar').click();
  await p.getByTestId('pub-feito').waitFor();
  const corpo = deHoje('POST', '/api/publico/agendamentos').at(-1).corpo;
  assert.deepEqual(Object.keys(corpo).sort(), ['cupomChave', 'inicio', 'nome', 'profissionalId', 'servicoIds', 'telefone'], 'só os campos aceitos (a isca vazia não vai); o profissional é o que o servidor mostrou livre naquele horário');
  assert.equal(corpo.profissionalId, ALAN);
  assert.match(await p.getByTestId('pub-feito').innerText(), /09:30/); assert.match(await p.getByTestId('pub-feito-cupom').innerText(), /4,00/); assert.match(await p.getByTestId('pub-feito-cupom').innerText(), /36,00/);
  ok('cupom errado = mensagem genérica; cupom certo = pedido enviado com desconto');

  // 4. Meus agendamentos
  await p.getByTestId('pub-ver-meus').click();
  await p.getByTestId(`pub-ag-${feitos[0].resumo.id}`).waitFor();
  assert.match(await p.getByTestId(`pub-ag-${feitos[0].resumo.id}`).innerText(), /Aguardando confirmação/);
  const meus = deHoje('POST', '/api/publico/meus').at(-1);
  assert.deepEqual(meus.corpo, { tokens: [feitos[0].token] }); assert.ok(!meus.q.includes(feitos[0].token), 'o token nunca vai na URL');
  await p.close();
  ok('Meus agendamentos mostra o pedido (token no corpo, nunca na URL)');
}

// 5. outra visita no mesmo aparelho lembra do horário; cancela com confirmação na tela; a recusa de menos de 24 h
{
  const { p } = await abrir({ width: 1280, height: 860 }, '#agendar', contexto);
  await p.getByTestId('pub-aba-meus').click();
  const a1 = feitos[0].resumo;
  await p.getByTestId(`pub-ag-${a1.id}`).waitFor();
  ok('depois de recarregar, o aparelho lembra do horário');
  // um segundo pedido, que o servidor vai tratar como "faltam menos de 24 h"
  await p.getByTestId('pub-aba-agendar').click();
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).check(); await p.getByTestId(`pub-barb-${ALAN}`).click();
  await p.getByTestId('pub-continuar-1').click();
  await p.getByTestId('pub-dia-2026-10-31').click();
  await p.getByTestId('pub-hora-1000').waitFor();
  await p.getByTestId('pub-hora-1000').dispatchEvent('click'); await p.getByTestId('pub-continuar-2').click();
  await p.getByTestId('pub-nome').fill('Maria Souza'); await p.getByTestId('pub-tel').fill('53999000001');
  await p.getByTestId('pub-enviar').click(); await p.getByTestId('pub-feito').waitFor();
  assert.equal(deHoje('POST', '/api/publico/agendamentos').at(-1).corpo.profissionalId, ALAN);
  const a2 = feitos[1].resumo; a2.podeCancelar = false;
  await p.getByTestId('pub-ver-meus').click();
  await p.getByTestId(`pub-ag-${a2.id}`).waitFor();
  assert.equal(await p.getByTestId(`pub-ag-${a1.id}`).count(), 1, 'os dois horários aparecem');
  // menos de 24 h: a tela explica e não chama o servidor
  const antes = deHoje('POST', `/api/publico/agendamentos/${a2.id}/cancelar`).length;
  await p.getByTestId(`pub-cancelar-${a2.id}`).click();
  await p.getByTestId(`pub-cancelar-prazo-${a2.id}`).waitFor();
  assert.equal(deHoje('POST', `/api/publico/agendamentos/${a2.id}/cancelar`).length, antes);
  // 24 h ou mais: pede confirmação na tela (sem diálogo do navegador) e cancela com o token deste horário
  await p.getByTestId(`pub-cancelar-${a1.id}`).click();
  await p.getByTestId(`pub-cancelar-sim-${a1.id}`).click();
  await p.getByTestId('pub-aviso').waitFor();
  assert.match(await p.getByTestId('pub-aviso').innerText(), /cancelado/);
  const cc = deHoje('POST', `/api/publico/agendamentos/${a1.id}/cancelar`).at(-1);
  assert.equal(cc.acesso, feitos[0].token); assert.ok(!cc.u.includes(feitos[0].token)); assert.equal(cc.auth, '');
  assert.equal(await p.getByTestId(`pub-cancelar-${a1.id}`).count(), 0, 'o cancelado sai dos próximos horários');
  assert.match(await p.getByTestId(`pub-ag-${a1.id}`).innerText(), /Cancelado/);
  ok('cancelar: confirmação na tela, token do próprio horário; menos de 24 h nem chama o servidor');
  await p.close();
}

// 6. link desligado
{
  ativo = false;
  const { ctx, p } = await abrir();
  await p.getByTestId('pub-desligado').waitFor();
  assert.match(await p.getByTestId('pub-desligado').innerText(), /não está disponível agora/);
  assert.equal(await p.getByTestId('pub-aba-agendar').count(), 0, 'sem abas quando desligado');
  await ctx.close();
  ativo = true;
  ok('link desligado mostra o aviso e nada para agendar');
}

// 7. cartão do proprietário no Início + banner de quem está logado
{
  const { ctx, p } = await abrir({ width: 1280, height: 860 }, '');
  await p.getByTestId('login-id').fill('alan'); await p.getByTestId('login-senha').fill('Minha-senha'); await p.getByTestId('login-entrar').click();
  await p.getByTestId('nav-estabelecimento').click(); await p.getByTestId('tela-estabelecimento').waitFor();
  assert.equal(await p.getByTestId('link-endereco').inputValue(), `${url}#agendar`);
  assert.equal(await p.getByTestId('link-abrir').getAttribute('target'), '_blank'); assert.match(await p.getByTestId('link-abrir').getAttribute('rel'), /noopener/);
  assert.equal(await p.getByTestId('link-indisponivel').count(), 0);
  await p.getByTestId('link-dias').fill('61');
  assert.equal(await p.getByTestId('link-dias').inputValue(), '61');
  await p.getByTestId('link-salvar').click();
  assert.match(await p.getByTestId('link-erro').innerText(), /1 a 60/);
  assert.equal(deHoje('PUT', '/api/estabelecimento/link-agendamento').length, 0, 'dias fora de 1 a 60 nem saem');
  await p.getByTestId('link-dias').fill('14'); await p.getByTestId('link-ativo').uncheck();
  await p.getByTestId('link-salvar').click(); await p.getByTestId('link-ok').waitFor();
  assert.deepEqual(deHoje('PUT', '/api/estabelecimento/link-agendamento').at(-1).corpo, { ativo: false, diasMax: 14, telefoneObrigatorio: true });
  assert.equal(link.ativo, false);
  ok('Início: endereço do link, abrir em aba nova, dias de 1 a 60, ligar/desligar');
  // telefone obrigatório de fábrica; o dono tira e a tela avisa o que isso significa
  await p.getByTestId('link-ativo').check();
  assert.equal(await p.getByTestId('link-telefone-obrigatorio').isChecked(), true, 'de fábrica o telefone é obrigatório');
  await p.getByTestId('link-telefone-obrigatorio').uncheck();
  assert.match(await p.getByTestId('link-telefone-aviso').innerText(), /sem cadastro/);
  await p.getByTestId('link-salvar').click(); await p.getByTestId('link-ok').waitFor();
  assert.equal(deHoje('PUT', '/api/estabelecimento/link-agendamento').at(-1).corpo.telefoneObrigatorio, false);
  assert.equal(link.telefoneObrigatorio, false);
  ok('Estabelecimento: telefone obrigatório no link, desligável com aviso');
  // v119: sem box (estética) o cliente não vê horário: o servidor diz o motivo e o proprietário vê na tela do link e na Agenda
  assert.equal(await p.getByTestId('link-pendencias').count(), 0, 'sem pendência: sem aviso');
  semBox = true;
  await p.getByTestId('nav-agenda').click(); await p.getByTestId('agenda-link-pendencia').waitFor();
  assert.match(await p.getByTestId('agenda-link-pendencia').innerText(), /sem horários.*box/i);
  await p.getByTestId('nav-estabelecimento').click(); await p.getByTestId('link-pendencias').waitFor();
  assert.match(await p.getByTestId('link-pendencia').first().innerText(), /Boxes/);
  semBox = false;
  ok('pendências do link: motivo na Agenda e na tela do link');
  link = { ativo: true, diasMax: 30, disponivel: true, telefoneObrigatorio: true };
  // logado, o link do cliente mostra o aviso e volta ao painel
  await p.evaluate(() => { window.location.hash = '#agendar'; });
  await p.getByTestId('pub-banner').waitFor();
  assert.ok(deHoje('GET', '/api/publico/agendar').at(-1).auth === '', 'mesmo logado, a página do cliente não manda o token do painel');
  await p.getByTestId('pub-voltar-painel').click();
  await p.getByTestId('nav-estabelecimento').click(); await p.getByTestId('tela-estabelecimento').waitFor();
  ok('logado, a página do cliente avisa, não manda o token do painel e volta ao painel');
  await ctx.close();
}

// 7b. página do cliente com telefone opcional: o campo vira "se quiser" e o pedido sai sem telefone
{
  link = { ...link, telefoneObrigatorio: false }; falhaOcupado = false;
  const { ctx, p } = await abrir();
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).check();
  await p.getByTestId('pub-continuar-1').click();
  const horarios = p.waitForResponse((r) => r.url().includes('/api/publico/horarios') && r.url().includes('2026-10-31'));
  await p.getByTestId('pub-dia-2026-10-31').click();
  await horarios; // a lista de horas é trocada quando a resposta do dia chega: só então o horário é estável para clicar
  await p.getByTestId('pub-hora-0900').click(); // 10:00 de 31/10 já foi pedido acima e saiu da lista do servidor de mentira
  await p.getByTestId('pub-continuar-2').click();
  assert.match(await p.getByTestId('pub-tel').locator('xpath=ancestor::label').innerText(), /se quiser/);
  await p.getByTestId('pub-nome').fill('Sem Fone');
  await p.getByTestId('pub-enviar').click();
  await p.getByTestId('pub-feito').waitFor();
  assert.equal(deHoje('POST', '/api/publico/agendamentos').at(-1).corpo.telefone, '', 'o pedido sai sem telefone');
  link = { ...link, telefoneObrigatorio: true };
  ok('link do cliente com telefone opcional: pedido sem telefone');
  await ctx.close();
}

// 8. 390 px com fonte larga: sem rolagem lateral em nenhum passo
{
  falhaOcupado = false; ocupados.clear();
  const { ctx, p } = await abrir({ width: 390, height: 800 });
  await p.addStyleTag({ content: '*{font-family:"DejaVu Sans",sans-serif !important}' });
  const larg = async (onde) => { const l = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })); assert.ok(l.doc <= l.janela, `${onde}: rolagem lateral ${l.doc} > ${l.janela}`); };
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).waitFor(); await larg('serviços');
  await p.getByTestId(`pub-srv-${SRV_CORTE}`).check(); await p.getByTestId('pub-continuar-1').click();
  await p.getByTestId('pub-dia-2026-10-30').waitFor(); await larg('dia e horário');
  await p.getByTestId('pub-hora-0900').click(); await p.getByTestId('pub-continuar-2').click();
  await p.getByTestId('pub-resumo').waitFor(); await larg('seus dados');
  await p.getByTestId('pub-nome').fill('Maria Souza'); await p.getByTestId('pub-tel').fill('53999000002'); await p.getByTestId('pub-enviar').click();
  await p.getByTestId('pub-feito').waitFor(); await larg('pedido enviado');
  await p.getByTestId('pub-ver-meus').click(); await p.getByTestId('pub-meus').waitFor(); await larg('meus agendamentos');
  ok('390 px com fonte larga: sem rolagem lateral');
  await ctx.close();
}

await b.close(); servidor.close();
assert.deepEqual(erros, [], erros.join('\n'));
console.log('e2e55 ok');
