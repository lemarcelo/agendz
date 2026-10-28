// Roda a suíte de equivalência de um tipo (ex.: barbearia): testes de unidade de tests-<tipo>/, build da variante e testes de navegador.
// Uso: node tools/rodar-testes-tipo.mjs barbearia [unidade|build|e2e]   (sem a etapa, roda as três; funciona igual no Windows)
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { rodarLote, fatiar } from './lote-e2e.mjs';
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
  const todos = arquivos.filter((f) => /^e2e\d*\.mjs$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const e2e = fatiar(todos); // E2E_FRACAO=i/n e E2E_PARALELO=k: veja tools/lote-e2e.mjs
  if (process.env.E2E_FRACAO) console.log(`Fatia ${process.env.E2E_FRACAO}: ${e2e.length} de ${todos.length} testes`);
  falhas += await rodarLote(e2e.map((f) => ({ nome: f, caminho: `${pasta}/${f}` })), { env });
}
process.exit(falhas ? 1 : 0);
