// Visão e filtro da agenda ficam lembrados (esteticista só vê a própria agenda), legenda com contadores, cores de status e logo da marca.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// O seletor de profissionais é único e recolhe ao escolher: abre a lista se estiver fechada e devolve o item.
const filtroProf = async (p, id) => { const it = p.getByTestId(`filtro-${id}`); if (!(await it.isVisible().catch(() => false))) await p.getByTestId('filtro-abrir').click(); return it; };

// PNG 64x64 com um círculo vermelho-tijolo sobre fundo transparente, gerado aqui (sem imagem no repositório).
function pngLogo() {
  const W = 64, raw = Buffer.alloc((W * 4 + 1) * W);
  for (let y = 0; y < W; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 31.5, y - 31.5), i = y * (W * 4 + 1) + 1 + x * 4;
      if (d < 26) { raw[i] = 168; raw[i + 1] = 50; raw[i + 2] = 38; raw[i + 3] = 255; }
    }
  }
  const crc = (b) => { let c = ~0; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const b = await chromium.launch();
const erros = [];
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const p = await ctx.newPage(); p.setDefaultTimeout(8000);
p.on('pageerror', (e) => erros.push('PAGE: ' + e.message));
p.on('dialog', async (d) => { erros.push('DIALOG: ' + d.message()); await d.dismiss(); });
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) erros.push(m.text()); });
const url = new URL('../dist/index.html', import.meta.url).href;
const T = (id) => p.locator(`[data-testid="${id}"]`);
// O Apex abre no tema escuro; o claro é escolhido no botão do topo (não segue o sistema).
const tema = async (modo) => { const atual = await p.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark'); if (atual !== modo) await T('alternar-tema').click(); };
const visao = (nome) => p.getByRole('button', { name: nome, exact: true });
await p.goto(url);

// 1) visão lembrada
await T('demo-davi').click();
await visao('Mês').click();
await p.waitForTimeout(150);
assert.equal(await visao('Mês').getAttribute('aria-pressed'), 'true');
await (await filtroProf(p, 'u-pablo')).click();
await T('sair').click();
await p.goto(url); // recarrega: o navegador guarda a preferência, o estado do app volta ao início
await T('demo-davi').click();
assert.equal(await visao('Mês').getAttribute('aria-pressed'), 'true', 'a última visão escolhida continua');
assert.equal(await (await filtroProf(p, 'u-pablo')).getAttribute('aria-pressed'), 'true', 'o filtro de esteticista continua');
console.log('✓ visão e filtro de esteticista lembrados');

// 2) clicar em um dia abre o dia só desta vez
await p.getByRole('button', { name: /^\d+/ }).first().isVisible().catch(() => {});
await visao('Semana').click();
await p.locator('.cab-dia').first().click();
assert.equal(await visao('Dia').getAttribute('aria-pressed'), 'true');
await T('sair').click();
await p.goto(url); await T('demo-davi').click();
assert.equal(await visao('Semana').getAttribute('aria-pressed'), 'true', 'abrir um dia não troca a visão preferida');
console.log('✓ abrir um dia não troca a visão preferida');

// 3) legenda com contadores que batem com o período
const nomes = ['a-confirmar', 'confirmado', 'concluido', 'sem-resposta', 'cancelado', 'reagendado'];
for (const n of nomes) assert.match(await T(`cont-${n}`).innerText(), /^\d+$/, n);
const eventos = await p.locator('.grade-col .ev').count();
const soma = (await Promise.all(nomes.slice(0, 5).map((n) => T(`cont-${n}`).innerText()))).reduce((t, v) => t + Number(v), 0);
assert.equal(soma, eventos, 'a soma dos status é o total de eventos da semana');
console.log('✓ legenda com contador do período');

// 4) cores de status: a confirmar amarelo, confirmado azul, concluído verde, sem resposta vermelho, cancelado cinza
const cor = (k) => p.evaluate((kk) => { const e = document.querySelector(`[data-testid="legenda-${kk}"]`); return getComputedStyle(e).getPropertyValue('--st').trim(); }, k);
const tokens = await p.evaluate(() => { const s = getComputedStyle(document.documentElement); return Object.fromEntries(['--amarelo', '--azul', '--verde', '--vermelho', '--cinza'].map((k) => [k, s.getPropertyValue(k).trim()])); });
assert.equal(await cor('a-confirmar'), tokens['--amarelo']); assert.equal(await cor('confirmado'), tokens['--azul']); assert.equal(await cor('concluido'), tokens['--verde']);
assert.equal(await cor('sem-resposta'), tokens['--vermelho']); assert.equal(await cor('cancelado'), tokens['--cinza']);
console.log('✓ cores de status');

// 5) esteticista só vê a própria agenda, mesmo com preferência de outro salva
await T('sair').click();
await p.evaluate(() => localStorage.setItem('agenda-profissionais:u-pablo', JSON.stringify(['u-davi', 'u-marcelo'])));
await T('demo-pablo').click();
await p.waitForTimeout(200);
assert.equal(await p.locator('[data-testid^="filtro-u-"]').count(), 1, 'só o próprio esteticista aparece nos filtros');
assert.equal(await p.locator('[data-testid="filtro-qualquer"]').count(), 0);
console.log('✓ esteticista vê só a própria agenda');
await T('sair').click();

// 6) logo: envia, cores e fundo
await T('demo-davi').click();
await T('nav-estab').click();
await p.getByRole('tab', { name: 'Aparência' }).click();
const topoImg = () => p.evaluate(() => getComputedStyle(document.querySelector('.topo')).backgroundImage);
const btnImg = () => p.evaluate(() => getComputedStyle(document.querySelector('.btn-primario')).backgroundImage);
await T('logo-remover').click(); // a Apex já vem com a logo e o tema dela; zera para testar o envio do começo
await T('logo-previa').waitFor({ state: 'detached' });
assert.equal(await T('tema-logo').isDisabled(), true, 'sem logo, "Cores da logo" fica indisponível');
assert.equal(await topoImg(), 'none', 'tema padrão: topo sem degradê');
const antes = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim());
const arq = path.join(os.tmpdir(), 'logo-teste.png'); fs.writeFileSync(arq, pngLogo());
await T('logo-arquivo').setInputFiles(arq);
await T('logo-previa').waitFor();
assert.equal(await T('tema-logo').isDisabled(), false, 'com logo colorida, "Cores da logo" fica disponível');
assert.equal(await topoImg(), 'none', 'subir a logo não muda o tema sozinho');
await T('tema-logo').click();
assert.match(await topoImg(), /linear-gradient/, 'topo com degradê das cores da logo');
assert.match(await btnImg(), /linear-gradient/, 'botão principal com degradê');
assert.equal(await T('tema-logo').getAttribute('aria-pressed'), 'true');
const depois = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tema-topo').trim());
assert.match(depois, /linear-gradient/);
const fundo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
assert.equal(fundo, 'rgb(13, 15, 18)', 'fundo continua neutro (grafite)');
assert.ok(await T('logo-marca').count(), 'logo no topo');
assert.match(await p.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage), /data:image/);
assert.equal(await p.evaluate(() => getComputedStyle(document.body, '::before').pointerEvents), 'none');
// o tom vermelho-tijolo manda: a primeira ponta do degradê é avermelhada
const [r, g, bl] = depois.match(/#(..)(..)(..)/).slice(1).map((h) => parseInt(h, 16));
assert.ok(r > g && r > bl, `degradê avermelhado (${depois})`);
console.log('✓ logo enviada: degradê com as cores dela, ícone no topo e fundo');
await p.screenshot({ path: path.join(os.tmpdir(), 'marca-claro.png') });
await tema('dark');
await p.waitForTimeout(150);
await p.screenshot({ path: path.join(os.tmpdir(), 'marca-escuro.png') });
await tema('light');
// remover volta ao padrão
await T('logo-remover').click();
await p.waitForTimeout(100);
assert.equal(await T('tema-marca').count(), 0);
assert.equal(await topoImg(), 'none', 'sem logo o tema "logo" volta ao padrão');
await tema('dark');
assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()), antes);
console.log('✓ remover a logo volta às cores padrão');
// paleta pronta: degradê no topo e nos botões, também no tema escuro, e o texto do topo legível
await T('tema-vinho').click();
assert.match(await topoImg(), /linear-gradient/);
const estilo = (sel, prop) => p.evaluate(([s, pr]) => getComputedStyle(document.querySelector(s))[pr], [sel, prop]);
assert.equal(await estilo('.topo', 'color'), 'rgb(255, 255, 255)', 'texto branco sobre o vinho');
await tema('dark');
await p.waitForTimeout(150);
assert.match(await topoImg(), /linear-gradient/, 'degradê também no tema escuro');
assert.match(await btnImg(), /linear-gradient/);
await tema('light');
await T('tema-padrao').click();
assert.equal(await topoImg(), 'none');
console.log('✓ paleta pronta: degradê no topo e nos botões, claro e escuro');

// 7) arquivo que não é imagem é recusado
fs.writeFileSync(path.join(os.tmpdir(), 'x.png'), 'isto não é uma imagem');
await T('logo-arquivo').setInputFiles(path.join(os.tmpdir(), 'x.png'));
await p.waitForTimeout(400);
assert.equal(await T('logo-previa').count(), 0);
console.log('✓ arquivo inválido é recusado');

// 8) foto de celular: grande (mais de 5 MB), pelo seletor de reserva e com erro visível na tela
{
  const grande = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
    const x = c.getContext('2d'); const d = x.createImageData(4000, 3000);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i] = (Math.random() * 255) | 0; d.data[i + 1] = (i / 4000) & 255; d.data[i + 2] = (Math.random() * 255) | 0; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.97));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const foto = path.join(os.tmpdir(), 'foto-celular.jpg'); fs.writeFileSync(foto, Buffer.from(grande));
  assert.ok(fs.statSync(foto).size > 5 * 1024 * 1024, 'a foto de teste passa de 5 MB: ' + fs.statSync(foto).size);
  await p.locator('summary', { hasText: 'não abriu' }).click();
  await T('logo-arquivo-nativo').setInputFiles(foto);
  await T('logo-previa').waitFor({ timeout: 15000 });
  assert.equal(await T('logo-erro').count(), 0);
  console.log('✓ foto grande de celular é reduzida e aceita');
  // erro fica visível na tela (o aviso rápido some em segundos)
  fs.writeFileSync(path.join(os.tmpdir(), 'y.png'), 'não é imagem');
  await T('logo-arquivo-nativo').setInputFiles(path.join(os.tmpdir(), 'y.png'));
  await T('logo-erro').waitFor();
  console.log('✓ erro de imagem fica escrito na tela');
}
assert.deepEqual(erros, [], erros.join('\n'));
await b.close();
