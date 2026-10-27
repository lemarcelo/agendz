// Verificações estáticas do código-fonte, sem dependências (o ESLint ficará para quando o registro do npm estiver acessível).
// Cada regra existe por um motivo do projeto: ver CLAUDE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const arquivos = (dir, ext) => readdirSync(join(raiz, dir), { recursive: true }).filter((f) => ext.some((e) => f.endsWith(e)) && !statSync(join(raiz, dir, f)).isDirectory()).map((f) => join(dir, f));
const fonte = arquivos('src', ['.js', '.jsx']);
// Tira comentários para não acusar texto de explicação.
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

test('o fonte existe e é lido', () => assert.ok(fonte.length >= 20, `só ${fonte.length} arquivos`));

test('nada de HTML cru, eval ou new Function (XSS e injeção)', () => {
  const proibido = [/dangerouslySetInnerHTML/, /\binnerHTML\s*=/, /\bouterHTML\s*=/, /\beval\s*\(/, /new\s+Function\s*\(/, /document\.write\s*\(/];
  for (const f of fonte) { const t = semComentarios(ler(f)); for (const re of proibido) assert.ok(!re.test(t), `${f}: ${re}`); }
});

test('alert/confirm/prompt não existem (o Artifact bloqueia; a confirmação é feita na própria tela)', () => {
  for (const f of fonte) assert.ok(!/(^|[^.\w])(alert|confirm|prompt)\s*\(/.test(semComentarios(ler(f))), f);
});

test('código de recuperação e identificadores sensíveis não usam Math.random sem alternativa segura', () => {
  const t = semComentarios(ler('src/services/api.js'));
  const usos = [...t.matchAll(/Math\.random/g)].length;
  const seguros = [...t.matchAll(/getRandomValues/g)].length;
  assert.ok(seguros >= 1, 'o código de recuperação precisa usar getRandomValues (crypto)');
  assert.ok(usos <= 1, 'Math.random só pode aparecer como reserva do código de recuperação');
});

test('localStorage/sessionStorage só dentro de try/catch (pode lançar em janela privada)', () => {
  for (const f of fonte) {
    const t = semComentarios(ler(f));
    for (const m of t.matchAll(/(localStorage|sessionStorage)\./g)) {
      const antes = t.slice(Math.max(0, m.index - 400), m.index);
      assert.ok(/try\s*\{[^}]*$/.test(antes) || /catch/.test(t.slice(m.index, m.index + 300)), `${f}: ${m[0]} sem try/catch`);
    }
  }
});

// Único arquivo com rede: o cliente da API real. Ele só entra no build do site publicado (src/main-real.jsx); o Artifact e os testes de regra usam a API simulada.
const COM_REDE = 'src/services/api-real.js';
test('o app não carrega nada de fora (fetch, XHR, WebSocket, scripts e imagens remotas)', () => {
  for (const f of fonte.filter((x) => x !== COM_REDE)) {
    const t = semComentarios(ler(f));
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon/.test(t), `${f}: chamada de rede`);
    assert.ok(!/(src|href)=["']https?:/.test(t) || /target="_blank"/.test(t), `${f}: recurso externo`);
  }
});

test('só o site real importa o cliente HTTP; o token nunca vai para storage ou cookie', () => {
  const t = semComentarios(ler(COM_REDE));
  assert.ok(/\bfetch\s*\(/.test(t), 'o cliente real precisa existir');
  assert.ok(!/XMLHttpRequest|new\s+WebSocket|sendBeacon/.test(t), 'só fetch');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(t), 'token só em memória');
  assert.ok(/credentials:\s*'omit'/.test(t), 'sem cookies');
  for (const f of fonte) {
    if (f === COM_REDE) continue;
    const importa = /from\s+['"][^'"]*api-real(\.js)?['"]/.test(ler(f));
    if (importa) assert.ok(f.startsWith('src/ui/real/'), `${f}: só src/ui/real/ pode importar api-real.js`);
  }
});

test('src/ui/leve e src/ui/real não dependem da API simulada (nem de hooks.js e common.jsx, que a importam)', () => {
  for (const f of fonte.filter((x) => x.startsWith('src/ui/leve/') || x.startsWith('src/ui/real/'))) {
    for (const m of ler(f).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(!/(^|\/)(api|hooks|common|chat)(\.jsx?)?$/.test(m[1]) || /api-real/.test(m[1]), `${f}: importa ${m[1]}`);
    }
  }
});

test('o bundle do Artifact (src/main.jsx) não tem fetch nem o cliente real', async () => {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(raiz, 'src/main.jsx')], bundle: true, write: false, minify: true, format: 'iife', jsx: 'automatic', loader: { '.css': 'text' }, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', __MARCA_ID__: '"x"', __MARCA_SIG__: '"x"', __MARCA_ZW__: '""', __HOSTS_LICENCIADOS__: '[]', __AGENDZ_TIPO__: '""', __AGENDZ_DOMINIO__: '""' } });
  const js = r.outputFiles[0].text;
  assert.ok(!/\bfetch\s*\(/.test(js), 'o bundle do Artifact tem fetch(');
  assert.ok(!js.includes('/api/auth/login') && !js.includes('/api/publico/loja'), 'o bundle do Artifact tem rota da API real');
});

test('CPF completo não é exibido onde só o mascarado deve aparecer (pedidos de vínculo)', () => {
  const api = ler('src/services/api.js');
  const bloco = api.slice(api.indexOf('export function pedidosVinculoVisiveis'), api.indexOf('// ---------- autenticação'));
  assert.ok(/cpfMascarado\(p\.cpf\)/.test(bloco) && !/cpf:\s*p\.cpf\b/.test(bloco));
});

test('toda função de escrita do painel confere permissão ou sessão', () => {
  const t = ler('src/services/api.js');
  // Isentos de propósito: porta pública do WhatsApp (valida o telefone do remetente), login/recuperação, simulador do banco e relógio.
  const isentos = new Set(['whatsapp', 'auth', 'store', 'bancoSimulado', 'publico']); // publico: sem sessão, por token pessoal e limites (ver tests/publico.test.mjs)
  const ok = /exigir\(|R\.pode\(|podeAutorizarVinculo|podeEscopo|usuario\(\)|semPermissao|decidir\(|meuAgendamento|daCobranca|=== sessao/;
  const problemas = [];
  for (const bloco of t.matchAll(/^export const (\w+) = \{\n([\s\S]*?)\n\};$/gm)) {
    if (isentos.has(bloco[1])) continue;
    // separa os métodos pelo recuo de 2 espaços
    const metodos = bloco[2].split(/\n(?=  \w+\()/);
    for (const m of metodos) {
      const nome = m.match(/^\s*(\w+)\(/)?.[1];
      if (nome && /mutate\(/.test(m) && !ok.test(m)) problemas.push(`${bloco[1]}.${nome}`);
    }
  }
  assert.deepEqual(problemas, [], 'escrita sem conferir permissão: ' + problemas.join(', '));
});

test('todo arquivo de teste está no npm test (nenhum fica de fora)', () => {
  const pkg = JSON.parse(ler('package.json'));
  const feitos = readdirSync(join(raiz, 'tests')).filter((f) => f.endsWith('.test.mjs'));
  const cmd = pkg.scripts.test;
  const usaGlob = /tests\/\*\*?\/?\*?\.test\.mjs|tests\/\*\.test\.mjs/.test(cmd) || /node --test\s*$/.test(cmd.trim());
  if (!usaGlob) for (const f of feitos) assert.ok(cmd.includes(f), `${f} não roda no npm test`);
  assert.ok(feitos.length >= 6);
});

test('todo e2e existente é executado pelo run-e2e (padrão e2e*.mjs)', () => {
  const run = ler('tests/run-e2e.mjs');
  assert.ok(/e2e\\d\*\\\.mjs/.test(run));
  assert.ok(readdirSync(join(raiz, 'tests')).filter((f) => /^e2e\d*\.mjs$/.test(f)).length >= 11);
});
