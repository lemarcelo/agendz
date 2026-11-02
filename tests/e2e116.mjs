/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// B11: Aviso de avaliação para o cliente pelo link (#agendar) contra servidor falso:
//  1. Tela de pedido enviado (pub-feito): mostra o aviso pub-feito-avaliar;
//  2. Meus agendamentos: consulta periódica/foco detecta horário concluído sem avaliação e mostra pub-avaliar-<id>;
//  3. Botão Avaliar: chama a rota pública e navega para #avaliar/<token>.
// 390 px com fonte larga e desktop × claro/escuro.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const CORTE = id(50), ALAN = id(1), AG_ID = id(400);
const TOKEN_ACESSO = 'ab'.repeat(24);
const TOKEN_AVALIAR = 'cd'.repeat(24);
const SELO = '1730000000.' + 'c'.repeat(32);
const LOJA = { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia', logo: null, temaCor: null, temaCor2: null };

function modelo() {
  let consultasMeus = 0;
  const m = { statusAg: 'a_confirmar', ativo: true };
  m.trata = (c, { json }) => {
    if (c.u === '/api/publico/agendar') {
      return json(200, {
        ativo: true, aviso: null, diasMax: 30, exigeTelefone: true, selo: SELO,
        servicos: [{ id: CORTE, nome: 'Corte', duracao: 30, preco: 40, antecedenciaH: 0 }],
        profissionais: [{ id: ALAN, nome: 'Alan', foto: null }]
      });
    }
    if (c.u === '/api/publico/dias') return json(200, ['2026-10-30']);
    if (c.u === '/api/publico/horarios') return json(200, [{ inicio: '2026-10-30T12:00:00Z', profissionalId: ALAN }]);
    if (c.u === '/api/publico/planos/uso') return json(200, { usaPlano: false });
    if (c.u === '/api/publico/agendamentos' && c.m === 'POST') {
      return json(201, {
        agendamento: {
          id: AG_ID, inicio: '2026-10-30T12:00:00.000Z', fim: '2026-10-30T12:30:00.000Z',
          status: 'a_confirmar', rotulo: 'Aguardando confirmação', servicos: ['Corte'],
          duracao: 30, total: 40, desconto: 0, cupom: null, profissional: 'Alan', ativo: true, podeCancelar: true
        },
        token: TOKEN_ACESSO, usouPlano: false
      });
    }
    if (c.u === '/api/publico/meus' && c.m === 'POST') {
      consultasMeus++;
      const concluido = m.statusAg === 'concluido';
      return json(200, [{
        id: AG_ID, inicio: '2026-10-30T12:00:00.000Z', fim: '2026-10-30T12:30:00.000Z',
        status: m.statusAg, rotulo: concluido ? 'Concluído' : 'Aguardando confirmação',
        servicos: ['Corte'], duracao: 30, total: 40, desconto: 0, cupom: null, profissional: 'Alan',
        ativo: !concluido, podeCancelar: !concluido, avaliado: false
      }]);
    }
    if (c.u === `/api/publico/agendamentos/${AG_ID}/avaliacao` && c.m === 'POST') {
      assert.equal(c.h['x-acesso'], TOKEN_ACESSO, 'cabeçalho X-Acesso com o token do agendamento');
      return json(200, { avaliarToken: TOKEN_AVALIAR });
    }
    if (c.u === '/api/publico/avaliacoes' && c.m === 'GET') {
      assert.equal(c.h['x-acesso'], TOKEN_AVALIAR, 'cabeçalho X-Acesso com o avaliarToken');
      return json(200, {
        loja: 'Dalforno', servicos: ['Corte'], profissional: 'Alan', quando: '2026-10-30T12:00:00.000Z'
      });
    }
    return false;
  };
  return m;
}

async function fluxo(vp, modo) {
  const rotulo = `b11/${vp.width}/${modo}`;
  const m = modelo();
  const srv = await subirServidor(m.trata, { loja: LOJA });
  const nav = await abrirNavegador();
  const { p } = await nav.abrir(srv.url + '/#agendar', { viewport: vp, fonteLarga: vp.width < 700 });
  await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  const T = (t) => p.getByTestId(t);

  // 1. Faz um agendamento pelo link
  await T(`pub-serv-${CORTE}`).click();
  await T('pub-avancar').click();
  await T('dh-dias').waitFor();
  await p.locator('button.dh-slot').first().click();
  await T('pub-avancar').click();
  await T('pub-nome').fill('Cliente Teste');
  await T('pub-tel').fill('11999998888');
  await T('pub-enviar').click();

  // 2. Confere aviso na tela final (pub-feito)
  await T('pub-feito').waitFor();
  assert.ok(await T('pub-feito-avaliar').isVisible(), `${rotulo}: aviso de avaliação na tela final`);
  assert.match(await T('pub-feito-avaliar').innerText(), /Depois do atendimento você poderá avaliar por aqui/);

  // 3. Vai para Meus agendamentos
  await T('pub-ver-meus').click();
  await T('pub-meus').waitFor();
  assert.ok(await T(`pub-ag-${AG_ID}`).isVisible(), `${rotulo}: agendamento aparece em Meus`);

  // O agendamento ainda está a confirmar, não deve ter o aviso de avaliar
  assert.equal(await T(`pub-avaliar-${AG_ID}`).isVisible(), false);

  // 4. Servidor passa o agendamento para concluído e simula atualização periódica/visibilidade
  m.statusAg = 'concluido';
  m.ativo = false;
  await p.evaluate(() => {
    // Dispara visibilidade para recarregar Meus
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });

  // Aguarda aparecer o aviso de avaliação no cartão
  await T(`pub-avaliar-${AG_ID}`).waitFor();
  assert.ok(await T(`pub-avaliar-${AG_ID}`).isVisible(), `${rotulo}: aviso no cartão concluído`);
  assert.match(await T(`pub-avaliar-${AG_ID}`).innerText(), /Seu atendimento foi concluído/);

  // 5. Clica no botão Avaliar e verifica navegação para #avaliar/<token>
  await T(`pub-avaliar-btn-${AG_ID}`).click();
  await p.waitForFunction((token) => window.location.hash.includes(token), TOKEN_AVALIAR);
  const hashAtual = await p.evaluate(() => window.location.hash);
  assert.equal(hashAtual, `#avaliar/${TOKEN_AVALIAR}`, `${rotulo}: hash final correto`);

  await nav.semRolagem(p, `${rotulo}: sem rolagem lateral`);
  await nav.fechar();
  await srv.fechar();
  ok(rotulo);
}

const celular = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

await fluxo(celular, 'claro');
await fluxo(celular, 'escuro');
await fluxo(desktop, 'claro');
await fluxo(desktop, 'escuro');
