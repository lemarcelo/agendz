/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// As logos que o script de provisionamento grava em produção (deploy/logos/*.txt) são exatamente as do front e passam na regra do banco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOGOS_DEPLOY } from '../tools/gerar-logos-deploy.mjs';
import { logoValida } from '../src/domain/tema.js';

test('deploy/logos/*.txt são iguais às logos do front (rode tools/gerar-logos-deploy.mjs se falhar)', () => {
  for (const [slug, logo] of Object.entries(LOGOS_DEPLOY)) {
    const arquivo = readFileSync(`deploy/logos/${slug}.txt`, 'utf8');
    assert.equal(arquivo, `${logo}\n`, `logo de ${slug} desatualizada`);
    assert.ok(logoValida(logo), `logo de ${slug} inválida`);
    // mesma regra da constraint loja_logo_valida (V3): png/jpeg/webp em base64, até 140000 caracteres, sem aspas
    assert.match(logo, /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
  }
});
