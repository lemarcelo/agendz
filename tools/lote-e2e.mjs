// Roda uma lista de testes de navegador (cada um é um `node arquivo`), com fatia e paralelismo opcionais. Usado por tests/run-e2e.mjs e tools/rodar-testes-tipo.mjs.
//   E2E_FRACAO=i/n  → roda só a fatia i de n (arquivos nas posições i-1, i-1+n, ...): o CI divide os testes entre vários jobs.
//   E2E_PARALELO=k  → k testes ao mesmo tempo (cada um abre o próprio navegador e usa porta livre); padrão 1 = em sequência.
// Falha se algum teste falhar; a saída de cada teste sai inteira, sem misturar com a de outro.
import { spawn } from 'node:child_process';

export function fatiar(arquivos, fracao = process.env.E2E_FRACAO) {
  const m = /^(\d+)\/(\d+)$/.exec(fracao || '');
  if (!m) return arquivos;
  const [i, n] = [Number(m[1]), Number(m[2])];
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`E2E_FRACAO inválida: ${fracao} (use i/n, de 1 a n)`);
  return arquivos.filter((_, k) => k % n === i - 1);
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
      const r = await rodar(caminho, env);
      const ok = r.status === 0;
      console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`);
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
