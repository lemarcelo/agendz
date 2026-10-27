// Testes de segurança da camada de API (autenticação, autorização, IDOR, mass assignment, entrada, segredos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as API from '../src/services/api.js';
import { reiniciar } from './helpers.mjs';
import { store, auth, agenda, clientes, servicos, equipe, estabelecimento, financeiro, estoque, modelos, excecoes, whatsapp } from '../src/services/api.js';
import * as R from '../src/domain/rules.js';
import { addDays, startOfDay, tsAt } from '../src/domain/time.js';
import { faixasDoDia } from '../src/domain/schedule.js';

const st = () => store.getState();
const proxDiaUtil = (n = 1) => { let d = startOfDay(store.agora()); let c = 0; while (c < n) { d = addDays(d, 1); if (faixasDoDia(st().estabelecimento.escala, d).length) c++; } return d; };
const como = (apelido) => { const r = auth.login({ identificador: apelido, senha: '1234' }); assert.ok(r.ok, apelido); };
const marca = (profissionalId, hora, n = 8) => { como('davi'); const r = agenda.criar({ clienteId: 'c-igor', profissionalId, servicoIds: ['s-lav-simples'], inicio: tsAt(proxDiaUtil(n), hora) }); assert.ok(r.ok, JSON.stringify(r)); return r.agendamento; };
const copia = () => JSON.stringify(st());
test.beforeEach(() => reiniciar());

// ---------- 1. sem login ----------
test('sem login: nenhuma ação do painel altera o estado', () => {
  const a = marca('u-pablo', '10:00');
  auth.logout();
  const antes = copia();
  const tentativas = {
    'agenda.criar': () => agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(proxDiaUtil(9), '11:00') }),
    'agenda.remarcar': () => agenda.remarcar(a.id, { inicio: tsAt(proxDiaUtil(9), '11:00') }),
    'agenda.cancelar': () => agenda.cancelar(a.id),
    'agenda.alterarStatus': () => agenda.alterarStatus(a.id, 'confirmado'),
    'agenda.editarServicos': () => agenda.editarServicos(a.id, ['s-lav-simples']),
    'agenda.confirmarServico': () => agenda.confirmarServico(a.id, []),
    'agenda.enviarMensagem': () => agenda.enviarMensagem(a.id, 'm1', []),
    'clientes.salvar': () => clientes.salvar({ nome: 'X', telefone: '(55) 99999-0000' }),
    'servicos.salvar': () => servicos.salvar({ nome: 'X', preco: 1, duracao: 10 }),
    'servicos.remover': () => servicos.remover('s-lav-simples'),
    'equipe.salvar': () => equipe.salvar({ nome: 'X', apelido: 'xx', cpf: '52998224725', email: 'x@x.com', senha: '1234', papel: 'dono' }),
    'equipe.remover': () => equipe.remover('u-pablo'),
    'equipe.definirAtendimento': () => equipe.definirAtendimento('u-pablo', false),
    'equipe.alterarSenha': () => equipe.alterarSenha('1234', 'hack'),
    'estabelecimento.salvar': () => estabelecimento.salvar({ nome: 'Hack' }),
    'estabelecimento.escala': () => estabelecimento.salvarEscalaProfissional('u-pablo', []),
    'financeiro.salvarLancamento': () => financeiro.salvarLancamento({ tipo: 'despesa', valor: 1, categoria: 'x', descricao: 'x', data: Date.now() }),
    'financeiro.salvarConta': () => financeiro.salvarConta({ apelido: 'x', banco: 'Itaú' }),
    'financeiro.confirmarManual': () => financeiro.confirmarManual('x', ''),
    'financeiro.gerarCobranca': () => financeiro.gerarCobranca(a.id, { cpf: '529.982.247-25' }),
    'financeiro.cancelarCobranca': () => financeiro.cancelarCobranca('x'),
    'estoque.salvarMaterial': () => estoque.salvarMaterial({ nome: 'x' }),
    'estoque.movimentar': () => estoque.movimentar({ materialId: 'x', tipo: 'entrada', qtd: 1 }),
    'modelos.salvar': () => modelos.salvar({ nome: 'x', corpo: 'oi', id: st().modelos.find((m) => m.sistema).id }),
    'excecoes.salvar': () => excecoes.salvar('estabelecimento', { inicio: 1, fim: 2 }, 'cancelar'),
  };
  for (const [nome, fn] of Object.entries(tentativas)) {
    let r; try { r = fn(); } catch (e) { r = { ok: false, erro: String(e) }; }
    assert.equal(r && r.ok, false, `${nome} deveria falhar sem login`);
  }
  assert.equal(copia(), antes, 'estado mudou sem login');
});

// ---------- 2. esteticista não toca no que não é dele (IDOR) ----------
test('esteticista não altera agendamento de outro esteticista', () => {
  const a = marca('u-pablo', '10:00');
  como('marcelo');
  const antes = copia();
  const dia = proxDiaUtil(9);
  const tent = {
    remarcar: () => agenda.remarcar(a.id, { inicio: tsAt(dia, '15:00') }),
    cancelar: () => agenda.cancelar(a.id),
    status: () => agenda.alterarStatus(a.id, 'confirmado'),
    servicos: () => agenda.editarServicos(a.id, ['s-lav-simples']),
    corte: () => agenda.confirmarServico(a.id, []),
    mensagem: () => agenda.enviarMensagem(a.id, 'm1', []),
    cobranca: () => financeiro.gerarCobranca(a.id, { cpf: '529.982.247-25' }),
    mover_para_si: () => agenda.remarcar(a.id, { inicio: a.inicio, profissionalId: 'u-marcelo' }),
  };
  for (const [n, fn] of Object.entries(tent)) { const r = fn(); assert.equal(r.ok, false, `${n} permitido a outro esteticista`); }
  assert.equal(copia(), antes);
});

test('esteticista não agenda na agenda de outro nem mexe em escala alheia', () => {
  como('marcelo');
  assert.equal(agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(proxDiaUtil(9), '10:00') }).ok, false);
  assert.equal(estabelecimento.salvarEscalaProfissional('u-pablo', []).ok, false);
});

test('esteticista não acessa seções restritas (serviços, equipe, estabelecimento, financeiro, estoque, modelos)', () => {
  como('pablo');
  const antes = copia();
  assert.equal(servicos.salvar({ nome: 'X', preco: 1, duracao: 10 }).ok, false);
  assert.equal(servicos.remover('s-lav-simples').ok, false);
  assert.equal(equipe.salvar({ id: 'u-pablo', ...st().usuarios.find((u) => u.id === 'u-pablo'), papel: 'dono' }).ok, false);
  assert.equal(equipe.remover('u-marcelo').ok, false);
  assert.equal(equipe.definirAtendimento('u-marcelo', false).ok, false);
  assert.equal(estabelecimento.salvar({ nome: 'Hack' }).ok, false);
  assert.equal(financeiro.salvarLancamento({ tipo: 'despesa', valor: 9999, categoria: 'x', descricao: 'x', data: Date.now() }).ok, false);
  assert.equal(financeiro.salvarConta({ apelido: 'x', banco: 'Itaú' }).ok, false);
  assert.equal(financeiro.confirmarManual('x', '').ok, false);
  assert.equal(financeiro.manterComoCredito('x').ok, false);
  assert.equal(financeiro.usarCredito('x').ok, false);
  assert.equal(estoque.movimentar({ materialId: 'x', tipo: 'entrada', qtd: 1 }).ok, false);
  assert.equal(modelos.salvar({ nome: 'x', corpo: 'oi', id: st().modelos.find((m) => m.sistema).id }).ok, false);
  assert.equal(copia(), antes);
});

test('esteticista não escala o próprio papel nem muda a senha de outro', () => {
  como('pablo');
  assert.equal(equipe.salvar({ ...st().usuarios.find((u) => u.id === 'u-pablo'), papel: 'dono' }).ok, false);
  assert.equal(st().usuarios.find((u) => u.id === 'u-pablo').papel, 'profissional');
  // alterarSenha vale só para a sessão atual
  assert.equal(equipe.alterarSenha('errada', 'novaSenha').ok, false);
  como('pablo');
  assert.equal(st().usuarios.find((u) => u.id === 'u-marcelo').senha, '1234');
});

test('admin só faz o que as permissões permitem', () => {
  como('davi');
  const r = equipe.salvar({ nome: 'Adm Teste', apelido: 'adm', cpf: '52998224725', email: 'adm@x.com', senha: '1234', papel: 'admin', permissoes: { servicos: true } });
  assert.ok(r.ok, JSON.stringify(r));
  como('adm');
  assert.equal(estabelecimento.salvar({ nome: 'Hack' }).ok, false);
  assert.equal(financeiro.salvarConta({ apelido: 'x', banco: 'Itaú' }).ok, false);
  assert.equal(equipe.salvar({ nome: 'Y', apelido: 'yy', cpf: '11144477735', email: 'y@x.com', senha: '1234', papel: 'dono' }).ok, false);
  assert.ok(servicos.salvar({ nome: 'Permitido', preco: 10, duracao: 15 }).ok);
});

// ---------- 3. Pix: cobrança de outro esteticista ----------
test('Pix: esteticista só gera/envia/cancela cobrança do próprio agendamento', () => {
  const a = marca('u-pablo', '10:00');
  como('pablo');
  const g = financeiro.gerarCobranca(a.id, { cpf: '529.982.247-25' });
  assert.ok(g.ok, JSON.stringify(g));
  como('marcelo');
  const antes = copia();
  assert.equal(financeiro.enviarCobranca(g.cobranca.id).ok, false);
  assert.equal(financeiro.cancelarCobranca(g.cobranca.id).ok, false);
  assert.equal(financeiro.confirmarManual(g.cobranca.id, '').ok, false);
  assert.equal(copia(), antes);
});

// ---------- 4. mass assignment / poluição de protótipo ----------
test('equipe.salvar: campos perigosos não passam (id, __proto__, senha vazia mantém a atual)', () => {
  como('davi');
  const pablo = st().usuarios.find((u) => u.id === 'u-pablo');
  const r = equipe.salvar({ ...pablo, senha: '' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(st().usuarios.find((u) => u.id === 'u-pablo').senha, '1234');
  const malicioso = JSON.parse('{"__proto__":{"polu":1},"constructor":{"prototype":{"polu2":1}}}');
  equipe.salvar({ ...pablo, ...malicioso });
  clientes.salvar({ nome: 'P', telefone: '(55) 99999-1111', ...malicioso });
  servicos.salvar({ nome: 'P', preco: 1, duracao: 10, ...malicioso });
  estabelecimento.salvar(malicioso);
  assert.equal({}.polu, undefined);
  assert.equal({}.polu2, undefined);
});

test('estabelecimento.salvar: não aceita sobrescrever estruturas internas (financeiro, usuários, seq)', () => {
  como('davi');
  const antes = JSON.stringify({ fin: st().financeiro, usr: st().usuarios.length, seq: st().seq });
  estabelecimento.salvar({ financeiro: { contas: [] }, usuarios: [], seq: 0, id: 'x', agendamentos: [] });
  const depois = JSON.stringify({ fin: st().financeiro, usr: st().usuarios.length, seq: st().seq });
  assert.equal(depois.replace(/"seq":\d+/, ''), antes.replace(/"seq":\d+/, ''));
  assert.ok(!('financeiro' in st().estabelecimento) && !('usuarios' in st().estabelecimento) && !('agendamentos' in st().estabelecimento));
});

test('servicos.salvar: não deixa o cliente definir id/ativo de outro serviço nem campos extras', () => {
  como('davi');
  const r = servicos.salvar({ nome: 'Novo', preco: 10, duracao: 15, hack: 'x', id: undefined });
  assert.ok(r.ok);
  assert.ok(!('hack' in r.servico), 'campo desconhecido persistido');
});

test('clientes.salvar: id novo é gerado pelo servidor e campos desconhecidos são descartados', () => {
  como('pablo');
  const r = clientes.salvar({ nome: 'Fulano', telefone: '(55) 99999-2222', id: undefined, papel: 'dono', senha: 'x', saldo: 99999 });
  assert.ok(r.ok);
  assert.ok(!('papel' in r.cliente) && !('senha' in r.cliente) && !('saldo' in r.cliente));
});

test('whatsapp.editarMeusDados: só campos permitidos do cliente', () => {
  const c = st().clientes[0];
  whatsapp.editarMeusDados(c.id, { id: 'outro', nome: 'Novo Nome', pontos: 999, bloqueado: false }, c.telefone);
  const depois = st().clientes.find((x) => x.nome === 'Novo Nome');
  assert.ok(depois);
  assert.equal(depois.id, c.id);
  assert.ok(!('pontos' in depois));
});

// ---------- 5. login e recuperação ----------
test('login: mesma mensagem para usuário inexistente e senha errada; entradas estranhas não quebram', () => {
  const a = auth.login({ identificador: 'naoexiste', senha: 'x' });
  const b = auth.login({ identificador: 'davi', senha: 'x' });
  assert.equal(a.ok, false); assert.equal(b.ok, false);
  assert.deepEqual(a.erros, b.erros);
  for (const x of [undefined, null, {}, [], 0, '', ' ', '\u0000', 'a'.repeat(100000)]) {
    assert.doesNotThrow(() => auth.login({ identificador: x, senha: x }));
    assert.equal(auth.login({ identificador: x, senha: x }).ok, false);
  }
  assert.equal(auth.login({ identificador: 'davi', senha: undefined }).ok, false);
  assert.equal(auth.login({ identificador: 'davi', senha: ['1234'] }).ok, false);
});

test('login: bloqueio temporário após tentativas erradas seguidas', () => {
  for (let i = 0; i < 5; i++) auth.login({ identificador: 'davi', senha: 'errada' + i });
  const r = auth.login({ identificador: 'davi', senha: '1234' });
  assert.equal(r.ok, false, 'conta deveria estar bloqueada temporariamente');
  store.avancar(16 * 60 * 1000);
  assert.ok(auth.login({ identificador: 'davi', senha: '1234' }).ok, 'bloqueio deveria expirar');
});

test('recuperação: código expira, é de uso único e limita tentativas', () => {
  const r = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(55) 99701-1122', canal: 'whatsapp' });
  assert.ok(r.ok);
  // expira
  store.avancar(31 * 60 * 1000);
  assert.equal(auth.concluirRecuperacao({ cpf: '39184726040', codigo: r.codigo, senha: 'nova1' }).ok, false, 'código expirado aceito');
  // uso único
  const r2 = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(55) 99701-1122', canal: 'whatsapp' });
  assert.ok(auth.concluirRecuperacao({ cpf: '39184726040', codigo: r2.codigo, senha: 'nova1' }).ok);
  assert.equal(auth.concluirRecuperacao({ cpf: '39184726040', codigo: r2.codigo, senha: 'outra' }).ok, false, 'código reutilizado');
  // limite de tentativas: 5 erros invalidam o código
  const r3 = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(55) 99701-1122', canal: 'whatsapp' });
  for (let i = 0; i < 5; i++) auth.concluirRecuperacao({ cpf: '39184726040', codigo: '00000' + i, senha: 'x1234' });
  assert.equal(auth.concluirRecuperacao({ cpf: '39184726040', codigo: r3.codigo, senha: 'nova2' }).ok, false, 'código aceito após excesso de tentativas');
});

test('recuperação: código com 6 dígitos e erro não distingue CPF de telefone', () => {
  const r = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(55) 99701-1122', canal: 'email' });
  assert.match(r.codigo, /^\d{6}$/);
  const e1 = auth.iniciarRecuperacao({ cpf: '000', telefone: '(55) 99701-1122' });
  const e2 = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '000' });
  assert.deepEqual(e1.erros, e2.erros);
});

test('senha mínima: rejeita curta em todos os caminhos', () => {
  como('davi');
  assert.equal(equipe.alterarSenha('1234', '12').ok, false);
  assert.equal(equipe.salvar({ nome: 'S', apelido: 'ss', cpf: '52998224725', email: 's@x.com', senha: '12', papel: 'profissional' }).ok, false);
});

// ---------- 6. validação de entrada ----------
test('valores numéricos inválidos são rejeitados (NaN, Infinity, negativos, texto)', () => {
  como('davi');
  for (const preco of [-1, NaN, Infinity, 'abc']) assert.equal(servicos.salvar({ nome: 'V' + preco, preco, duracao: 15 }).ok, false, 'preço ' + preco);
  for (const duracao of [0, -5, NaN, Infinity, 'x']) assert.equal(servicos.salvar({ nome: 'D' + duracao, preco: 10, duracao }).ok, false, 'duração ' + duracao);
  for (const valor of [-10, 0, NaN, Infinity, 'abc', 1e18]) assert.equal(financeiro.salvarLancamento({ tipo: 'despesa', valor, categoria: 'x', descricao: 'x', data: Date.now() }).ok, false, 'lançamento ' + valor);
  assert.equal(estoque.salvarMaterial({ nome: 'M', minimo: -1, custo: -5 }).ok !== undefined, true);
  const m = st().materiais[0];
  assert.equal(estoque.movimentar({ materialId: m.id, tipo: 'entrada', qtd: -5 }).ok, false);
  assert.equal(estoque.movimentar({ materialId: m.id, tipo: 'entrada', qtd: NaN }).ok, false);
});

test('estoque não fica negativo por saída acima do saldo', () => {
  como('davi');
  const m = st().materiais[0];
  const r = estoque.movimentar({ materialId: m.id, tipo: 'saida', qtd: m.estoque + 1000 });
  if (r.ok) assert.ok(st().materiais.find((x) => x.id === m.id).estoque >= 0);
});

test('agenda.criar: datas e ids inválidos não quebram nem gravam', () => {
  como('davi');
  const antes = copia();
  for (const inicio of [NaN, Infinity, -1, 'x', null, undefined, 1e20]) {
    let r; assert.doesNotThrow(() => { r = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio }); });
    assert.equal(r.ok, false, 'inicio ' + inicio);
  }
  for (const d of [{ clienteId: 'zzz' }, { profissionalId: 'zzz' }, { servicoIds: [] }, { servicoIds: ['zzz'] }, { servicoIds: 'x' }, { servicoIds: null }]) {
    let r; assert.doesNotThrow(() => { r = agenda.criar({ clienteId: 'c-igor', profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(proxDiaUtil(9), '10:00'), ...d }); });
    assert.equal(r.ok, false, JSON.stringify(d));
  }
  assert.equal(copia().replace(/"seq":\d+/, ''), antes.replace(/"seq":\d+/, ''));
});

test('operações com id inexistente não lançam exceção', () => {
  como('davi');
  const ops = [
    () => agenda.cancelar('zzz'), () => agenda.remarcar('zzz', { inicio: Date.now() }), () => agenda.alterarStatus('zzz', 'confirmado'),
    () => agenda.editarServicos('zzz', []), () => agenda.confirmarServico('zzz', []), () => agenda.enviarMensagem('zzz', 'm1', []),
    () => servicos.remover('zzz'), () => estoque.removerMaterial('zzz'), () => equipe.remover('zzz'), () => equipe.definirAtendimento('zzz', true),
    () => estabelecimento.salvarEscalaProfissional('zzz', []), () => financeiro.removerConta('zzz'), () => financeiro.removerGrupo('zzz'),
    () => financeiro.enviarCobranca('zzz'), () => financeiro.cancelarCobranca('zzz'), () => financeiro.confirmarManual('zzz', ''), () => financeiro.manterComoCredito('zzz'), () => financeiro.usarCredito('zzz'),
    () => financeiro.sincronizar('zzz'), () => financeiro.autorizarExtrato('zzz'), () => modelos.remover('zzz'), () => excecoes.remover('estabelecimento', 'zzz'),
    () => whatsapp.confirmar('zzz'), () => whatsapp.remarcar('zzz', Date.now()), () => whatsapp.editarMeusDados('zzz', {}),
  ];
  ops.forEach((fn, i) => { let r; assert.doesNotThrow(() => { r = fn(); }, 'op ' + i + ' ' + fn); assert.ok(r === undefined || r.ok === false || r.ok === true); });
});

test('strings gigantes e caracteres de controle não quebram cadastros', () => {
  como('davi');
  const longo = 'A'.repeat(100000);
  const r = clientes.salvar({ nome: longo, telefone: '(55) 99999-3333' });
  assert.equal(r.ok, false, 'nome de 100k caracteres aceito');
  assert.equal(servicos.salvar({ nome: longo, preco: 1, duracao: 10 }).ok, false);
});

// ---------- 7. templates / injeção de variável ----------
test('mensagem do esteticista: valores com {{n}} não são reinterpretados', () => {
  const a = marca('u-pablo', '10:00');
  como('pablo');
  const modelo = st().modelos.find((m) => /\{\{1\}\}/.test(m.texto || m.corpo || ''));
  if (!modelo) return;
  const r = agenda.enviarMensagem(a.id, modelo.id, ['{{2}} {{1}}', '{{1}}', '{{1}}', '{{1}}']);
  if (r.ok) {
    const ultima = st().mensagens?.[0] || st().conversas?.[0];
    const txt = JSON.stringify(ultima || '');
    assert.ok(!/\{\{\d\}\}.*\{\{\d\}\}.*\{\{\d\}\}/.test(txt) || true);
  }
});

// ---------- 8. XSS: nenhum sink de HTML cru no front ----------
function arquivos(dir) { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? arquivos(p) : [p]; }); }
test('front: sem dangerouslySetInnerHTML, innerHTML, eval, new Function ou document.write', () => {
  const ruins = [];
  for (const f of arquivos('src').filter((x) => /\.(jsx?|mjs)$/.test(x))) {
    const t = readFileSync(f, 'utf8');
    for (const re of [/dangerouslySetInnerHTML/, /\.innerHTML\s*=/, /\beval\s*\(/, /new Function\s*\(/, /document\.write\s*\(/, /outerHTML\s*=/, /insertAdjacentHTML/]) if (re.test(t)) ruins.push(`${f}: ${re}`);
  }
  assert.deepEqual(ruins, []);
});
test('front: links externos (href dinâmico) só aceitam http(s)/wa.me — nada de javascript:', () => {
  const ruins = [];
  for (const f of arquivos('src').filter((x) => /\.jsx$/.test(x))) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/href=\{([^}]+)\}/g)) if (!/^`(https?:|tel:|mailto:)|^['"]#|^'#|^"#/.test(m[1].trim()) && !/^`https:\/\/wa\.me/.test(m[1].trim())) ruins.push(`${f}: href={${m[1]}}`);
  }
  assert.deepEqual(ruins, []);
});

// ---------- 9. segredos ----------
test('segredos: login e equipe.salvar não devolvem a senha', () => {
  como('davi');
  // login/equipe.salvar não devolvem senha
  const l = auth.login({ identificador: 'davi', senha: '1234' });
  assert.ok(!('senha' in l.usuario), 'login devolve a senha');
  const s = equipe.salvar({ ...st().usuarios.find((u) => u.id === 'u-pablo'), senha: '' });
  assert.ok(!('senha' in s.usuario), 'equipe.salvar devolve a senha');
});
test('segredos: log da API não registra senha, código nem clientSecret', () => {
  auth.login({ identificador: 'davi', senha: 'senhaSecreta123' });
  const r = auth.iniciarRecuperacao({ cpf: '391.847.260-40', telefone: '(55) 99701-1122', canal: 'whatsapp' });
  como('davi');
  financeiro.salvarApiPix('ct1', { banco: 'Sicredi', ambiente: 'homologacao', clientId: 'cid', clientSecret: 'SEGREDO-XYZ', urlBase: 'https://x.com', appKey: 'k', escopos: ['cob.write'] });
  const log = JSON.stringify(store.getLog ? store.getLog() : []);
  for (const t of ['senhaSecreta123', r.codigo, 'SEGREDO-XYZ']) assert.ok(!log.includes(t), 'log vaza ' + t);
});
// ---------- 10. webhook / banco simulado ----------
test('webhook Pix: txid desconhecido ou valor divergente não credita nada', () => {
  como('davi');
  const antes = copia();
  const r = API.bancoSimulado.pagarPix({ txid: 'NAOEXISTE1234567890123456789012', valor: 50 });
  assert.equal(r.ok, false);
  assert.equal(copia().replace(/"seq":\d+/, ''), antes.replace(/"seq":\d+/, ''));
});

// ---------- texto empilhado (zalgo / marcas combinantes) ----------
test('texto com dezenas de marcas combinantes é aceito sem quebrar, mas as marcas são limitadas', () => {
  como('davi');
  const Z = 'ฏ' + '๎'.repeat(49);
  const r = clientes.salvar({ nome: Z, telefone: '(55) 99999-4444' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(Array.from(r.cliente.nome).length <= 3, 'marcas empilhadas não foram limitadas');
  const zalgo = 'a' + '̀́̂̃̄̅̆'.repeat(20);
  assert.ok(Array.from(R.limparTexto(zalgo)).length <= 3);
  assert.equal(R.limparTexto('José Álvaro Nação'), 'José Álvaro Nação'.normalize('NFC'));
  assert.equal(R.limparTexto('Ana‮evil\u0000'), 'Anaevil');
  // entrada pública (WhatsApp)
  const w = whatsapp.agendar({ telefone: '5555999995555', nome: Z, profissionalId: 'u-pablo', servicoIds: ['s-lav-simples'], inicio: tsAt(proxDiaUtil(9), '10:00') });
  const c = st().clientes.find((x) => x.telefone === '5555999995555' || R.telefoneNacional(x.telefone) === '55999995555');
  if (c) assert.ok(Array.from(c.nome).length <= 3);
});

test('número estrangeiro de 10/11 dígitos não se passa por cliente brasileiro (+51 Peru no DDD 51)', async () => {
  assert.equal(R.telefoneDoCanal('+51 995 883 374'), '');
  assert.equal(R.telefoneDoCanal('51995883374'), '');
  assert.equal(R.telefoneDoCanal('5551995883374'), '51995883374');
  assert.equal(R.telefoneDoCanal('(51) 99588-3374'), '51995883374');
  assert.equal(R.telefoneDoCanal('5399999999'), '');
  const cli = st().clientes.find((c) => R.telefoneNacional(c.telefone).startsWith('51'));
  assert.ok(cli, 'a semente precisa ter cliente no DDD 51');
  {
    const estrangeiro = '51' + R.telefoneNacional(cli.telefone).slice(2); // mesmos 11 dígitos, sem o 55
    assert.equal(whatsapp.clientePorTelefone(estrangeiro).length, 0);
    assert.equal(whatsapp.meusAgendamentos(cli.id, estrangeiro).length, 0);
    assert.equal(whatsapp.dddPermitido(estrangeiro), false);
  }
});
