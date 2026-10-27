// Roda a suíte de equivalência de um tipo (ex.: barbearia): testes de unidade de tests-<tipo>/, build da variante e testes de navegador.
// Uso: node tools/rodar-testes-tipo.mjs barbearia [unidade|build|e2e]   (sem a etapa, roda as três; funciona igual no Windows)
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tipo = process.argv[2];
const etapa = process.argv[3] || 'tudo';
const pasta = `tests-${tipo}`;
if (!tipo || !existsSync(pasta)) { console.error(`Uso: node tools/rodar-testes-tipo.mjs <tipo> [unidade|build|e2e]  (pasta ${pasta}/ não existe; gere com tools/importar-testes-${tipo}.mjs)`); process.exit(1); }
const env = { ...process.env, AGENDZ_TIPO: tipo };
const arquivos = readdirSync(pasta);
let falhas = 0;
if (etapa === 'tudo' || etapa === 'unidade') {
  const u = arquivos.filter((f) => /\.test\.mjs$/.test(f)).map((f) => `${pasta}/${f}`);
  const r = spawnSync('node', ['--test', ...u], { env, stdio: 'inherit' });
  if (r.status !== 0) falhas++;
}
if (etapa === 'tudo' || etapa === 'build') {
  const r = spawnSync('node', ['build.mjs'], { env, stdio: 'inherit' });
  if (r.status !== 0) falhas++;
}
if (etapa === 'tudo' || etapa === 'e2e') {
  const e2e = arquivos.filter((f) => /^e2e\d*\.mjs$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const f of e2e) {
    const r = spawnSync('node', [`${pasta}/${f}`], { env, encoding: 'utf8', timeout: 180000 });
    const ok = r.status === 0;
    console.log(`${ok ? 'ok  ' : 'FALHOU'} ${f}`);
    if (!ok) {
      falhas++; const resto = (r.stdout || '').split('\n').slice(-12).join('\n');
      console.log(resto, r.stderr || '');
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=${f}::${(resto + ' ' + (r.stderr || '')).slice(-900).replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`); // anotação legível pela API
    }
  }
}
process.exit(falhas ? 1 : 0);
