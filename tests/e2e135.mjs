/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const CAP = process.env.E2E_CAPTURAS; // E2E_CAPTURAS=<pasta> grava as imagens
import http from 'node:http';
import { acessarSecao } from './navegacao-real.mjs';
const html = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ordem = { etapas: ['veiculo','servicos','quando','cliente','produtos'], cliente: ['nome','telefone'], veiculo: ['porte','placa','modelo','marca','cor'] };
let enviado = null;
const server = http.createServer((req,res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') { res.writeHead(200, {'Content-Type':'text/html'}); return res.end(html); }
  if (path === '/api/atendimentos' && req.method === 'POST') {
    let corpo = ''; req.on('data', (b) => { corpo += b; });
    return req.on('end', () => { enviado = JSON.parse(corpo); res.writeHead(201, {'Content-Type':'application/json'}); res.end(JSON.stringify({ id:id(99), clienteId:id(100), profissionalId:id(1), inicio:'2026-11-05T12:00:00Z', fim:'2026-11-05T12:30:00Z', fimOcupado:'2026-11-05T12:30:00Z', status:'concluido', total:40, servicos:[], historico:[] })); });
  }
  let dados = [];
  if (path === '/api/publico/loja') dados = { slug:'estetica', nome:'Teste', tipo:'estetica_automotiva', logo:null, temaCor:null, temaCor2:null };
  if (path === '/api/auth/login') dados = { token:'teste', id:id(1), nome:'Teste', papel:'dono', deveTrocarSenha:false, onboardingPendente:false, secoes:['agenda','clientes'] };
  if (path === '/api/profissionais') dados = [{ id:id(1), nome:'Teste', papel:'dono', atende:true }];
  if (path === '/api/boxes') dados = [{ id:id(70), nome:'Box 1', ativo:true }];
  if (path === '/api/servicos') dados = [{ id:id(50), codigo:'1', nome:'Lavagem', preco:40, duracaoMin:30, intervaloMin:0, ordem:2, ativo:true, precos:{ pequeno:30, medio:40 }, duracoes:{ pequeno:25, medio:30 } }, { id:id(51), codigo:'2', nome:'Polimento', preco:80, duracaoMin:60, intervaloMin:0, ordem:1, ativo:true, precos:{ pequeno:70, medio:80 }, duracoes:{ pequeno:50, medio:60 } }];
  if (path === '/api/servicos/profissionais') dados = { [id(50)]: [id(1)], [id(51)]: [id(1)] };
  if (path === '/api/estabelecimento/regras-atendimento') dados = { formaPagamentoPadrao:'pix', futuro:['nome','porte'], local:['nome','porte'], ordemAtender:{ local:ordem, futuro:ordem } };
  res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(dados));
});
await new Promise((r) => server.listen(0,'127.0.0.1',r));
const b = await chromium.launch();
try {
  for (const largura of [390, 1366]) {
    enviado = null;
    const p = await b.newPage({ viewport: { width: largura, height: 850 }, locale: 'pt-BR' });
    p.on('pageerror', (e) => { throw e; });
    await p.goto(`http://127.0.0.1:${server.address().port}/`);
    await p.getByTestId('login-id').fill('teste'); await p.getByTestId('login-senha').fill('senha'); await p.getByTestId('login-entrar').click();
    await acessarSecao(p, 'nav-agenda'); await p.getByTestId('atender-abrir').click();
    await p.getByTestId('atender-form').waitFor();
    // 1) veículo em primeiro: o passo Veículo abre antes dos serviços e os serviços não aparecem
    await p.getByTestId('atender-veiculo-bloco').waitFor({ state: 'visible' });
    assert.equal(await p.getByTestId('atender-lista-servicos').isVisible(), false, 'serviços não aparecem antes do porte');
    if (CAP) { mkdirSync(CAP, { recursive: true }); await p.waitForTimeout(350); await p.screenshot({ path: CAP + '/g1-veiculo-primeiro-' + largura + '.png', animations: 'disabled' }); }
    // 2) sem porte não avança, e o erro é desta etapa
    await p.getByTestId('atender-prox-servicos').click();
    assert.match(await p.getByTestId('atender-erro').innerText(), /porte/i);
    assert.equal(await p.getByTestId('atender-lista-servicos').isVisible(), false, 'continua no passo Veículo');
    // sem vazamento contextual: o aviso de campos do cliente não aparece no passo Veículo
    assert.equal(await p.getByTestId('atender-faltam').count(), 0, 'aviso "Falta preencher" não aparece fora do passo Cliente');
    // porte é o primeiro campo do veículo
    const ordemCampos = await p.locator('[data-testid="atender-veiculo-novo"] [data-testid^="atender-v-"]').evaluateAll((els) => els.map((e) => e.dataset.testid));
    assert.ok(ordemCampos[0].startsWith('atender-v-porte'), 'porte vem primeiro nos campos: ' + ordemCampos.join(','));
    // 3) escolhe o porte, avança, e a limpeza de erro vale na troca de etapa
    await p.getByTestId('atender-v-porte-pequeno').click();
    await p.getByTestId('atender-prox-servicos').click();
    await p.getByTestId('atender-lista-servicos').waitFor({ state: 'visible' });
    if (CAP) { await p.waitForTimeout(350); await p.screenshot({ path: CAP + '/g1-servicos-depois-do-porte-' + largura + '.png', animations: 'disabled' }); }
    assert.equal(await p.getByTestId('atender-erro').count(), 0, 'sem erro ao trocar de etapa');
    assert.equal(await p.getByTestId('atender-faltam').count(), 0, 'sem aviso de campos do cliente no passo Serviços');
    await p.getByTestId(`atender-srv-${id(50)}`).check();
    await p.getByTestId('atender-prox-quando').click();
    await p.getByTestId('atender-prox-cliente').click();
    await p.getByTestId('atender-nome').fill('Pessoa Teste');
    await p.getByTestId('salvar-atender').click();
    await p.getByTestId('atender-sucesso').waitFor();
    assert.deepEqual(enviado.servicoIds, [id(50)]);
    assert.equal(enviado.veiculo.porte, 'pequeno');
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral em ' + largura);
    await p.close();
  }
  console.log('Atender: veículo/porte em primeiro lugar passou (390 e 1366).');
} finally { await b.close(); server.close(); }
