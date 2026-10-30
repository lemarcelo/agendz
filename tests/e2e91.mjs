/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Plano na ficha do cliente no site real (dist/index-real.html) contra um servidor falso: sem plano cadastrado (atalho para Planos), adicionar com erro 500, 403 e 409
// (a mensagem do servidor aparece) e duplo clique (uma chamada só), mensalidade, trocar de plano (encerra e abre o novo; falha no meio avisa), encerrar com dívida
// (trava plano novo até quitar), cliente de cadastro incompleto, a ficha não perde o que foi digitado, e quem não tem a seção Planos não vê o bloco nem chama a API.
// Três lojas × 390 px (fonte larga) e desktop × claro/escuro.
import assert from 'node:assert/strict';
import { abrirNavegador, id, ok, subirServidor } from './real-util.mjs';

const BRUNO = id(60), CAIO = id(61), PA = id(70), PB = id(71);
const LOJAS = [
  { slug: 'dalforno', nome: 'Dalforno', tipo: 'barbearia' },
  { slug: 'offbox', nome: 'Offbox', tipo: 'barbearia' },
  { slug: 'apex', nome: 'Apex', tipo: 'estetica_automotiva' },
];
const CLIENTES = [{ id: BRUNO, nome: 'Bruno Lima', apelido: 'Bruno', telefone: '5511999990001', cpfMascarado: '***.***.***-00', dadosCompletos: true }, { id: CAIO, nome: 'Caio Souza', apelido: '', telefone: '', dadosCompletos: false }];
const plano = (pid, nome, cortes) => ({ id: pid, nome, descricao: '', preco: 80, cortes, servicoIds: [], adianta: 1, acumuloMeses: 2, intervaloDias: 0, ativo: true });

function modelo() {
  const m = { planos: [], assinaturas: [], seq: 100, divida: 0, saldoNegativo: false, atraso: 0 };
  const dto = (a) => {
    const c = CLIENTES.find((x) => x.id === a.clienteId); const pl = m.planos.find((x) => x.id === a.planoId);
    return { id: a.id, clienteId: a.clienteId, cliente: { id: c.id, nome: c.nome, apelido: c.apelido }, planoId: a.planoId, plano: { nome: pl.nome, preco: pl.preco, cortes: pl.cortes, servicoIds: [], adianta: 1, acumuloMeses: 2, intervaloDias: 0 },
      status: a.status, inicioMes: '2026-10', diaCobranca: 5, pagamentos: a.pagamentos, divida: a.divida || 0, dividaQuitada: !!a.dividaQuitada, criadoEm: '2026-10-28T10:00:00Z', encerradoEm: a.encerradoEm || null, log: [],
      saldo: { planoNome: pl.nome, situacao: a.status, cortesPorMes: pl.cortes, mes: '2026-10', pagoMes: a.pagamentos.length > 0, restantes: a.pagamentos.length ? pl.cortes : 0, usadosNoMes: 0, maisPermitidos: 0, pagoAte: a.pagamentos.length ? '2026-10' : null, atrasado: false },
      extrato: m.saldoNegativo && a.status !== 'cancelada' ? [{ mes: '2026-10', pago: true, concedidos: 1, usados: 2, saldoFim: -1, limite: 1, estourou: false, zerou: false }] : [] };
  };
  m.dto = dto;
  m.trata = (c, { json }) => {
    const resp = (st, obj, ms = 0) => { if (ms) setTimeout(() => json(st, obj), ms); else json(st, obj); return true; };
    if (c.u === '/api/clientes' && c.m === 'GET') return resp(200, CLIENTES);
    let r = /^\/api\/clientes\/([^/]+)$/.exec(c.u);
    if (r && c.m === 'GET') return resp(200, CLIENTES.find((x) => x.id === r[1]));
    if (c.u === '/api/servicos') return resp(200, []);
    if (c.u === '/api/planos' && c.m === 'GET') return resp(200, { planos: m.planos, assinaturas: m.assinaturas.map(dto), pedidos: [], aReceber: m.assinaturas.filter((a) => a.status === 'ativa' && !a.pagamentos.length).map((a) => a.id), mes: '2026-10' });
    if (c.u === '/api/assinaturas' && c.m === 'POST') {
      const { clienteId, planoId } = c.corpo;
      if (m.assinaturas.some((a) => a.clienteId === clienteId && (a.status === 'ativa' || a.status === 'pendente'))) return resp(409, { mensagem: 'Esse cliente já tem um plano em andamento. Encerre o atual para contratar outro.' });
      if (m.assinaturas.some((a) => a.clienteId === clienteId && a.status === 'cancelada' && a.divida > 0 && !a.dividaQuitada)) return resp(409, { mensagem: 'Esse cliente encerrou um plano com atendimentos adiantados e ainda não quitou. Quite antes de contratar outro.' });
      const a = { id: id(m.seq++), clienteId, planoId, status: 'pendente', pagamentos: [] };
      m.assinaturas.push(a);
      return resp(201, dto(a), 350); // devagar: o duplo clique tem de gerar uma chamada só
    }
    r = /^\/api\/assinaturas\/([^/]+)\/(pagamentos|encerrar|quitar)$/.exec(c.u);
    if (r && c.m === 'POST') {
      const a = m.assinaturas.find((x) => x.id === r[1]);
      if (!a) return resp(404, { mensagem: 'Assinatura não encontrada.' });
      if (r[2] === 'pagamentos') { a.pagamentos.push({ id: id(m.seq++), mes: c.corpo.mes || '2026-10', valor: 80, forma: c.corpo.forma, em: '2026-10-28T10:00:00Z', autor: { nome: 'Alan' }, estornado: false }); a.status = 'ativa'; }
      if (r[2] === 'encerrar' && String(c.corpo.motivo || '').trim().length < 5) return resp(400, { mensagem: 'Diga o motivo (5 a 200 letras).' });
      if (r[2] === 'encerrar') { a.status = 'cancelada'; a.encerradoEm = '2026-10-28T11:00:00Z'; a.divida = m.divida; a.dividaQuitada = m.divida === 0; m.divida = 0; }
      if (r[2] === 'quitar') a.dividaQuitada = true;
      return resp(200, dto(a));
    }
    return false;
  };
  return m;
}

async function cenario(loja, vp, modo) {
  const rotulo = `${loja.slug}/${vp.width}/${modo}`;
  const m = modelo();
  const estado = { loja: { slug: loja.slug, nome: loja.nome, tipo: loja.tipo, logo: null, temaCor: null, temaCor2: null } };
  const srv = await subirServidor(m.trata, estado);
  const nav = await abrirNavegador();
  const { p } = await nav.abrir(srv.url, { viewport: vp, aba: 'clientes', fonteLarga: vp.width < 700 });
  await p.evaluate((x) => document.documentElement.setAttribute('data-theme', x === 'claro' ? 'light' : 'dark'), modo);
  const T = (t) => p.getByTestId(t);
  const abrirFicha = async (nome) => { await p.getByRole('button', { name: `Editar ${nome}` }).click(); await T('plano-cliente').waitFor(); await T('plano-cli-carregando').waitFor({ state: 'detached' }); };
  const voltar = async () => { await T('cli-cancelar').click(); await T('tela-clientes').waitFor(); };
  const editar = async () => { if (!(await T('plano-cli-editar-acoes').count())) await T('plano-cli-editar').click(); };
  const aviso = async () => (await T('plano-cli-aviso').innerText());
  const semRolagem = (onde) => nav.semRolagem(p, `${rotulo}: ${onde}`);

  // 1. sem plano cadastrado: aviso e atalho para Planos
  await T('cli-lista').waitFor();
  await abrirFicha('Bruno Lima');
  assert.match(await T('plano-cli-vazio').innerText(), /Sem plano/);
  assert.equal(await T('plano-cli-adicionar').count(), 0);
  assert.match(await T('plano-cli-sem-catalogo').innerText(), /Nenhum plano cadastrado ainda\. Crie um na aba Planos/);
  await semRolagem('ficha sem plano cadastrado');
  await T('plano-cli-ir-planos').click();
  await T('tela-planos').waitFor();
  assert.equal(await T('plano-cliente').count(), 0);
  await T('nav-clientes').click(); await T('cli-lista').waitFor();
  m.planos = [plano(PA, 'Plano A', 2), plano(PB, 'Plano B', 4)];

  // 2. adicionar: 500, 403 e 409 mostram a mensagem do servidor; duplo clique manda uma chamada só; a ficha não perde o que foi digitado
  await abrirFicha('Bruno Lima');
  await T('cli-apelido').fill('Bruzão');
  await T('plano-cli-adicionar').click();
  await semRolagem('Adicionar plano');
  for (const [status, mensagem] of [[500, 'Erro 500 do servidor.'], [403, 'Sem permissão para planos.'], [409, 'Esse cliente já tem um plano em andamento. Encerre o atual para contratar outro.']]) {
    srv.estado.falhar = { rota: /^\/api\/assinaturas$/, metodo: 'POST', status, mensagem };
    await T('plano-cli-salvar').click();
    await T('planos-erro-form').waitFor();
    assert.match(await T('planos-erro-form').innerText(), new RegExp(mensagem.slice(0, 20)), `${rotulo}: mensagem do ${status}`);
  }
  assert.equal(m.assinaturas.length, 0, 'as recusas não criaram nada');
  const antes = srv.quantas('POST', '/api/assinaturas');
  await T('plano-cli-salvar').dblclick();
  await T('plano-cli-ativo').waitFor();
  assert.equal(srv.quantas('POST', '/api/assinaturas') - antes, 1, `${rotulo}: duplo clique = uma chamada só`);
  assert.equal(await T('cli-apelido').inputValue(), 'Bruzão', `${rotulo}: a ficha não perdeu o que foi digitado`);
  assert.match(await aviso(), /Plano adicionado\. Registre a mensalidade/);
  assert.equal(await T('plano-cli-nome').innerText(), 'Plano A');
  assert.match(await T('plano-cli-venc').innerText(), /Aguardando a primeira mensalidade/);
  assert.equal(await T('plano-cli-adicionar').count(), 0, 'com plano ativo não há Adicionar');
  await semRolagem('ficha com plano');
  ok(`${rotulo}: adicionar (500, 403, 409, duplo clique, ficha preservada)`);

  // 3. mensalidade
  await editar();
  await T('plano-cli-mensalidade').click();
  await T('mensalidade-form').waitFor();
  await T('salvar-mensalidade').click();
  await T('plano-cli-saldo').waitFor();
  assert.match(await aviso(), /Mensalidade de .* registrada/);
  assert.match(await T('plano-cli-saldo').innerText(), /Atendimentos que restam: 2 de 2/);
  assert.match(await T('plano-cli-venc').innerText(), /paga · próxima: dia 5 de/);

  // 4. trocar: sem motivo recusa; falha no meio (o novo não sai) avisa que o anterior foi encerrado; depois adicionar e trocar de verdade
  await editar();
  await T('plano-cli-trocar').click();
  assert.equal(await T('plano-cli-plano').locator('option').count(), 1, 'a troca não oferece o plano atual');
  await semRolagem('Trocar de plano');
  await T('plano-cli-salvar').click();
  assert.match(await T('planos-erro-form').innerText(), /motivo da troca \(5 a 200 letras\)/);
  assert.equal(srv.quantas('POST', '/encerrar'), 0, 'sem motivo nada é enviado');
  await T('plano-cli-motivo').fill('quer mais atendimentos');
  srv.estado.falhar = { rota: /^\/api\/assinaturas$/, metodo: 'POST', status: 409, mensagem: 'Plano desativado.' };
  await T('plano-cli-salvar').click();
  await T('plano-cli-vazio').waitFor();
  assert.match(await aviso(), /O plano anterior foi encerrado, mas o novo não foi criado: Plano desativado\./);
  await T('plano-cli-adicionar').click(); await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  await editar();
  await T('plano-cli-trocar').click();
  await T('plano-cli-motivo').fill('voltou ao plano antigo'); await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  assert.match(await aviso(), /Plano trocado\./);
  const enc = srv.chamadas.filter((c) => c.u.endsWith('/encerrar')).at(-1);
  assert.deepEqual(enc.corpo, { motivo: 'voltou ao plano antigo' });
  assert.equal(srv.chamadas.filter((c) => c.m === 'POST' && c.u === '/api/assinaturas').at(-1).corpo.planoId, PB);
  assert.equal(await T('plano-cli-nome').innerText(), 'Plano B');
  assert.ok((await p.locator('[data-testid^="plano-cli-hist-"]').count()) >= 1 && (await p.locator('[data-testid^="plano-cli-hist-"]').count()) <= 3, 'histórico curto');
  ok(`${rotulo}: mensalidade e trocar de plano (inclusive falha no meio)`);

  // 5. encerrar com dívida: trava plano novo até quitar
  m.divida = 1;
  await T('plano-cli-encerrar').click();
  await T('confirmar-encerrar').click();
  assert.match(await T('planos-erro-form').innerText(), /Diga o motivo \(5 a 200 letras\)/);
  await T('encerrar-motivo').fill('cliente mudou de cidade'); await T('confirmar-encerrar').click();
  await T('plano-cli-vazio').waitFor();
  assert.match(await aviso(), /Plano encerrado\. 1 corte adiantado ficou como dívida\./);
  assert.match(await T('plano-cliente').innerText(), /devendo 1 atendimento e não pode assinar outro até quitar/);
  await semRolagem('ficha com dívida');
  await T('plano-cli-adicionar').click(); await T('plano-cli-salvar').click();
  assert.match(await T('planos-erro-form').innerText(), /ainda não quitou/);
  await T('planos-voltar').click();
  await p.locator('[data-testid^="plano-cli-quitar-"]').click();
  await T('plano-cli-adicionar').waitFor();
  assert.match(await aviso(), /Dívida quitada\./);
  ok(`${rotulo}: encerrar com dívida trava até quitar`);

  // 6. trocar bloqueado quando já há atendimento adiantado (a dívida seria criada pela troca)
  m.saldoNegativo = true;
  await T('plano-cli-adicionar').click(); await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  await editar();
  assert.equal(await T('plano-cli-trocar').isDisabled(), true);
  assert.match(await T('plano-cli-troca-bloqueada').innerText(), /trocar agora deixaria dívida/);
  m.saldoNegativo = false;
  await voltar();

  // 7. cliente de cadastro incompleto (sem telefone, dados restritos) também assina
  await abrirFicha('Caio Souza');
  await T('plano-cli-adicionar').click(); await T('plano-cli-salvar').click();
  await T('plano-cli-ativo').waitFor();
  assert.equal(srv.chamadas.filter((c) => c.m === 'POST' && c.u === '/api/assinaturas').at(-1).corpo.clienteId, CAIO);
  await voltar();
  ok(`${rotulo}: cliente sem telefone assina`);

  // 8. sem a seção Planos: nem bloco nem chamada
  await nav.b.contexts()[0].close();
  const outra = await subirServidor(m.trata, { loja: estado.loja, sessao: { token: 'tok', id: id(2), nome: 'Kiko', papel: 'profissional', deveTrocarSenha: false, onboardingPendente: false, secoes: ['agenda', 'clientes'] } });
  const { p: q } = await nav.abrir(outra.url, { viewport: vp, aba: 'clientes' });
  await q.getByTestId('cli-lista').waitFor();
  await q.getByRole('button', { name: 'Editar Bruno Lima' }).click();
  await q.getByTestId('cli-nome').waitFor();
  await q.waitForTimeout(300);
  assert.equal(await q.getByTestId('plano-cliente').count(), 0, `${rotulo}: sem a seção Planos o bloco não aparece`);
  assert.equal(outra.chamadas.filter((c) => c.u.startsWith('/api/planos') || c.u.startsWith('/api/assinaturas')).length, 0, `${rotulo}: e a API de planos nem é chamada`);
  ok(`${rotulo}: sem a seção Planos`);
  assert.deepEqual(nav.erros, [], nav.erros.join('\n'));
  await nav.b.close(); srv.fechar(); outra.fechar();
}

const TELAS = [{ width: 390, height: 800 }, { width: 1366, height: 820 }];
let i = 0;
for (const loja of LOJAS) for (const vp of TELAS) await cenario(loja, vp, i++ % 2 === 0 ? 'claro' : 'escuro');
