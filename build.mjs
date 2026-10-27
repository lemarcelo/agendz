import { build } from 'esbuild';
import fs from 'node:fs';
import { gerarMarcas, lerSegredo } from './tools/autoria.mjs';
// Marca de autoria do build: id + assinatura (só quem tem a chave gera) + marca invisível nos textos. Sem chave, o build sai igual, com marca genérica.
const segredo = lerSegredo();
if (!segredo) console.warn('aviso: sem chave de autoria (AUTORIA_SEGREDO ou ../segredo-autoria.txt); o build sai sem assinatura verificável.');
const marcas = gerarMarcas({ segredo, versao: JSON.parse(fs.readFileSync('package.json', 'utf8')).version || 'sem-versao' });
// Tipo da loja de exemplo do build (AGENDZ_TIPO=barbearia gera dist/agenda-barbearia.html e dist/index-barbearia.html); sem a variável, o padrão (estética).
const tipo = process.env.AGENDZ_TIPO || '';
const sufixo = tipo ? `-${tipo}` : '';
// Domínio da plataforma neste build (AGENDZ_DOMINIO=exemplo.com.br): `apex.exemplo.com.br` abre a loja `apex`, `dalforno.exemplo.com.br` a `dalforno` (domain/tenant.js).
const dominio = (process.env.AGENDZ_DOMINIO || '').trim().toLowerCase();
// AGENDZ_API=real: build do SITE PUBLICADO, com o cliente HTTP da API real (src/main-real.jsx) → dist/index-real.html. Sem a variável (o padrão), o app
// usa a API simulada, sem rede (Artifact e testes). O arquivo com `fetch` só entra no build real (tests/estatico.test.mjs vigia).
const real = process.env.AGENDZ_API === 'real' || process.argv.includes('--real');
const hosts = (process.env.AUTORIA_HOSTS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const r = await build({
  entryPoints: [real ? 'src/main-real.jsx' : 'src/main.jsx'], bundle: true, minify: true, format: 'iife', write: false, jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"', __MARCA_ID__: JSON.stringify(marcas.id), __MARCA_SIG__: JSON.stringify(marcas.sig), __MARCA_ZW__: JSON.stringify(marcas.zw), __HOSTS_LICENCIADOS__: JSON.stringify(hosts), __AGENDZ_TIPO__: JSON.stringify(tipo), __AGENDZ_DOMINIO__: JSON.stringify(dominio) }, loader: { '.css': 'text' }, target: ['es2020'], legalComments: 'none', charset: 'utf8', banner: { js: `/*! AGENDZ-MARCA id=${marcas.id} sig=${marcas.sig} © Marcelo, todos os direitos reservados */` },
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// CSS: o geral (src/styles.css) + o tema de cada tipo (src/tipos/<tipo>/tema.css, em ordem alfabética).
const temasDosTipos = fs.readdirSync('src/tipos', { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(`src/tipos/${d.name}/tema.css`)).map((d) => d.name).sort();
const css = [fs.readFileSync('src/styles.css', 'utf8'),  ...temasDosTipos.map((t) => fs.readFileSync(`src/tipos/${t}/tema.css`, 'utf8'))].join('\n');
const html = `<title>Agendz</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Bricolage+Grotesque:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="raiz"></div>
<script>${js}</script>
`;
fs.mkdirSync('dist', { recursive: true });
const pagina = (h) => '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + h + '</body></html>';
if (real) {
  fs.writeFileSync(`dist/index-real${sufixo}.html`, pagina(html));
  console.log('ok (site real)', (html.length / 1024).toFixed(0), 'KB');
  process.exit(0);
}
fs.writeFileSync(`dist/agenda${sufixo}.html`, html);
console.log('ok', (html.length / 1024).toFixed(0), 'KB');
fs.writeFileSync(`dist/index${sufixo}.html`, pagina(html));
