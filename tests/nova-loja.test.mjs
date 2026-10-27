/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Loja nova só com subdomínio: Caddy com TLS sob demanda (liberado pela API) e o comando único deploy/nova-loja.sh.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const caddy = fs.readFileSync('deploy/Caddyfile', 'utf8');
const script = fs.readFileSync('deploy/nova-loja.sh', 'utf8');
const migracao = fs.readFileSync('backend/src/main/resources/db/migration/V1__lojas.sql', 'utf8').toString();

test('Caddy: TLS sob demanda só com a pergunta (ask) à API, e /interno nunca público', () => {
  assert.match(caddy, /on_demand_tls\s*\{\s*ask http:\/\/api:8080\/interno\/dominio-permitido\s*\}/);
  assert.match(caddy, /https:\/\/\s*\{[\s\S]*tls\s*\{\s*on_demand\s*\}/, 'bloco curinga com on_demand');
  const blocos = caddy.split(/\n(?=\S[^\n]*\{\n)/).filter((b) => /import seguranca/.test(b) && /root \* \/srv\/site/.test(b));
  assert.ok(blocos.length >= 2, 'bloco dos hosts fixos + bloco curinga');
  for (const b of blocos) assert.match(b, /handle \/interno\/\*\s*\{\s*respond 404/, 'cada bloco de site esconde /interno');
});

test('nova-loja.sh: nomes reservados iguais aos do banco; recusa subdomínio, reservado e tipo inválidos antes de tocar em qualquer coisa', () => {
  const doBanco = /slug NOT IN \(([^)]*)\)/.exec(migracao)[1].match(/'([^']+)'/g).map((x) => x.replaceAll("'", '')).sort();
  const doScript = /case "\$SLUG" in ([^)]*)\)/.exec(script)[1].split('|').sort();
  assert.deepEqual(doScript, doBanco);
  const roda = (...a) => spawnSync('bash', ['deploy/nova-loja.sh', ...a], { encoding: 'utf8' });
  for (const args of [['Barbearia X', 'X', 'barbearia', 'j', 'J'], ['api', 'X', 'barbearia', 'j', 'J'], ['-x', 'X', 'barbearia', 'j', 'J'], ['loja-x', 'X', 'padaria', 'j', 'J']]) {
    const r = roda(...args);
    assert.equal(r.status, 2, `${args[0]}/${args[2]}: ${r.stdout}${r.stderr}`);
  }
});
