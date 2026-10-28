// Roda os testes de navegador; falha se algum falhar. Em fatias e/ou em paralelo com E2E_FRACAO=i/n e E2E_PARALELO=k (veja tools/lote-e2e.mjs).
import { readdirSync } from 'node:fs';
import { rodarLote, fatiar } from '../tools/lote-e2e.mjs';
const todos = readdirSync(new URL('.', import.meta.url)).filter((f) => /^e2e\d*\.mjs$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const arquivos = fatiar(todos, process.env.E2E_FRACAO, 'tests');
if (process.env.E2E_FRACAO) console.log(`Fatia ${process.env.E2E_FRACAO}: ${arquivos.length} de ${todos.length} testes`);
process.exit((await rodarLote(arquivos.map((f) => ({ nome: f, caminho: `tests/${f}` })))) ? 1 : 0);
