/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Tipos de estabelecimento (F0, parte P1): catálogo, capacidades, rótulos, tipo imutável e texto sem rótulo fixo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { store, auth, estabelecimento, publico } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import {
  NOMES_CAPACIDADE, TIPOS, TIPO_PADRAO, artigo, cap, capAtiva, definirTipoAtivo, listaDeTipos, rot, Rot, rots, Rots, rotulo, tipoAtivo, tipoDe, tipoValido,
} from '../src/domain/tipos.js';

const entrarComo = (id) => { store.reiniciar(); assert.ok(auth.login({ identificador: id, senha: '1234' }).ok); };

test('catálogo: estética automotiva e barbearia vêm pré-cadastradas, com todas as capacidades e rótulos', () => {
  assert.deepEqual(Object.keys(TIPOS).sort(), ['barbearia', 'estetica_automotiva']);
  assert.equal(TIPO_PADRAO, 'estetica_automotiva');
  assert.deepEqual(listaDeTipos().map((t) => t.nome).sort(), ['Barbearia', 'Estética automotiva']);
  for (const t of Object.values(TIPOS)) {
    assert.deepEqual(Object.keys(t.capacidades).sort(), [...NOMES_CAPACIDADE].sort(), `capacidades de ${t.id}`);
    for (const c of NOMES_CAPACIDADE) assert.equal(typeof t.capacidades[c], 'boolean');
    for (const chave of ['profissional', 'recurso']) {
      const r = t.rotulos[chave];
      assert.ok(r && r.s && r.p && ['m', 'f'].includes(r.g), `rótulo ${chave} de ${t.id}`);
    }
    assert.ok(Object.isFrozen(t) && Object.isFrozen(t.capacidades), 'catálogo não pode ser alterado em execução');
  }
  assert.ok(Object.isFrozen(TIPOS));
});

test('tipoValido e tipoDe: só tipo conhecido; loja sem o campo (ou com valor estranho) cai no padrão', () => {
  assert.ok(tipoValido('barbearia') && tipoValido('estetica_automotiva'));
  for (const x of ['', 'academia', null, undefined, 7, {}, 'constructor', '__proto__', 'toString']) assert.equal(tipoValido(x), false, String(x));
  assert.equal(tipoDe({ tipo: 'barbearia' }), 'barbearia');
  assert.equal(tipoDe({}), TIPO_PADRAO);
  assert.equal(tipoDe(null), TIPO_PADRAO);
  assert.equal(tipoDe({ tipo: 'constructor' }), TIPO_PADRAO);
});

test('capacidades: a estética usa veículo, porte, box, vários dias e retirada; a barbearia não usa nenhum', () => {
  for (const c of NOMES_CAPACIDADE) { assert.equal(cap({ tipo: 'estetica_automotiva' }, c), true, c); assert.equal(cap({ tipo: 'barbearia' }, c), false, c); }
  assert.equal(cap({}, 'usaVeiculo'), true, 'loja antiga = estética');
  assert.equal(cap({ tipo: 'barbearia' }, 'capacidadeQueNaoExiste'), false);
});

test('rótulos e artigos: singular, plural, maiúscula e gênero de cada tipo', () => {
  const e = { tipo: 'estetica_automotiva' }; const b = { tipo: 'barbearia' };
  assert.equal(rotulo(e, 'profissional'), 'esteticista');
  assert.equal(rotulo(b, 'profissional'), 'barbeiro');
  assert.equal(rotulo(b, 'profissional', { plural: true }), 'barbeiros');
  assert.equal(rotulo(b, 'profissional', { capitalizado: true }), 'Barbeiro');
  assert.equal(rotulo(e, 'recurso', { plural: true, capitalizado: true }), 'Boxes');
  assert.equal(rotulo(b, 'recurso'), 'cadeira');
  assert.equal(artigo(e, 'recurso'), 'o');
  assert.equal(artigo(b, 'recurso'), 'a');
  assert.equal(artigo(b, 'recurso', { indefinido: true }), 'uma');
  assert.equal(rotulo(b, 'chave-que-nao-existe'), '');
});

test('tipo ativo: os atalhos seguem o tipo da loja do store e voltam ao padrão', () => {
  try {
    store.reiniciar();
    assert.equal(tipoAtivo(), 'estetica_automotiva');
    assert.deepEqual([rot('profissional'), Rot('profissional'), rots('profissional'), Rots('profissional')], ['esteticista', 'Esteticista', 'esteticistas', 'Esteticistas']);
    definirTipoAtivo({ tipo: 'barbearia' });
    assert.equal(capAtiva('usaVeiculo'), false);
    assert.deepEqual([rot('profissional'), Rot('profissional'), rots('profissional'), Rots('profissional')], ['barbeiro', 'Barbeiro', 'barbeiros', 'Barbeiros']);
    // textos de regras e mapas são lidos a cada uso (nada fica congelado no tipo da carga do módulo)
    assert.equal(R.papelRotulo({ papel: 'profissional' }), 'Barbeiro');
  } finally { definirTipoAtivo({}); }
  assert.equal(tipoAtivo(), TIPO_PADRAO);
});

test('o store avisa o tipo ativo a cada mudança de estado', () => {
  store.reiniciar();
  assert.equal(tipoAtivo(), 'estetica_automotiva');
  assert.equal(store.getState().estabelecimento.tipo, 'estetica_automotiva');
});

test('o tipo é definido na criação e nunca muda: a API recusa qualquer outro tipo, mesmo para o dono', () => {
  {
    entrarComo('davi');
    const antes = JSON.stringify(store.getState().estabelecimento);
    for (const novo of ['barbearia', 'academia', '', null, 7, {}]) {
      const r = estabelecimento.salvar({ tipo: novo, nome: 'Outro nome' });
      assert.equal(r.ok, false, `tipo ${JSON.stringify(novo)}`);
      assert.match(r.erros[0], /não pode ser alterado/);
    }
    assert.equal(JSON.stringify(store.getState().estabelecimento), antes, 'nada muda quando a troca é recusada (nem o nome enviado junto)');
    assert.equal(estabelecimento.salvar({ tipo: 'estetica_automotiva', nome: 'Apex Auto' }).ok, true, 'enviar o mesmo tipo é aceito');
    assert.equal(store.getState().estabelecimento.tipo, 'estetica_automotiva');
    assert.equal(estabelecimento.salvar({ nome: 'Apex' }).ok, true, 'sem o campo também é aceito');
  }
});

test('quem não tem permissão na loja recebe o erro de permissão antes de qualquer outra coisa', () => {
  entrarComo('pablo');
  const r = estabelecimento.salvar({ tipo: 'barbearia' });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /permissão/);
  assert.equal(store.getState().estabelecimento.tipo, 'estetica_automotiva');
});

test('a configuração pública informa o tipo, sem dados internos', () => {
  store.reiniciar();
  const cfg = publico.config();
  assert.equal(cfg.tipo, 'estetica_automotiva');
  assert.ok(!('cpf' in cfg) && !('comissaoPadrao' in cfg));
});

// ---------- texto sem rótulo fixo do profissional ----------
// Texto que o cliente ou a equipe lê não pode ter "esteticista" escrito direto: vem do rótulo do tipo (rot('profissional')).
// Fora da regra: ids, chaves de armazenamento, rotas e nomes de variável; templates.js (modelos da Meta, tratados por tipo na P2) e tipos.js.
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
const FORA = new Set(['domain/tipos.js', 'domain/templates.js']);
const foraDaRegra = (rel) => FORA.has(rel) || rel.startsWith('tipos/'); // pasta de cada tipo: o vocabulário próprio dele (modelos de mensagem, tema)
const arquivosFonte = () => {
  const out = [];
  const anda = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) anda(p); else if (/\.(js|jsx)$/.test(e.name) && !foraDaRegra(path.relative(RAIZ, p).replaceAll('\\', '/'))) out.push(p); });
  anda(RAIZ);
  return out;
};
const TERMO = /\besteticistas?\b/i;
const pareceId = (s) => !/\s/.test(s) && (/^[a-z][\w:.$\-{}]*$/.test(s) || /[/:]/.test(s));

test('estático: nenhum texto visível traz "esteticista" escrito fixo (usa rot/Rot/rots/Rots do tipo)', () => {
  const achados = [];
  for (const arq of arquivosFonte()) {
    fs.readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(linha)) return;
      const sem = linha.replace(/\/\/.*$/, '');
      const onde = `${path.relative(RAIZ, arq)}:${i + 1}`;
      for (const m of sem.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) { const s = m[1] ?? m[2]; if (TERMO.test(s) && !pareceId(s)) achados.push(`${onde}: ${s.slice(0, 70)}`); }
      for (const m of sem.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
        const texto = m[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '\u0000'); // só o texto fixo, sem as expressões
        for (const parte of texto.split('\u0000')) if (TERMO.test(parte) && (/\s/.test(parte) || /^[A-ZÀ-Ú]/.test(parte))) achados.push(`${onde}: ${parte.slice(0, 70)}`);
      }
      for (const m of sem.matchAll(/>([^<>{}]*[A-Za-zÀ-ú][^<>{}]*)</g)) if (TERMO.test(m[1])) achados.push(`${onde}: ${m[1].slice(0, 70)}`);
      if (!/[<>{}=;()!&|:]/.test(sem) && TERMO.test(sem) && /^\s+[A-Za-zÀ-ú]/.test(sem)) achados.push(`${onde}: (texto JSX) ${sem.trim().slice(0, 70)}`);
    });
  }
  assert.deepEqual(achados, [], `texto fixo do profissional (troque por rot('profissional')):\n${achados.join('\n')}`);
});

test('estático: o catálogo de tipos é a única fonte dos rótulos do profissional e do recurso', () => {
  const fixos = [];
  for (const arq of arquivosFonte()) {
    if (/^seed(-barbearia)?\.js$/.test(path.basename(arq)) || path.relative(RAIZ, arq).startsWith('tipos/')) continue; // nomes de exemplo de box e de pessoas são dados, não rótulo
    fs.readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => { if (/\bbarbeiros?\b/i.test(linha.replace(/\/\/.*$/, ''))) fixos.push(`${path.relative(RAIZ, arq)}:${i + 1}`); });
  }
  assert.deepEqual(fixos, [], 'a palavra "barbeiro" só existe no catálogo (domain/tipos.js)');
});
