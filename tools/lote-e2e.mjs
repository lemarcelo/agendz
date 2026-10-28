// Roda uma lista de testes de navegador (cada um é um `node arquivo`), com fatia e paralelismo opcionais. Usado por tests/run-e2e.mjs e tools/rodar-testes-tipo.mjs.
//   E2E_FRACAO=i/n  → roda só a fatia i de n (divisão equilibrada pelo tempo de cada teste, veja `fatiar`): o CI divide os testes entre vários jobs.
//   E2E_PARALELO=k  → k testes ao mesmo tempo (cada um abre o próprio navegador e usa porta livre); padrão 1 = em sequência.
// Falha se algum teste falhar; a saída de cada teste sai inteira, sem misturar com a de outro.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Pesos (segundos, aproximados) de cada teste em tools/tempos-e2e.json, chave "pasta/arquivo". Teste novo, sem peso, vale a mediana dos conhecidos.
// As fatias são montadas por "maior primeiro" (cada teste vai para a fatia mais leve até agora): dá fatias de duração parecida e é determinístico,
// então todos os jobs do CI chegam à mesma divisão. Sem o arquivo de pesos, cai no revezamento simples.
function lerPesos() {
  try { return JSON.parse(readFileSync(new URL('./tempos-e2e.json', import.meta.url), 'utf8')); } catch { return {}; }
}

export function fatiar(arquivos, fracao = process.env.E2E_FRACAO, pasta = 'tests', pesos = lerPesos()) {
  const m = /^(\d+)\/(\d+)$/.exec(fracao || '');
  if (!m) { if (fracao) throw new Error(`E2E_FRACAO inválida: ${fracao} (use i/n, de 1 a n)`); return arquivos; }
  const [i, n] = [Number(m[1]), Number(m[2])];
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`E2E_FRACAO inválida: ${fracao} (use i/n, de 1 a n)`);
  const conhecidos = arquivos.map((f) => pesos[`${pasta}/${f}`]).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const padrao = conhecidos.length ? conhecidos[Math.floor(conhecidos.length / 2)] : 1;
  const peso = (f) => { const x = pesos[`${pasta}/${f}`]; return Number.isFinite(x) && x > 0 ? x : padrao; };
  const carga = Array(n).fill(0); const dono = new Map();
  arquivos.map((f, k) => ({ f, k, p: peso(f) })).sort((a, b) => b.p - a.p || a.k - b.k).forEach(({ f, p }) => {
    let alvo = 0; for (let j = 1; j < n; j++) if (carga[j] < carga[alvo]) alvo = j;
    carga[alvo] += p; dono.set(f, alvo);
  });
  return arquivos.filter((f) => dono.get(f) === i - 1);
}

const rodar = (caminho, env) => new Promise((ok) => {
  const p = spawn('node', [caminho], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let saida = '', erro = '';
  const t = setTimeout(() => p.kill('SIGKILL'), 180000);
  p.stdout.on('data', (d) => { saida += d; });
  p.stderr.on('data', (d) => { erro += d; });
  p.on('close', (status) => { clearTimeout(t); ok({ status, saida, erro }); });
});

export async function rodarLote(itens, { env = process.env, paralelo = Number(process.env.E2E_PARALELO) || 1 } = {}) {
  let falhas = 0, proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const { nome, caminho } = itens[proximo++];
      const t0 = Date.now();
      const r = await rodar(caminho, env);
      const ok = r.status === 0;
      console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome} (${Math.round((Date.now() - t0) / 100) / 10}s)`);
      if (!ok) {
        falhas++;
        const resto = r.saida.split('\n').slice(-12).join('\n');
        console.log(resto, r.erro);
        if (process.env.GITHUB_ACTIONS) console.log(`::error title=${nome}::${(resto + ' ' + r.erro).slice(-900).replace(/%/g, '%25').replace(/\r?\n/g, '%0A')}`); // anotação legível pela API do GitHub
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(paralelo, itens.length || 1)) }, trabalhador));
  return falhas;
}
