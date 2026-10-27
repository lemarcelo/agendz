// Uso: node tools/verificar-autoria.mjs <arquivo.html|.js|.zip descompactado ...>
// Procura as marcas deste projeto num arquivo suspeito e confere a assinatura com a sua chave secreta.
import fs from 'node:fs';
import { assinaturaDe, decodificarZw, lerSegredo, tagDeArquivo } from './autoria.mjs';

const segredo = lerSegredo(process.cwd());
if (!segredo) { console.error('Sem chave: defina AUTORIA_SEGREDO ou deixe segredo-autoria.txt ao lado da pasta do projeto.'); process.exit(2); }
let achou = false;
for (const arq of process.argv.slice(2)) {
  const t = fs.readFileSync(arq, 'utf8');
  const marcas = [...t.matchAll(/AGENDZ-MARCA id=([0-9a-f]{10}) sig=([0-9a-f]{32})/g)];
  for (const [, id, sig] of marcas) {
    const ok = assinaturaDe(segredo, id) === sig;
    console.log(`${arq}: marca de build ${id} — assinatura ${ok ? 'VÁLIDA (saiu do seu projeto)' : 'inválida (marca forjada ou chave errada)'}`);
    if (ok) achou = true;
  }
  const zw = decodificarZw(t);
  if (zw.length) console.log(`${arq}: ${zw.length} marca(s) invisível(is) no texto: ${[...new Set(zw)].join(', ')}${marcas.some((m) => zw.includes(m[1])) ? ' (batem com a marca do build)' : ''}`);
  for (const m of t.matchAll(/© \d{4} Marcelo — Agendz[^\n]*?ref:([0-9a-f]{10})/g)) {
    console.log(`${arq}: cabeçalho de direitos autorais, ref ${m[1]}`);
  }
  if (!marcas.length && !zw.length) console.log(`${arq}: nenhuma marca encontrada (podem ter sido removidas; compare trechos de código e textos).`);
}
process.exit(achou ? 0 : 1);
