/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B3: teste estático que assegura que o domínio base não está hardcoded nas telas nem na lógica de front do Agendz.
import { test } from '@jest/globals';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));

function listarArquivos(dir, extensoes) {
  const itens = readdirSync(join(raiz, dir), { recursive: true });
  return itens
    .filter((f) => extensoes.some((ext) => f.endsWith(ext)) && !statSync(join(raiz, dir, f)).isDirectory())
    .map((f) => join(dir, f).replace(/\\/g, '/'));
}

test('nenhum arquivo de código em src/ tem agendz.io fixo', () => {
  const fontes = listarArquivos('src', ['.js', '.jsx']);
  for (const f of fontes) {
    const conteudo = readFileSync(join(raiz, f), 'utf8');
    assert.ok(
      !conteudo.includes("'agendz.io'") && !conteudo.includes('"agendz.io"'),
      `${f} contém o domínio fixo 'agendz.io'`
    );
  }
});
