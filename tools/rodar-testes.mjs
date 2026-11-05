// Roda todos os testes de unidade de tests/*.test.mjs de forma portável entre Linux, Mac e Windows.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arquivos = readdirSync('tests').filter((f) => f !== 'estatico.test.mjs' && /\.test\.mjs$/.test(f)).map((f) => `tests/${f}`);
const r = spawnSync(process.execPath, ['--test', ...arquivos], { stdio: 'inherit' });
process.exit(r.status ?? (r.error ? 1 : 0));
