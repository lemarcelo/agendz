/* © 2026 Marcelo — Agendz. Todos os direitos reservados. ref:0000000000 */
import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const testeLinux = process.platform === 'win32' ? test.skip : test;
testeLinux('atualização de homologação preserva dados e reverte após falhas', () => {
  const r = spawnSync('bash', ['deploy/homologacao/testar-atualizacao.sh'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr || r.error?.message || 'Falha na simulação');
  assert.match(r.stdout, /restauração após falha verificadas/);
});
