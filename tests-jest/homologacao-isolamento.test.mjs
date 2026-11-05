/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('o gateway de homologação usa nomes exclusivos para as duas APIs', () => {
  const compose = readFileSync('deploy/homologacao/compose.yml', 'utf8');
  const caddy = readFileSync('deploy/homologacao/Caddyfile', 'utf8');
  const api = compose.split(/\n  api:\s*\n/)[1]?.split(/\n  admin-db:\s*\n/)[0] || '';
  const admin = compose.split(/\n  admin-api:\s*\n/)[1]?.split(/\n  gateway:\s*\n/)[0] || '';
  assert.match(api, /aliases:\s*\n\s*- agendz-homologacao-api(?:\s|$)/);
  assert.match(admin, /aliases:\s*\n\s*- agendz-homologacao-admin-api(?:\s|$)/);
  assert.match(caddy, /reverse_proxy agendz-homologacao-api:8080/);
  assert.match(caddy, /reverse_proxy agendz-homologacao-admin-api:8080/);
  assert.doesNotMatch(caddy, /reverse_proxy (?:api|admin-api):8080/);
  assert.match(compose, /networks:\s*\n\s*default:\s*\n\s*internal:\s*true/);
});
