// Põe (ou atualiza) um cabeçalho de direitos autorais em cada arquivo de src/. A referência é a assinatura do caminho do arquivo:
// quem copiar o código com o cabeçalho leva a prova junto; quem tirar o cabeçalho deixa o resto do código sem ele (e o build ainda carrega a marca).
import fs from 'node:fs';
import path from 'node:path';
import { lerSegredo, tagDeArquivo } from './autoria.mjs';

const raiz = process.cwd();
const segredo = lerSegredo(raiz);
if (!segredo) { console.error('Sem chave de autoria: não reescrevo os cabeçalhos (eles ficariam com referência genérica e apagariam a rastreabilidade). Defina AUTORIA_SEGREDO ou deixe segredo-autoria.txt ao lado da pasta.'); process.exit(2); }
const ANO = new Date().getFullYear();
let n = 0;
for (const rel of fs.readdirSync(path.join(raiz, 'src'), { recursive: true })) {
  if (!/\.(js|jsx|css)$/.test(rel)) continue;
  const arq = path.join(raiz, 'src', rel);
  const caminho = `src/${rel}`;
  const cab = `/* © ${ANO} Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:${tagDeArquivo(segredo, caminho)} */`;
  let t = fs.readFileSync(arq, 'utf8');
  const novo = /^\/\* © \d{4} Marcelo — Agendz[^\n]*\*\/\n/.test(t) ? t.replace(/^\/\* © \d{4} Marcelo — Agendz[^\n]*\*\/\n/, `${cab}\n`) : `${cab}\n${t}`;
  if (novo !== t) { fs.writeFileSync(arq, novo); n++; }
}
console.log(`cabeçalho de autoria em ${n} arquivo(s)${segredo ? '' : ' (sem chave: referência genérica)'}`);
