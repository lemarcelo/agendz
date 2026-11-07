/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// G2/G3 no site real da estética (dist/index-real.html) contra um servidor falso:
//  1. Boxes: o modo de escolha grava ao mudar e a ausência do box é lançada, aparece na lista e é removida (corpo enviado conferido);
//  2. Serviços: "Boxes permitidos" no cadastro do serviço; marcar um box envia PUT /api/servicos/{id}/boxes com só esse id.
// 390 px com fonte larga (DejaVu Sans) e 1366 px; sem rolagem lateral; sem pageerror nem diálogo nativo. E2E_CAPTURAS=<pasta> grava as imagens.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';
import { acessarSecao } from './navegacao-real.mjs';

const CAP = process.env.E2E_CAPTURAS;
const B1 = id(61), B2 = id(62), LAV = id(70), ALAN = id(1);
const LOJA = { slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva', logo: null, temaCor: null, temaCor2: null };
const SESSAO = { token: 'tok', id: ALAN, nome: 'Alan', papel: 'dono', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes', 'servicos', 'estabelecimento'] };

const m = { modo: 'livre', ausencias: [], vinculos: [], gravaModo: [], criadas: [], removidas: [] };
m.trata = (c, { json }) => {
  if (c.u === '/api/boxes' && c.m === 'GET') return json(200, [{ id: B1, nome: 'Box 1', ativo: true }, { id: B2, nome: 'Box 2', ativo: true }]);
  if (c.u === '/api/estabelecimento/boxes/modo') {
    if (c.m === 'PUT') { m.modo = c.corpo.modo; m.gravaModo.push(c.corpo.modo); }
    return json(200, { modo: m.modo });
  }
  if (c.u === '/api/boxes/ausencias' && c.m === 'GET') return json(200, m.ausencias);
  if (c.u === '/api/boxes/ausencias' && c.m === 'POST') {
    m.criadas.push(c.corpo);
    const a = { id: id(80 + m.criadas.length), boxId: c.corpo.boxId, box: c.corpo.boxId === B1 ? 'Box 1' : 'Box 2', ini: c.corpo.intervalos[0].ini, fim: c.corpo.intervalos[0].fim, diaInteiro: false, motivo: c.corpo.motivo || null };
    m.ausencias.push(a);
    return json(201, { ausencias: [a], afetados: [] });
  }
  if (c.u.startsWith('/api/boxes/ausencias/') && c.m === 'DELETE') {
    m.removidas.push(c.u.split('/').pop()); m.ausencias = m.ausencias.filter((a) => !c.u.endsWith(a.id));
    return json(204, {});
  }
  if (c.u === '/api/profissionais') return json(200, [{ id: ALAN, nome: 'Alan', papel: 'dono', atende: true }]);
  if (c.u === '/api/servicos') return json(200, [{ id: LAV, codigo: '1', nome: 'Lavagem', categoria: '', preco: 80, duracaoMin: 60, intervaloMin: 0, ativo: true, precos: { medio: 80 }, duracoes: { medio: 60 } }]);
  if (c.u === '/api/servicos/boxes') return json(200, {});
  if (c.u === `/api/servicos/${LAV}/boxes` && c.m === 'PUT') { m.vinculos.push(c.corpo); return json(200, {}); }
  if (c.u === `/api/servicos/${LAV}` && c.m === 'PUT') return json(200, { id: LAV, nome: 'Lavagem', codigo: '1', ativo: true, preco: 80, duracaoMin: 60, intervaloMin: 0, precos: { medio: 80 }, duracoes: { medio: 60 } });
  if (c.u === '/api/agendamentos' && c.m === 'GET') return json(200, []);
  return false;
};

const srv = await subirServidor(m.trata, { loja: LOJA, sessao: SESSAO });
const nav = await abrirNavegador();
try {
  for (const [largura, fonteLarga] of [[390, true], [1366, false]]) {
    const { ctx, p } = await nav.abrir(srv.url, { viewport: { width: largura, height: 900 }, aba: null, fonteLarga });
    // 1. Boxes: modo e ausência
    await acessarSecao(p, 'nav-boxes');
    await p.getByTestId('boxes-modo-select').waitFor();
    await p.getByTestId('boxes-modo-select').selectOption('fila');
    await p.getByTestId('boxes-ok').waitFor();
    assert.equal(m.modo, 'fila');
    await p.getByTestId('ausencia-box').waitFor();
    await p.getByTestId('ausencia-box-motivo').fill('Manutenção');
    await p.getByTestId('ausencia-box-registrar').click();
    await p.getByTestId('ausencia-box-lista').locator('li:not([data-testid=ausencia-box-vazia])').first().waitFor();
    assert.equal(m.criadas.length > 0, true);
    assert.equal(m.criadas.at(-1).motivo, 'Manutenção');
    await nav.semRolagem(p, `boxes ${largura}`);
    if (CAP) await p.screenshot({ path: `${CAP}/real-boxes-${largura}.png`, fullPage: true });
    const rem = p.locator('[data-testid^="ausencia-box-remover"]').first();
    await rem.click();
    await p.getByTestId('ausencia-box-vazia').waitFor();
    assert.equal(m.removidas.length, 1);
    // 2. Serviços: boxes permitidos
    await acessarSecao(p, 'nav-servicos');
    await p.getByTestId(`editar-${LAV}`).click();
    const sec = p.getByTestId('srv-boxes');
    await sec.waitFor();
    await sec.scrollIntoViewIfNeeded();
    await p.getByTestId('srv-boxes-busca').fill('Box 2');
    await p.locator('[data-testid^="srv-boxes-add-"]').first().click();
    assert.equal(await p.locator('[data-testid^="srv-boxes-rem-"]').count(), 1);
    await nav.semRolagem(p, `servico ${largura}`);
    if (CAP) await p.screenshot({ path: `${CAP}/real-servico-boxes-${largura}.png` });
    await p.getByTestId('salvar-servico').click();
    await p.waitForFunction(() => !document.querySelector('[data-testid=srv-form]'));
    assert.deepEqual(m.vinculos.at(-1), { boxIds: [B2] });
    await ctx.close();
    m.vinculos.length = 0; m.criadas.length = 0; m.removidas.length = 0;
  }
  assert.deepEqual(nav.erros, []);
  ok('e2e139: Boxes (modo e ausência) e boxes permitidos do serviço no site real');
} finally { await nav.b.close(); srv.fechar(); }
