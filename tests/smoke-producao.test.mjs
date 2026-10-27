/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// O teste de fumaça do servidor real (deploy/smoke-producao.sh) passa quando tudo está certo e FALHA quando algo está errado.
// Sobe um servidor falso local (as lojas são "<slug>.localhost", que o curl resolve para 127.0.0.1) em vários modos.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';

const TIPOS = { apex: 'estetica_automotiva', dalforno: 'barbearia', offbox: 'barbearia' };

function servidor(modo) {
  return http.createServer((req, res) => {
    let slug = String(req.headers.host || '').split('.')[0];
    const caminho = req.url.split('?')[0];
    const r = (cod, corpo, tipo = 'application/json') => {
      const h = { 'Content-Type': tipo };
      if (modo !== 'sem-hsts') h['Strict-Transport-Security'] = 'max-age=31536000';
      res.writeHead(cod, h); res.end(corpo);
    };
    if (caminho === '/') return r(200, '<title>Agendz</title>', 'text/html');
    if (caminho.startsWith('/interno')) return r(modo === 'interno-aberto' ? 200 : 404, '');
    if (caminho === '/api/publico/loja') {
      if (modo === 'api-fora') return r(502, 'Bad Gateway', 'text/plain');
      if (modo === 'confia-no-forward' && req.headers['x-forwarded-host']) slug = String(req.headers['x-forwarded-host']).split('.')[0];
      if (modo === 'nao-criada') return r(404, JSON.stringify({ mensagem: 'Loja não encontrada' }));
      return r(200, JSON.stringify({ slug, nome: slug, tipo: TIPOS[slug] || '?' }));
    }
    if (caminho === '/api/auth/login') return r(modo === 'nao-criada' ? 404 : 401, '{"mensagem":"x"}');
    return r(modo === 'sem-auth' ? 200 : 401, '{}');
  });
}

async function rodar(modo) {
  const srv = servidor(modo);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const porta = srv.address().port;
  const proc = spawn('bash', ['deploy/smoke-producao.sh', `localhost:${porta}`], { env: { ...process.env, SMOKE_ESQUEMA: 'http' } });
  let saida = ''; proc.stdout.on('data', (d) => { saida += d; }); proc.stderr.on('data', (d) => { saida += d; });
  const codigo = await new Promise((ok) => proc.on('close', ok));
  srv.close();
  return { codigo, saida };
}

const temCurl = spawnSync('curl', ['--version']).status === 0;

test('smoke: passa com a loja ainda não criada e com a loja criada', { skip: !temCurl }, async () => {
  for (const modo of ['nao-criada', 'criada']) {
    const { codigo, saida } = await rodar(modo);
    assert.equal(codigo, 0, `${modo}: ${saida}`);
    assert.match(saida, /SMOKE OK/);
  }
});

test('smoke: falha quando algo está errado (API fora, cabeçalho forjado vale, /interno aberto, rota sem login, sem HSTS)', { skip: !temCurl }, async () => {
  for (const modo of ['api-fora', 'confia-no-forward', 'interno-aberto', 'sem-auth', 'sem-hsts']) {
    const { codigo, saida } = await rodar(modo);
    assert.equal(codigo, 1, `${modo} deveria falhar: ${saida}`);
    assert.match(saida, /FALHOU/);
  }
});
