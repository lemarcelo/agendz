/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Equivalência simulada × real (F2 parte 5a): os MESMOS casos de agenda (criar, remarcar, status, conflito, expediente) rodam aqui, na API
// simulada, e no servidor (AgendaEquivalenciaTest, no CI). Cenário na barbearia Dalforno (sem veículo nem box); ver "descricao" do arquivo.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { store, auth, agenda, clientes, servicos, equipe, estabelecimento } from '../src/services/api.js';

const fixture = JSON.parse(readFileSync(new URL('../backend/src/test/resources/equivalencia/agenda.json', import.meta.url), 'utf8'));
const HOJE = '2026-10-12T07:00:00-03:00'; // segunda-feira
const DIA = 86400000;

// "quando" → instante. São Paulo não tem horário de verão desde 2019: -03:00 fixo.
function quando({ semanas, dow, hora }) {
  const base = new Date(HOJE);
  const ymd = new Date(base.getTime() - 3 * 3600000 + semanas * 7 * DIA); // relógio de parede de SP como se fosse UTC
  const atras = (dow - ymd.getUTCDay() + 7) % 7;
  const d = new Date(ymd.getTime() + atras * DIA);
  const [h, m] = hora.split(':').map(Number);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h + 3, m);
}

let ctx;
function preparar() {
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date(HOJE) });
  store.reiniciar();
  store.entrarNaLoja('dalforno');
  assert.ok(auth.login({ identificador: 'alan', senha: '1234' }).ok);
  const c = fixture.cenario;
  const semana = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, c.escala[d] ? { aberto: true, faixas: c.escala[d] } : { aberto: false, faixas: [] }]));
  const e = estabelecimento.salvar({ escala: { semana } });
  assert.ok(e.ok, JSON.stringify(e));
  ctx = { clientes: {}, servicos: {}, profs: { alan: 'u-alan' } };
  for (const [k, v] of Object.entries(c.clientes)) { const r = clientes.salvar(v); assert.ok(r.ok, JSON.stringify(r)); ctx.clientes[k] = r.cliente.id; }
  for (const [k, v] of Object.entries(c.servicos)) { const r = servicos.salvar({ nome: v.nome, preco: v.preco, duracao: v.duracaoMin, intervalo: v.intervaloMin }); assert.ok(r.ok, JSON.stringify(r)); ctx.servicos[k] = r.servico.id; }
  const p = equipe.salvar({ ...c.profissional, papel: 'profissional', senha: 'senha-fixa-1' });
  assert.ok(p.ok, JSON.stringify(p));
  ctx.profs.pro = p.usuario.id;
}

test.beforeEach(preparar);

test('há casos suficientes para valer como contrato', () => {
  assert.ok(fixture.casos.length >= 30);
  assert.ok(fixture.casos.some((c) => c.esperado.ok) && fixture.casos.some((c) => !c.esperado.ok));
});

for (const caso of fixture.casos) {
  test(`agenda (simulada) · ${caso.nome}`, () => {
    const ids = [];
    const res = (v) => (v === '@nenhum' ? 'nao-existe' : /^@\d+$/.test(v) ? ids[Number(v.slice(1)) - 1] : v);
    let r;
    caso.passos.forEach((p, i) => {
      if (p.op === 'criar') {
        r = agenda.criar({ clienteId: p.cliente === '@nenhum' ? 'nao-existe' : ctx.clientes[p.cliente], profissionalId: ctx.profs[p.prof],
          servicoIds: p.servicos.map((s) => (s === '@nenhum' ? 'nao-existe' : ctx.servicos[s])), inicio: quando(p.quando),
          ...(p.status ? { status: p.status } : {}), ...(p.encaixe ? { encaixe: true } : {}) });
        ids.push(r.ok ? r.agendamento.id : null);
      } else if (p.op === 'remarcar') {
        r = agenda.remarcar(res(p.alvo), { inicio: quando(p.quando), ...(p.prof ? { profissionalId: ctx.profs[p.prof] } : {}) });
        ids.push(null);
      } else if (p.op === 'status') {
        r = agenda.alterarStatus(res(p.alvo), p.status);
        ids.push(null);
      } else if (p.op === 'desativarServico') {
        const s = fixture.cenario.servicos[p.servico];
        r = servicos.salvar({ id: ctx.servicos[p.servico], nome: s.nome, preco: s.preco, duracao: s.duracaoMin, intervalo: s.intervaloMin, ativo: false });
        ids.push(null);
      } else if (p.op === 'desativarProf') {
        r = equipe.definirAtendimento(ctx.profs[p.prof], false);
        ids.push(null);
      } else throw new Error('passo desconhecido: ' + p.op);
      if (i < caso.passos.length - 1) assert.ok(r.ok, `passo ${i + 1} deveria dar certo: ${JSON.stringify(r)}`);
    });
    assert.equal(r.ok, caso.esperado.ok, JSON.stringify(r));
    if (!caso.esperado.ok) assert.equal(r.erros[0], caso.esperado.erro);
    const est = caso.esperado.estado;
    if (est) {
      const a = store.getState().agendamentos.find((x) => x.id === res(est.alvo));
      assert.equal(a.status, est.status);
      assert.equal(a.motivoCancelamento ?? null, est.motivo);
      assert.equal(!!a.reagendado, est.reagendado);
      assert.deepEqual(a.log.filter((l) => l.campo === 'status' || l.campo === 'profissional').map((l) => [l.campo, l.de, l.para]), est.eventos);
    }
  });
}
