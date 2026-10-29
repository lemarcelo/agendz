/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// v104: link do cliente da ESTÉTICA no site real (dist/index-real.html, #agendar) contra servidor falso: primeiro o veículo (placa inválida trava, modelo e porte
// obrigatórios), preço e duração mudam com o porte, o porte vai na consulta de dias e horários, o pedido leva o veículo e o resumo e "Meus" mostram o veículo;
// voltar ao veículo troca o porte e refaz a consulta; 390 px com fonte larga sem rolagem lateral.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const pagina = readFileSync(new URL('../dist/index-real.html', import.meta.url), 'utf8');
const ok = (m) => console.log('✓', m);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ANA = id(1), SRV = id(50);
const AGORA = new Date('2026-10-28T10:00:00-03:00');
const chamadas = [];
const feitos = [];
const PORTES = [{ id: 'pequeno', nome: 'Pequeno' }, { id: 'medio', nome: 'Médio' }, { id: 'grande', nome: 'Grande' }, { id: 'suv', nome: 'SUV' }, { id: 'pickup', nome: 'Pickup' }];
const servicos = [{ id: SRV, nome: 'Lavagem completa', duracao: 60, preco: 80, antecedenciaH: 0, precos: { pequeno: 80, medio: 90, grande: 100, suv: 120, pickup: 130 }, duracoes: { pequeno: 60, medio: 70, grande: 80, suv: 90, pickup: 100 } }];

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    const json = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pagina); }
    const c = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ m: req.method, u: u.pathname, q: u.search, corpo: c });
    if (u.pathname === '/api/publico/loja') return json(200, { slug: 'apex', nome: 'Apex Estética', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null });
    if (u.pathname === '/api/publico/agendar') return json(200, { ativo: true, aviso: null, diasMax: 30, tipo: 'estetica_automotiva', portes: PORTES, servicos, profissionais: [{ id: ANA, nome: 'Ana', foto: null }] });
    if (u.pathname === '/api/publico/dias') return json(200, ['2026-10-30', '2026-11-02']);
    if (u.pathname === '/api/publico/horarios') return json(200, ['12:00:00Z', '13:00:00Z'].map((h) => ({ inicio: `${u.searchParams.get('data')}T${h}`, profissionalId: ANA })));
    if (u.pathname === '/api/publico/agendamentos' && req.method === 'POST') {
      const q = Date.parse(c.inicio); const pt = c.veiculo.porte; const s = servicos[0];
      const resumo = { id: id(400), inicio: new Date(q).toISOString(), fim: new Date(q + s.duracoes[pt] * 60000).toISOString(), status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: [s.nome], duracao: s.duracoes[pt], total: s.precos[pt],
        desconto: 0, cupom: null, profissional: 'Ana', ativo: true, podeCancelar: true, veiculo: { placa: c.veiculo.placa.replace('-', ''), modelo: c.veiculo.modelo, porte: pt } };
      feitos.push({ token: 'ab'.repeat(24), resumo });
      return json(201, { agendamento: resumo, token: 'ab'.repeat(24) });
    }
    if (u.pathname === '/api/publico/meus' && req.method === 'POST') return json(200, feitos.map((f) => f.resumo));
    json(404, {});
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${servidor.address().port}/`;
const b = await chromium.launch();
const erros = [];
const deHoje = (m, u) => chamadas.filter((c) => c.m === m && c.u === u);

async function abrir(viewport) {
  const touch = viewport.width < 700;
  const ctx = await b.newContext({ viewport, hasTouch: touch, isMobile: touch, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.clock.setFixedTime(AGORA);
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
  p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
  await p.goto(url + '#agendar');
  return { ctx, p };
}

{
  const { ctx, p } = await abrir({ width: 390, height: 844 });
  await p.getByTestId('pub-placa').waitFor();
  assert.equal(await p.getByTestId(`pub-srv-${SRV}`).count(), 0, 'o veículo vem antes do serviço');
  assert.equal(await p.getByTestId('pub-continuar-0').isDisabled(), true);
  await p.getByTestId('pub-placa').fill('abc12');
  await p.getByTestId('pub-placa-erro').waitFor();
  await p.getByTestId('pub-modelo').fill('Creta');
  await p.getByTestId('pub-porte-suv').click();
  assert.equal(await p.getByTestId('pub-continuar-0').isDisabled(), true, 'placa inválida trava');
  await p.getByTestId('pub-placa').fill('abc1d23');
  assert.equal(await p.getByTestId('pub-placa').inputValue(), 'ABC1D23');
  assert.equal(await p.getByTestId('pub-placa-erro').count(), 0);
  await p.getByTestId('pub-continuar-0').click();
  ok('veículo primeiro: placa inválida trava, modelo e porte obrigatórios');

  const rot = p.getByTestId(`pub-srv-${SRV}`).locator('xpath=ancestor::label');
  await rot.waitFor();
  assert.match(await rot.innerText(), /120,00/); assert.match(await rot.innerText(), /1 h 30 min/);
  await p.getByTestId('pub-trocar-veiculo').click();
  await p.getByTestId('pub-porte-pequeno').click();
  await p.getByTestId('pub-continuar-0').click();
  assert.match(await rot.innerText(), /80,00/); assert.match(await rot.innerText(), /1 h\b(?! 30)/);
  await p.getByTestId('pub-trocar-veiculo').click();
  await p.getByTestId('pub-porte-suv').click();
  await p.getByTestId('pub-continuar-0').click();
  ok('preço e duração do serviço mudam com o porte');

  await p.getByTestId(`pub-srv-${SRV}`).check();
  await p.getByTestId('pub-continuar-1').click();
  await p.getByTestId('pub-dia-2026-10-30').waitFor();
  assert.match(deHoje('GET', '/api/publico/dias').at(-1).q, /&porte=suv/);
  await p.getByTestId('pub-hora-0900').click();
  assert.match(deHoje('GET', '/api/publico/horarios').at(-1).q, /&porte=suv/);
  await p.getByTestId('pub-continuar-2').click();
  const resumo = await p.getByTestId('pub-resumo').innerText();
  assert.match(resumo, /Creta/); assert.match(resumo, /ABC1D23|ABC-1D23/);
  await p.getByTestId('pub-nome').fill('Maria Souza'); await p.getByTestId('pub-tel').fill('53999000001');
  await p.getByTestId('pub-enviar').click();
  await p.getByTestId('pub-feito').waitFor();
  const corpo = deHoje('POST', '/api/publico/agendamentos').at(-1).corpo;
  assert.deepEqual(corpo.veiculo, { placa: 'ABC1D23', modelo: 'Creta', porte: 'suv' });
  assert.match(await p.getByTestId('pub-feito').innerText(), /Creta/);
  ok('porte vai na consulta, pedido leva o veículo, resumo e confirmação mostram o veículo');

  await p.getByTestId('pub-ver-meus').click();
  await p.getByTestId(`pub-ag-${id(400)}`).waitFor();
  assert.match(await p.getByTestId(`pub-ag-${id(400)}`).innerText(), /Creta/);
  const larg = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(larg[0] <= larg[1], `sem rolagem lateral em 390 px (${larg})`);
  ok('"Meus agendamentos" mostra o veículo; 390 px sem rolagem lateral');
  await ctx.close();
}
await b.close(); servidor.close();
assert.deepEqual(erros, []);
console.log('e2e64 ok');
