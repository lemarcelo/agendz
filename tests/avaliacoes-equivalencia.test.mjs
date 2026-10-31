/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Os MESMOS casos que o servidor roda em AvaliacoesEquivalenciaTest (backend/src/test/resources/equivalencia/avaliacoes.json): nota, texto, anonimato, motivo,
// modelo de mensagem, média, período e telefone de WhatsApp. Regra de avaliação nova entra nos dois lados e no JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aplicarModelo, lerPeriodo, resumir, telefoneMascarado, validarAvaliacao, validarModelo, validarMotivo } from '../src/domain/avaliacoes.js';
import { numeroWhatsapp } from '../src/domain/whatsapp.js';

const dados = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/avaliacoes.json', import.meta.url), 'utf8'));

test('fixture carregada', () => {
  assert.ok(dados.validar.length >= 20 && dados.modelo.length >= 10 && dados.periodo.length >= 10 && dados.whatsapp.length >= 6);
});

test('validar: nota, texto e anonimato', () => {
  for (const c of dados.validar) {
    const entrada = c.entrada && !Array.isArray(c.entrada) && c.repetirTexto ? { ...c.entrada, texto: 'a'.repeat(c.repetirTexto) } : c.entrada;
    const r = validarAvaliacao(entrada);
    const obtido = r.ok ? { ok: true, dados: r.dados } : { ok: false, erro: r.erro };
    assert.deepEqual(obtido, c.esperado, c.nome);
  }
});

test('motivo de ocultar: 5 a 200 letras', () => {
  for (const c of dados.motivo) {
    const r = validarMotivo(c.repetir ? 'a'.repeat(c.repetir) : c.entrada);
    assert.deepEqual(r.ok ? { ok: true, motivo: r.motivo } : { ok: false }, c.esperado, c.nome);
  }
});

test('modelo da mensagem em lote', () => {
  for (const c of dados.modelo) {
    const r = validarModelo(c.repetir ? 'a'.repeat(c.repetir) : c.modelo, c.tipo);
    assert.deepEqual(r.ok ? { ok: true, modelo: r.modelo } : { ok: false, erro: r.erro }, c.esperado, c.nome);
  }
});

test('aplicar o modelo: primeiro nome, loja e link', () => {
  for (const c of dados.aplicar) assert.equal(aplicarModelo(c.modelo, c.dados), c.esperado, c.nome);
});

test('resumo: média com uma casa e distribuição', () => {
  for (const c of dados.resumo) {
    const r = resumir(c.notas.map((nota) => ({ nota })));
    assert.deepEqual({ total: r.total, media: r.media, distribuicao: [1, 2, 3, 4, 5].map((n) => r.distribuicao[n]) }, c.esperado, JSON.stringify(c.notas));
  }
});

test('período: datas válidas, ordem e no máximo 366 dias', () => {
  for (const c of dados.periodo) {
    const p = lerPeriodo({ de: c.de ?? undefined, ate: c.ate ?? undefined });
    assert.deepEqual(p.erro ? { erro: p.erro } : { ok: true, semLimite: !Number.isFinite(p.ini) }, c.esperado, c.nome);
  }
});

test('telefone: número do wa.me e máscara', () => {
  for (const c of dados.whatsapp) {
    assert.equal(numeroWhatsapp(c.telefone), c.numero, c.nome);
    assert.equal(telefoneMascarado(c.telefone), c.mascarado, c.nome);
  }
});
