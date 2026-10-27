// Proteção contra cópia: marcas de autoria que só o dono consegue assinar, build sem comentários, registro discreto (sem sabotar) fora dos endereços licenciados.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { assinaturaDe, codificarZw, decodificarZw, gerarMarcas, lerSegredo, tagDeArquivo } from '../tools/autoria.mjs';
import { verificarAmbiente, marcar, MARCA } from '../src/domain/autoria.js';
import { store } from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';

const raiz = new URL('..', import.meta.url).pathname;
const segredo = lerSegredo(raiz);

test('marca invisível: codifica e decodifica o id, e sobrevive a copiar e colar no meio de um texto', () => {
  const zw = codificarZw('a1b2c3d4e5');
  assert.ok(![...zw].some((c) => /[\w ]/.test(c)), 'só caracteres invisíveis');
  const texto = `Olá${zw}, mundo`;
  assert.deepEqual(decodificarZw(texto), ['a1b2c3d4e5']);
  assert.equal(texto.replace(/[​‌⁠]/g, ''), 'Olá, mundo');
});

test('assinatura do build: só confere com a chave certa; chave errada ou id adulterado falham', () => {
  const m = gerarMarcas({ segredo: 'chave-de-teste', versao: '1.0.0' });
  assert.equal(assinaturaDe('chave-de-teste', m.id), m.sig);
  assert.notEqual(assinaturaDe('outra-chave', m.id), m.sig);
  assert.notEqual(assinaturaDe('chave-de-teste', m.id.replace(/./, (c) => (c === 'a' ? 'b' : 'a'))), m.sig);
  assert.deepEqual(decodificarZw(m.zw), [m.id]);
  assert.notEqual(gerarMarcas({ segredo: 'chave-de-teste', versao: '1.0.0' }).id, m.id, 'cada build tem id próprio');
  assert.notEqual(tagDeArquivo('k', 'src/a.js'), tagDeArquivo('k', 'src/b.js'));
});

test('ambiente: arquivo local, localhost e Claude passam; qualquer outro endereço (inclusive parecido) fica registrado sem travar', () => {
  for (const h of ['localhost', '127.0.0.1', 'claude.ai', 'abc.claudeusercontent.com']) assert.equal(verificarAmbiente({ hostname: h, protocol: 'https:' }).ok, true, h);
  assert.equal(verificarAmbiente({ hostname: '', protocol: 'file:' }).ok, true);
  for (const h of ['copia-do-fulano.com', 'claude.ai.evil.com', 'xclaude.ai', 'evil-claudeusercontent.com']) { const r = verificarAmbiente({ hostname: h, protocol: 'https:' }); assert.equal(r.ok, false, h); assert.equal(r.motivo, 'host fora da lista licenciada'); }
  assert.equal(verificarAmbiente(undefined).ok, true);
});

test('cópia fora da lista só deixa um registro no log da aba "Chamadas à API": nada quebra nem aparece na tela', () => {
  reiniciar();
  const antes = store.getSnapshot().apiLog.length;
  store.alertaLicenca({ ok: false, host: 'copia.exemplo.com', marca: MARCA.id, motivo: 'host fora da lista licenciada' });
  const l = store.getSnapshot().apiLog[0];
  assert.equal(store.getSnapshot().apiLog.length, antes + 1);
  assert.equal(l.rota, '/licenca/alerta'); assert.match(l.detalhe, /copia\.exemplo\.com/);
  assert.equal(marcar('texto').startsWith('texto'), true);
  assert.ok(store.getState().agendamentos.length > 0, 'o app continua funcionando');
});

test('todo arquivo de src/ tem o cabeçalho de direitos autorais (rode `npm run autoria` ao criar um arquivo novo)', () => {
  const faltam = [];
  for (const rel of fs.readdirSync(path.join(raiz, 'src'), { recursive: true })) {
    if (!/\.(js|jsx|css)$/.test(rel)) continue;
    if (!/^\/\* © \d{4} Marcelo — Agendz\. Todos os direitos reservados[^\n]*ref:[0-9a-f]{10} \*\/\n/.test(fs.readFileSync(path.join(raiz, 'src', rel), 'utf8'))) faltam.push(rel);
  }
  assert.deepEqual(faltam, []);
  assert.ok(fs.existsSync(path.join(raiz, 'LICENSE.md')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).license, 'UNLICENSED');
});

test('build: sem comentários nem caminhos do código, sem mapa de código-fonte, com a marca assinada e a marca invisível nos textos', () => {
  const r = spawnSync('node', ['build.mjs'], { cwd: raiz, encoding: 'utf8', env: { ...process.env } });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(raiz, 'dist/agenda.html'), 'utf8');
  assert.doesNotMatch(html, /sourceMappingURL/);
  assert.doesNotMatch(html, /Regras de negócio puras|Candidatas diretas à migração|src\/domain\/|src\\services/);
  const m = html.match(/AGENDZ-MARCA id=([0-9a-f]{10}) sig=([0-9a-f]{32})/);
  assert.ok(m, 'marca do build');
  assert.ok(decodificarZw(html).includes(m[1]), 'marca invisível nos textos bate com a do build');
  if (segredo) {
    assert.equal(assinaturaDe(segredo, m[1]), m[2], 'assinatura confere com a chave do dono');
    const v = spawnSync('node', ['tools/verificar-autoria.mjs', 'dist/agenda.html'], { cwd: raiz, encoding: 'utf8' });
    assert.equal(v.status, 0); assert.match(v.stdout, /VÁLIDA/);
    // marca forjada com outra chave é reconhecida como inválida
    const falso = path.join(raiz, 'dist', 'falso.txt');
    fs.writeFileSync(falso, `AGENDZ-MARCA id=${m[1]} sig=${assinaturaDe('outra', m[1])}`);
    const f = spawnSync('node', ['tools/verificar-autoria.mjs', 'dist/falso.txt'], { cwd: raiz, encoding: 'utf8' });
    fs.rmSync(falso);
    assert.equal(f.status, 1); assert.match(f.stdout, /inválida/);
  }
});

test('a chave secreta nunca fica dentro do projeto', () => {
  const achados = [];
  const ler = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === 'shots') continue; const p = path.join(d, e.name); if (e.isDirectory()) ler(p); else if (segredo && fs.readFileSync(p).includes(segredo)) achados.push(p); } };
  ler(raiz);
  assert.deepEqual(achados, []);
});
