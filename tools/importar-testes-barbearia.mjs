// Importa os testes da Agenda Barbearia (v64) para tests-barbearia/, SEM mudar regra: só o vocabulário interno do Agendz.
// Uso: node tools/importar-testes-barbearia.mjs <pasta-do-projeto-da-barbearia>
// O mapa de vocabulário (ids internos) é a ÚNICA transformação; ela está em docs/EQUIVALENCIA-BARBEARIA.md. Os textos que o usuário vê
// (mensagens, rótulos, títulos de teste) NÃO são trocados: o tipo barbearia do Agendz tem de produzir os mesmos textos da barbearia.
import fs from 'node:fs';
import path from 'node:path';

const origem = process.argv[2];
if (!origem || !fs.existsSync(path.join(origem, 'tests'))) { console.error('Uso: node tools/importar-testes-barbearia.mjs <pasta-da-barbearia>'); process.exit(1); }
const destino = new URL('../tests-barbearia/', import.meta.url).pathname;

// ---- mapa de vocabulário interno (barbearia → Agendz) ----
const MAPA_ID = [
  [/Barbeiros/g, 'Profissionais'], [/barbeiros/g, 'profissionais'], [/Barbeiro/g, 'Profissional'], [/barbeiro/g, 'profissional'],
  [/ConfirmacaoCorte/g, 'ConfirmacaoServico'], [/confirmacaoCorte/g, 'confirmacaoServico'], [/ConfirmarCorte/g, 'ConfirmarServico'], [/confirmarCorte/g, 'confirmarServico'],
];
const emCodigo = (s) => MAPA_ID.reduce((t, [r, p]) => t.replace(r, p), s);
// dentro de texto: só id (sem espaço) e só em minúsculas; "Barbeiro" com maiúscula é rótulo que o usuário vê e não muda
const MAPA_TXT = [[/barbeiros/g, 'profissionais'], [/barbeiro/g, 'profissional'], [/confirmacaoCorte/g, 'confirmacaoServico'], [/confirmarCorte/g, 'confirmarServico'], [/--brass/g, '--acento']];
const emTexto = (s) => MAPA_TXT.reduce((t, [r, p]) => t.replace(r, p), s);
const ehId = (s) => !/\s/.test(s) || /^[.#[]/.test(s) || /data-testid/.test(s);

function mapear(src) {
  let i = 0, out = ''; const n = src.length;
  const palavraAnterior = () => /(?:^|[^\w$])(return|typeof|case|in|of|do|else|void|delete|throw|new)\s*$/.test(out);
  function template() { // devolve o texto do template com o mapa nas partes sem espaço e dentro de ${}
    let j = i + 1, res = '`', txt = '';
    const solta = () => { if (txt) { res += ehId(txt) ? emTexto(txt) : txt; txt = ''; } };
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') { txt += src[j] + src[j + 1]; j += 2; continue; }
      if (src[j] === '$' && src[j + 1] === '{') {
        solta(); let d = 1, k = j + 2; const ini = k;
        while (k < n && d > 0) {
          const c = src[k];
          if (c === '{') d++; else if (c === '}') d--;
          else if (c === "'" || c === '"') { const q = c; k++; while (k < n && src[k] !== q) { if (src[k] === '\\') k++; k++; } }
          else if (c === '`') { let m = k + 1; while (m < n && src[m] !== '`') { if (src[m] === '\\') m++; m++; } k = m; }
          k++;
        }
        res += '${' + mapear(src.slice(ini, k - 1)) + '}'; j = k; continue;
      }
      txt += src[j]; j++;
    }
    solta(); res += '`'; i = j + 1; return res;
  }
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') { const f = src.indexOf('\n', i); const e = f < 0 ? n : f; out += src.slice(i, e); i = e; continue; }
    if (c === '/' && c2 === '*') { const e = src.indexOf('*/', i + 2) + 2; out += src.slice(i, e); i = e; continue; }
    if (c === '`') { out += template(); continue; }
    if (c === "'" || c === '"') {
      let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      const conteudo = src.slice(i + 1, j);
      out += c + (ehId(conteudo) ? emTexto(conteudo) : conteudo) + c; i = j + 1; continue;
    }
    if (c === '/') { // regex ou divisão
      const ant = out.trimEnd().slice(-1);
      if (!ant || '(,=:[!&|?{};'.includes(ant) || palavraAnterior()) {
        let j = i + 1, classe = false; while (j < n) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') classe = true; else if (src[j] === ']') classe = false; else if (src[j] === '/' && !classe) break; else if (src[j] === '\n') break; j++; }
        j++; while (/[a-z]/i.test(src[j] || '')) j++;
        out += src.slice(i, j); i = j; continue;
      }
    }
    // código: junta até o próximo delimitador especial e mapeia os identificadores
    let j = i; while (j < n && !"'\"`/".includes(src[j])) j++;
    if (j === i) { out += c; i++; continue; }
    out += emCodigo(src.slice(i, j)); i = j;
  }
  return out;
}

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
const arquivos = fs.readdirSync(path.join(origem, 'tests')).filter((f) => /\.mjs$/.test(f) && !/^(dbg|shot|run-e2e)\.mjs$/.test(f));
let contados = 0;
for (const f of arquivos) {
  let t = mapear(fs.readFileSync(path.join(origem, 'tests', f), 'utf8'));
  // a lista de chaves é comparada depois de `.sort()`: ao trocar o nome do id, a ordem alfabética muda (a regra testada é a mesma: só { inicio, profissionalId })
  t = t.replaceAll("['profissionalId', 'inicio']", "['inicio', 'profissionalId']");
  t = t.replaceAll('../dist/index.html', '../dist/index-barbearia.html').replaceAll('dist/agenda.html', 'dist/agenda-barbearia.html')
    .replaceAll('AGENDA-BARBEARIA-MARCA', 'AGENDZ-MARCA').replaceAll('Agenda Barbearia', 'Agendz');
  fs.writeFileSync(path.join(destino, f), t); contados++;
}
console.log(`${contados} arquivos em tests-barbearia/ (mapa de vocabulário aplicado; regras e textos intactos)`);
