/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// O catálogo de serviços do primeiro acesso (backend/.../catalogo/<tipo>.json) é derivado dos seeds do front e respeita os limites do servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPOS_DO_CATALOGO, caminhoDoCatalogo, catalogoDoTipo, textoDoCatalogo } from '../tools/gerar-catalogo.mjs';
import { TIPOS } from '../src/domain/tipos.js';

test('há catálogo para todos os tipos de estabelecimento (e só para eles)', () => {
  assert.deepEqual([...TIPOS_DO_CATALOGO].sort(), Object.keys(TIPOS).sort());
});

test('os arquivos do back-end são iguais ao que os seeds geram (rode node tools/gerar-catalogo.mjs se falhar)', () => {
  for (const t of TIPOS_DO_CATALOGO) assert.equal(readFileSync(caminhoDoCatalogo(t), 'utf8'), textoDoCatalogo(t), `catálogo de ${t} desatualizado`);
});

test('cada item cabe nas regras do servidor (ServicoController): chaves únicas, preço e duração dentro do teto, portes conhecidos', () => {
  const PORTES = ['pequeno', 'medio', 'grande', 'suv', 'pickup'];
  for (const t of TIPOS_DO_CATALOGO) {
    const { servicos } = catalogoDoTipo(t);
    assert.ok(servicos.length >= 3, `${t}: poucos exemplos`);
    assert.equal(new Set(servicos.map((s) => s.chave)).size, servicos.length, `${t}: chave repetida`);
    assert.equal(new Set(servicos.map((s) => s.nome.toLowerCase())).size, servicos.length, `${t}: nome repetido`);
    for (const s of servicos) {
      assert.match(s.chave, /^[a-z0-9-]{1,40}$/);
      assert.ok(s.nome.length >= 2 && s.nome.length <= 100);
      assert.ok(s.preco >= 0 && s.preco <= 100000 && s.duracaoMin >= 1 && s.duracaoMin <= 14400 && s.intervaloMin >= 0 && s.intervaloMin <= 600, `${t}/${s.chave}: valor fora do limite`);
      for (const mapa of [s.precos, s.duracoes].filter(Boolean)) assert.deepEqual(Object.keys(mapa).sort(), [...PORTES].sort(), `${t}/${s.chave}: portes`);
    }
  }
});

test('o catálogo de cada tipo não traz serviço de outro tipo (barbearia sem lavagem, estética sem corte)', () => {
  const nomes = (t) => catalogoDoTipo(t).servicos.map((s) => s.nome).join('|').toLowerCase();
  assert.ok(!/lavagem|polimento/.test(nomes('barbearia')));
  assert.ok(!/corte|barba/.test(nomes('estetica_automotiva')));
});

test('o expediente sugerido de cada tipo tem 7 dias, ao menos um aberto, faixas HH:MM em ordem e sem sobreposição', () => {
  for (const t of TIPOS_DO_CATALOGO) {
    const { semana } = catalogoDoTipo(t).expediente;
    assert.deepEqual(Object.keys(semana).sort(), ['0', '1', '2', '3', '4', '5', '6']);
    assert.ok(Object.values(semana).some((d) => d.aberto), `${t}: nenhum dia aberto`);
    for (const d of Object.values(semana)) {
      assert.equal(d.aberto, d.faixas.length > 0);
      assert.ok(d.faixas.length <= 6);
      let fim = '';
      for (const [a, b] of d.faixas) {
        assert.match(a, /^([01]\d|2[0-3]):[0-5]\d$/); assert.match(b, /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/);
        assert.ok(a < b && a >= fim, `${t}: faixa ${a}-${b} fora de ordem ou sobreposta`);
        fim = b;
      }
    }
  }
});
