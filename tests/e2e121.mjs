/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// As áreas da agenda rolam independentemente apenas quando há conteúdo além do espaço disponível.
import assert from 'node:assert/strict';
import { subirServidor, abrirNavegador, id } from './real-util.mjs';

let comRegistros = false;
const horario = (dia, hora) => new Date(`2026-10-${dia}T${hora}:00:00-03:00`).toISOString();
const registro = (n, dia, hora) => ({ id: id(100 + n), profissionalId: id(1), nomeAvulso: `Cliente ${n}`,
  inicio: horario(dia, hora), fim: horario(dia, hora), fimOcupado: horario(dia, hora), status: 'confirmado',
  servicos: [{ servicoId: id(50), nome: 'Serviço', preco: 50, duracaoMin: 30 }], total: 50 });
const agendamentos = [...Array.from({ length: 8 }, (_, n) => registro(n, '28', String(n + 8).padStart(2, '0'))),
  ...Array.from({ length: 8 }, (_, n) => registro(n + 8, '30', String(n + 8).padStart(2, '0')))];
const srv = await subirServidor((c, { json }) => {
  if (c.u === '/api/usuarios/me/menu') return json(200, { recolhido: false });
  if (c.u === '/api/agendamentos/existem-futuros') return json(200, { existem: false });
  if (c.u === '/api/profissionais') return json(200, [{ id: id(1), nome: 'Ana', papel: 'dono', atende: true }]);
  if (c.u === '/api/agendamentos') return json(200, comRegistros ? agendamentos : []);
  if (['/api/clientes', '/api/servicos', '/api/avisos'].includes(c.u)) return json(200, []);
  return false;
});
const nav = await abrirNavegador();
try {
  let { ctx, p } = await nav.abrir(srv.url, { viewport: { width: 1366, height: 650 } });
  await p.getByTestId('agenda-dia').waitFor();
  for (const campo of ['agenda-dia', 'agenda-proximos']) {
    const tamanhos = await p.getByTestId(campo).evaluate((e) => ({ altura: e.clientHeight, conteudo: e.scrollHeight }));
    assert.ok(tamanhos.conteudo <= tamanhos.altura + 1, `${campo} vazio sem rolagem`);
  }
  await ctx.close();
  comRegistros = true;
  ({ ctx, p } = await nav.abrir(srv.url, { viewport: { width: 1366, height: 650 } }));
  await p.getByTestId('cartao-proximo').first().waitFor();
  const dia = p.getByTestId('agenda-dia'), futuros = p.getByTestId('agenda-proximos');
  for (const area of [dia, futuros]) assert.equal(await area.evaluate((e) => e.scrollHeight > e.clientHeight), true, 'lista comprida precisa de rolagem própria');
  await dia.evaluate((e) => { e.scrollTop = 120; });
  assert.ok(await dia.evaluate((e) => e.scrollTop) > 0);
  assert.equal(await futuros.evaluate((e) => e.scrollTop), 0, 'rolar o dia não move os futuros');
  await futuros.evaluate((e) => { e.scrollTop = 120; });
  assert.ok(await futuros.evaluate((e) => e.scrollTop) > 0);
  assert.ok(await dia.evaluate((e) => e.scrollTop) > 0, 'rolar os futuros preserva a posição do dia');
  await ctx.close();
  assert.deepEqual(nav.erros, []);
  console.log('e2e121 ok: rolagem independente e áreas vazias sem rolagem');
} finally { await nav.b.close(); srv.fechar(); }
