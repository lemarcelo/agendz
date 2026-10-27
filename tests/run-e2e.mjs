// Roda todos os testes de navegador em sequência; falha se algum falhar.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const arquivos = readdirSync(new URL('.', import.meta.url)).filter((f) => /^e2e\d*\.mjs$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
let falhas = 0;
for (const f of arquivos) {
  const r = spawnSync('node', [`tests/${f}`], { encoding: 'utf8', timeout: 180000 });
  const ok = r.status === 0;
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${f}`);
  if (!ok) {
    falhas++; const resto = (r.stdout || '').split('\n').slice(-12).join('\n');
    console.log(resto, r.stderr || '');
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=${f}::${(resto + ' ' + (r.stderr || '')).slice(-900).replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`); // anotação legível pela API do GitHub
  }
}
process.exit(falhas ? 1 : 0);
