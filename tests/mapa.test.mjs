// Mantém o mapa de migração em dia: todo método de api.js precisa aparecer em docs/MAPA-API-SPRING.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8').split('\n');
const mapa = fs.readFileSync(new URL('../docs/MAPA-API-SPRING.md', import.meta.url), 'utf8');
const IGNORAR = new Set(['store']); // relógio e ferramentas do protótipo, sem endpoint

test('todo método exportado de api.js aparece no mapa para o Spring Boot', () => {
  let grupo = null; const faltam = [];
  for (const l of api) {
    const g = l.match(/^export const (\w+) = \{/);
    if (g) { grupo = g[1]; continue; }
    if (/^\};?\s*$/.test(l)) { grupo = null; continue; }
    if (!grupo || IGNORAR.has(grupo)) continue;
    const m = l.match(/^  (\w+)\s*\(([^)]*)\)\s*\{/);
    if (m && !mapa.includes(m[1])) faltam.push(`${grupo}.${m[1]}`);
  }
  assert.deepEqual(faltam, [], 'métodos sem linha em docs/MAPA-API-SPRING.md: ' + faltam.join(', '));
});

test('o mapa de dados pessoais existe e registra a regra de nome e apelido em texto puro', () => {
  const dados = fs.readFileSync(new URL('../docs/MAPA-DADOS-PESSOAIS.md', import.meta.url), 'utf8');
  assert.match(dados, /nome e apelido ficam em texto puro/i);
  assert.match(dados, /CPF/);
});
