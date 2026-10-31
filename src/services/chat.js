/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:fcae87602d */
// Simulador de WhatsApp: o cliente conversa com o "robô" da loja e cada ação vira uma chamada à API (/whatsapp/...).
// Em produção, o robô é a integração do WhatsApp; aqui ele só traduz mensagens em chamadas ao mesmo contrato.
import { marcar } from '../domain/autoria.js';
import { store, whatsapp } from './api.js';
import * as R from '../domain/rules.js';
import { EXEMPLO_PORTE, ROTULO_PORTE, formatarPlaca, placaValida, porteAtivo, portesAtivos, resumoVeiculo, veiculoPorPlaca } from '../domain/veiculos.js';
import { addDays, DIAS_CURTOS, fmtDate, fmtDateShort, fmtHM, fmtMoney, minutesOfDay, startOfDay, tsAt } from '../domain/time.js';
import { capAtiva, Rot, rot, rots, voc } from '../domain/tipos.js';

const tel = (t) => R.somenteDigitos(t);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

let threads = {};
let atual = '(55) 99711-4020';
let snap = null;
let seq = 0;
const listeners = new Set();
const emit = () => { snap = { threads: { ...threads }, atual }; listeners.forEach((l) => l()); };

function thread(t = atual) {
  const k = tel(t);
  if (!threads[k]) threads[k] = { telefone: t, mensagens: [], etapa: 'inicio', ctx: {}, cliques: [], opcoes: [], base: [], erros: 0 };
  return threads[k];
}
emit();

export const chat = {
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  getSnapshot: () => snap,
  telefoneAtual: () => atual,
  trocarNumero(t) { atual = t; thread(t); emit(); },
  reiniciar() { threads = {}; atual = '(55) 99711-4020'; thread(); emit(); },
  enviar,
  clicarModelo,
  threadAtual: () => thread(),
};

// ---------- opções: toda resposta do robô oferece o que dá para escolher ----------
// Padrão de WhatsApp: o cliente responde com o NÚMERO, com a palavra (exata ou aproximada) ou toca no botão.
// Até 3 opções viram botões de resposta; mais que isso vira uma lista (até 10 linhas, como a lista interativa da Meta).
// O texto sempre traz as opções numeradas, para funcionar também no canal só de texto.
const B = (rotulo, valor, alias = []) => ({ rotulo, valor, alias });
const MENU = [
  B('Agendar horário', 'menu:agendar', ['agendar', 'marcar', 'marcar horario', 'horario', 'novo', 'lavagem', 'estetica']),
  B('Meus horários', 'menu:meus', ['meus', 'meu horario', 'consultar', 'proximos', 'ver']),
  B('Meu crédito', 'menu:credito', ['credito', 'saldo', 'meu saldo', 'creditos']),
  B('Meus dados', 'menu:dados', ['dados', 'cadastro', 'cpf', 'nome', 'nascimento']),
];
const VOLTAR = B('Voltar ao menu', 'menu', ['menu', 'voltar', 'inicio', 'sair']);
const SIM_NAO = [B('Sim, agendar', 'sim', ['sim', 's', 'ok', 'pode', 'agendar', 'confirmar']), B('Remover serviço', 'res:rm', ['remover', 'tirar', 'retirar', 'excluir']), B('Não', 'nao', ['nao', 'n'])];
const PULAR = [B('Pular', 'pular', ['pular', 'nao quero', 'depois', 'nao'])];

function push(th, de, texto, botoes) {
  th.mensagens = [...th.mensagens, { id: `m${++seq}`, de, texto, botoes: botoes || [], em: store.agora() }];
}
function bot(th, texto, opcoes = [], { dica, semVoltar } = {}) {
  const ehMenu = opcoes === MENU;
  const base = ehMenu ? MENU : opcoes.slice(0, 9); // lista da Meta: no máximo 10 linhas, contando o "Voltar ao menu"
  th.base = base;
  const lista = ehMenu || semVoltar ? base : [...base, VOLTAR];
  th.opcoes = lista;
  const numeradas = base.map((o, i) => `${i + 1} - ${o.rotulo}`);
  const volta = lista.includes(VOLTAR) ? ['0 - Voltar ao menu'] : [];
  const rodape = base.length ? `\n\n${[...numeradas, ...volta].join('\n')}\n\n${dica || 'Responda com o número ou toque em uma opção.'}` : volta.length ? `\n\n${volta.join('\n')}` : '';
  push(th, 'bot', texto + rodape, lista.map((o) => ({ rotulo: o.rotulo, valor: o.valor, n: o === VOLTAR ? 0 : base.indexOf(o) + 1 })));
}
const repetir = (th, msg, opts) => bot(th, msg, th.base, opts);

// Distância de edição, para aceitar "agedar" por "agendar".
function distancia(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[n];
}
const palavras = (s) => norm(s).replace(/[^a-z0-9/:]+/g, ' ').split(' ').filter(Boolean);
function pontuar(o, q) {
  const nl = norm(o.rotulo), al = (o.alias || []).map(norm), tq = palavras(q);
  if (nl === q) return 100;
  if (al.includes(q) || palavras(o.rotulo)[0] === q && q.length > 3 && nl.startsWith(q + ' —')) return 90;
  if (q.length >= 3 && nl.startsWith(q)) return 80;
  if ((q.length >= 3 && nl.includes(q)) || (nl.length >= 4 && q.includes(nl))) return 70;
  const alvo = new Set([...palavras(o.rotulo), ...al.flatMap(palavras)]);
  // Cada palavra escrita conta se bate com uma do rótulo, exata ou com erro de digitação ("agendr horario" ganha de "meus horários").
  const parecida = (w) => w.length >= 4 && [...alvo].some((x) => x.length >= 4 && distancia(w, x) <= (w.length >= 7 ? 2 : 1));
  const acertos = tq.filter((w) => w.length >= 3 && (alvo.has(w) || parecida(w))).length;
  return acertos ? 30 + acertos : 0;
}
// Resolve o que o cliente escreveu contra as opções que acabou de receber.
function casar(opcoes, n, { aproximado = true } = {}) {
  const itens = opcoes.filter((o) => o !== VOLTAR);
  if (/^0$/.test(n)) return { opcao: VOLTAR };
  const num = n.match(/^(\d{1,2})[.)]?$/);
  if (num) { const o = itens[Number(num[1]) - 1]; return o ? { opcao: o } : { numeroInvalido: true }; }
  if (!n) return null;
  const pts = opcoes.map((o) => ({ o, p: pontuar(o, n) })).filter((x) => x.p >= (aproximado ? 30 : 70)).sort((a, b) => b.p - a.p);
  if (!pts.length) return null;
  const topo = pts.filter((x) => x.p === pts[0].p);
  return topo.length === 1 ? { opcao: topo[0].o } : { ambiguo: topo.map((x) => x.o) };
}

function nomeDe(c) { return c.apelido || c.nome.split(' ')[0]; }
const nomeLoja = () => String(store.getState().estabelecimento?.nome || '').trim() || Rot('loja');
function clienteDe(th) { return th.ctx.clienteId ? store.getState().clientes.find((c) => c.id === th.ctx.clienteId) : null; }
const nomeServico = (s) => `${s.nome} — ${fmtMoney(s.preco)}`;
const opcoesServicos = (lista) => lista.map((s) => B(nomeServico(s), `srv:${s.id}`, [s.nome]));

// ---------- entrada ----------
function enviar(texto, valor) {
  const th = thread();
  const t = String(texto || '').trim();
  if (!t && !valor) return;
  push(th, 'cliente', t, []);
  try { responder(th, t, valor); } catch (e) { push(th, 'bot', 'Tive um problema para processar sua mensagem. Pode tentar de novo?', []); console.error(e); }
  emit();
}

function clicarModelo(msgId, rotulo) {
  const th = thread();
  const m = store.getState().mensagensCliente.find((x) => x.id === msgId);
  if (!m || th.cliques.includes(msgId)) return;
  th.cliques = [...th.cliques, msgId];
  push(th, 'cliente', rotulo, []);
  const c = store.getState().clientes.find((x) => x.id === m.clienteId);
  if (c) { th.ctx.clienteId = c.id; if (th.etapa === 'inicio') th.etapa = 'menu'; }
  if (rotulo === 'Confirmar') {
    const r = whatsapp.confirmar(m.agendamentoId, th.telefone);
    if (r.ok) bot(th, `Horário confirmado ✅ Te esperamos em ${fmtDate(r.agendamento.inicio)} às ${fmtHM(r.agendamento.inicio)}.`, MENU);
    else bot(th, r.erros[0], r.erros[0].includes('ocupado') ? [B('Remarcar', `rem:${m.agendamentoId}`)] : MENU);
  } else if (rotulo === 'Remarcar') {
    iniciarRemarcar(th, m.agendamentoId);
  } else if (rotulo === 'Cancelar') {
    pedirCancelamento(th, m.agendamentoId);
  }
  emit();
}

const TEXTO_LIVRE = ['cad_nome', 'cad_cpf', 'cad_nasc', 'dados_valor', 'cupom_chave', 'vei_placa', 'vei_modelo'];
function atalhos(th, valor) { // true quando a escolha já foi tratada
  if (valor && valor.startsWith('rem:')) { iniciarRemarcar(th, valor.slice(4)); return true; }
  if (valor && valor.startsWith('ag:')) { acoesDoAgendamento(th, valor.slice(3)); return true; }
  if (valor && valor.startsWith('alt:')) { iniciarEditar(th, valor.slice(4)); return true; }
  if (valor && valor.startsWith('cred:')) { usarCreditoNoChat(th, valor.slice(5)); return true; }
  if (valor && valor.startsWith('cup:')) { pedirCupom(th, valor.slice(4)); return true; }
  if (valor && valor.startsWith('canc:')) { pedirCancelamento(th, valor.slice(5)); return true; }
  if (valor && valor.startsWith('conf:')) { confirmarPorChip(th, valor.slice(5)); return true; }
  return false;
}

function responder(th, texto, valor) {
  const n = norm(texto);
  if (!whatsapp.dddPermitido(th.telefone)) {
    if (!th.ctx.bloqueado) whatsapp.bloquearDdd(th.telefone);
    th.ctx.bloqueado = true;
    return;
  }
  th.ctx.bloqueado = false;
  if (!TEXTO_LIVRE.includes(th.etapa) && !valor && (/^(cancelar|cancela|desmarcar)\b/.test(n) || n.includes('quero cancelar'))) return iniciarCancelar(th);
  const pedeMenu = valor === 'menu' || n === '0' || n === 'menu';
  const saudacao = /^(oi|ola|bom dia|boa tarde|boa noite|inicio|voltar)\b/.test(n) && !TEXTO_LIVRE.includes(th.etapa);
  if (pedeMenu || saudacao) return saudar(th);
  if (atalhos(th, valor)) return;
  if (th.etapa === 'inicio') return saudar(th);

  // O cliente pode escrever em vez de tocar: número, palavra exata ou aproximada. Vários números ("1,3") valem na escolha de serviços.
  if (!valor && th.opcoes.length) {
    if (th.etapa === 'servicos' && /^\d{1,2}(\s*(,|e|\s)\s*\d{1,2})+$/.test(n)) {
      const ids = [...new Set(n.split(/\D+/).filter(Boolean).map((x) => th.base[Number(x) - 1]).filter((o) => o && o.valor.startsWith('srv:') && o.valor !== 'srv:ok' && o.valor !== 'srv:rm').map((o) => o.valor.slice(4)))];
      if (ids.length) valor = `srv:multi:${ids.join(',')}`;
    }
    // Datas e horas escritas à mão não passam por aproximação (14:20 não pode virar 14:00); nomes e CPF nunca viram opção.
    const livre = TEXTO_LIVRE.includes(th.etapa) && !th.base.length;
    if (!valor && !livre) {
      const r = casar(th.opcoes, n, { aproximado: !['dia', 'rem_dia', 'hora', 'rem_hora', ...TEXTO_LIVRE].includes(th.etapa) });
      if (r && r.opcao) { valor = r.opcao.valor; if (valor === 'menu') return saudar(th); if (atalhos(th, valor)) return; }
      else if (r && r.ambiguo) return bot(th, 'Qual destas você quer?', r.ambiguo.filter((o) => o !== VOLTAR), { semVoltar: false });
      else if (r && r.numeroInvalido && !['dia', 'rem_dia', 'hora', 'rem_hora'].includes(th.etapa)) { th.erros++; return repetir(th, `Não existe essa opção. Escolha um dos números abaixo.`); }
    }
  }
  th.erros = valor ? 0 : th.erros;
  switch (th.etapa) {
    case 'quem': return etapaQuem(th, valor);
    case 'menu': return etapaMenu(th, valor);
    case 'cancelar_conf': return etapaCancelar(th, valor);
    case 'edicao': return etapaEdicao(th, valor);
    case 'veiculo': return etapaVeiculo(th, valor);
    case 'vei_placa': return etapaPlaca(th, texto);
    case 'vei_modelo': return etapaModelo(th, texto);
    case 'vei_porte': return etapaPorte(th, valor);
    case 'servicos': return etapaServicos(th, valor);
    case 'servicos_rm': case 'resumo_rm': return etapaRemover(th, valor);
    case 'dia': case 'rem_dia': return etapaDia(th, n, valor);
    case 'hora': case 'rem_hora': return etapaHora(th, texto, valor);
    case 'profissional': return etapaProfissional(th, valor);
    case 'cad_nome': return etapaNome(th, texto);
    case 'cad_cpf': return etapaCpf(th, texto, valor);
    case 'cad_nasc': return etapaNascimento(th, texto, valor);
    case 'resumo': return etapaResumo(th, valor);
    case 'dados_campo': return etapaDadosCampo(th, valor);
    case 'dados_valor': return etapaDadosValor(th, texto);
    case 'cupom_chave': return etapaCupom(th, texto);
    default: return saudar(th);
  }
}

// ---------- primeiro contato: já mostra as opções ----------
function saudar(th) {
  const lista = whatsapp.clientePorTelefone(th.telefone);
  const novo = th.ctx.novoCliente;
  th.ctx = { bloqueado: false, ...(novo && !lista.length ? { novoCliente: novo } : {}) };
  if (lista.length === 1) {
    th.ctx.clienteId = lista[0].id;
    th.etapa = 'menu';
    return bot(th, `${marcar(`Olá, ${nomeDe(lista[0])}! ${voc('saudacaoVolta', { nome: nomeLoja() })}`)}\nO que você quer fazer?`, MENU);
  }
  if (lista.length > 1) {
    th.etapa = 'quem';
    return bot(th, `Olá! ${voc('saudacao', { nome: nomeLoja() })}\nEsse número tem mais de um cadastro. Quem está falando?`, [...lista.map((c) => B(nomeDe(c), `quem:${c.id}`, [c.nome, c.apelido || ''].filter(Boolean))), B('Outra pessoa', 'quem:novo', ['outra', 'novo', 'outro'])], { semVoltar: true });
  }
  th.etapa = 'menu';
  return bot(th, marcar(`Olá! ${voc('saudacao', { nome: nomeLoja() })}`) + '\nO que você quer fazer?', MENU);
}

function etapaQuem(th, valor) {
  if (valor === 'quem:novo') { th.ctx.varios = true; th.etapa = 'menu'; return bot(th, 'Tudo bem! O cadastro dessa pessoa é feito junto com o agendamento. O que você quer fazer?', MENU); }
  const id = valor && valor.startsWith('quem:') ? valor.slice(5) : null;
  const c = id && whatsapp.clientePorTelefone(th.telefone).find((x) => x.id === id); // só vale cadastro desse número
  if (!c) return repetir(th, 'Escolha quem está falando:', { semVoltar: true });
  th.ctx.clienteId = c.id; th.etapa = 'menu';
  return bot(th, `Olá, ${nomeDe(c)}! O que você quer fazer?`, MENU);
}

// Cadastro de cliente novo: só é pedido na hora de agendar (nome obrigatório; CPF e nascimento opcionais).
function etapaNome(th, texto) {
  const nome = texto.trim();
  if (nome.length < 2) return bot(th, 'Pode me dizer seu nome ou apelido?');
  th.ctx.nome = nome;
  th.etapa = 'cad_cpf';
  return bot(th, `Prazer, ${nome}! Quer informar o seu CPF? É opcional.`, PULAR, { dica: 'Escreva o CPF (11 números) ou toque em Pular.' });
}

function etapaCpf(th, texto, valor) {
  if (valor !== 'pular') {
    const d = R.somenteDigitos(texto);
    if (d.length !== 11) return bot(th, 'O CPF precisa ter 11 números. Quer tentar de novo ou pular?', PULAR, { dica: 'Escreva o CPF (11 números) ou toque em Pular.' });
    th.ctx.cpf = R.formatarCpf(d);
  }
  th.etapa = 'cad_nasc';
  return bot(th, 'E a data de nascimento? (dd/mm/aaaa) Também é opcional.', PULAR, { dica: 'Escreva dd/mm/aaaa ou toque em Pular.' });
}

function etapaNascimento(th, texto, valor) {
  if (valor !== 'pular') {
    const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return bot(th, 'Use o formato dd/mm/aaaa, por exemplo 25/03/1990. Ou pule.', PULAR, { dica: 'Escreva dd/mm/aaaa ou toque em Pular.' });
    th.ctx.nascimento = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  th.ctx.novoCliente = { nome: th.ctx.nome, cpf: th.ctx.cpf || '', nascimento: th.ctx.nascimento || '' };
  return resumo(th, th.ctx.prefixo || '');
}

// ---------- menu ----------
function etapaMenu(th, v) {
  if (v === 'menu:agendar') return iniciarAgendamento(th);
  if (v === 'menu:meus') return listarMeus(th);
  if (v === 'menu:credito') return mostrarCredito(th);
  if (v === 'menu:dados') return iniciarDados(th);
  th.erros++;
  return bot(th, th.erros > 1 ? 'Não entendi. Responda só com o número da opção (1, 2, 3 ou 4):' : 'Não entendi. Escolha uma opção:', MENU);
}

function listarMeus(th) {
  const c = clienteDe(th);
  if (!c) return bot(th, 'Você ainda não tem horários marcados.', MENU);
  const lista = whatsapp.meusAgendamentos(c.id, th.telefone).slice(0, 6);
  if (!lista.length) return bot(th, 'Você não tem horários marcados.', MENU);
  if (lista.length === 1) return acoesDoAgendamento(th, lista[0].id);
  const st = store.getState();
  const linhas = lista.map((a) => `• ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}, ${R.servicosPorIds(st, a.servicoIds).map((s) => s.nome).join(' + ')}${a.veiculo ? ` (${resumoVeiculo(a.veiculo)})` : ''} com ${st.usuarios.find((u) => u.id === a.profissionalId).apelido} (${R.ROTULO_STATUS[a.status].toLowerCase()})`);
  th.etapa = 'menu';
  return bot(th, `Seus próximos horários:\n${linhas.join('\n')}\n\nQual deles você quer ver?`, lista.map((a) => B(`${fmtDateShort(a.inicio)} ${fmtHM(a.inicio)}`, `ag:${a.id}`, [fmtDate(a.inicio)])));
}

// O que dá para fazer com um horário: confirmar, remarcar, alterar os serviços, cancelar (24 h ou mais) e usar crédito.
function acoesDoAgendamento(th, id) {
  const a = whatsapp.meusAgendamentos(th.ctx.clienteId, th.telefone).find((x) => x.id === id);
  if (!a) { th.etapa = 'menu'; return bot(th, 'Esse horário não está mais ativo.', MENU); }
  const st = store.getState();
  const val = whatsapp.valoresDoHorario(id, th.telefone);
  const credito = whatsapp.creditoUsavel(id, th.telefone);
  th.etapa = 'menu';
  return bot(th, `Horário de ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)} com ${st.usuarios.find((u) => u.id === a.profissionalId).apelido} (${R.ROTULO_STATUS[a.status].toLowerCase()}):\n${linhasValores(val)}\nO que você quer fazer?`, [
    ...(a.status === R.STATUS.A_CONFIRMAR ? [B('Confirmar', `conf:${id}`, ['confirmar'])] : []),
    B('Remarcar', `rem:${id}`, ['remarcar']),
    B('Alterar serviços', `alt:${id}`, ['alterar', 'servicos', 'trocar servico', 'adicionar servico']),
    ...(whatsapp.podeCancelar(id, th.telefone) ? [B('Cancelar horário', `canc:${id}`, ['cancelar'])] : []),
    ...(credito > 0 ? [B(`Usar meu crédito (${fmtMoney(credito)})`, `cred:${id}`, ['usar credito', 'credito'])] : []),
    ...(!val.cupom && [R.STATUS.A_CONFIRMAR, R.STATUS.CONFIRMADO].includes(a.status) ? [B('Tenho um cupom', `cup:${id}`, ['cupom', 'tenho um cupom', 'vale'])] : []),
  ]);
}

// ---------- alterar os serviços de um horário já marcado ----------
function iniciarEditar(th, id) {
  const a = whatsapp.meusAgendamentos(th.ctx.clienteId, th.telefone).find((x) => x.id === id);
  if (!a) { th.etapa = 'menu'; return bot(th, 'Esse horário não está mais ativo.', MENU); }
  th.ctx.editarId = id;
  th.ctx.servicosAntes = [...a.servicoIds];
  th.ctx.porte = a.porte;
  th.ctx.servicoIds = [...a.servicoIds];
  th.ctx.remarcarProfissional = null;
  return promptServicos(th, `Horário de ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}. `);
}

// Valores como ficaram combinados no horário (preço congelado; acréscimo do profissional à parte), nunca o preço atual do catálogo.
const linhasValores = (v) => `${v.itens.map((i) => `• ${i.nome} — ${fmtMoney(i.valor)}`).join('\n')}${v.acrescimos > 0 ? `\nAcréscimos: ${fmtMoney(v.acrescimos)}` : ''}${v.descontos > 0 ? `\nCupom ${v.cupom || ''}: − ${fmtMoney(v.descontos)}` : ''}\nTotal: ${fmtMoney(v.total)}`;

function resumoEdicao(th) {
  const antes = whatsapp.valoresDoHorario(th.ctx.editarId, th.telefone);
  const depois = whatsapp.valoresDoHorario(th.ctx.editarId, th.telefone, th.ctx.servicoIds);
  const igual = th.ctx.servicoIds.length === th.ctx.servicosAntes.length && th.ctx.servicoIds.every((x) => th.ctx.servicosAntes.includes(x));
  if (igual) { th.ctx.editarId = null; th.etapa = 'menu'; return bot(th, 'Os serviços continuam os mesmos, não alterei nada.', MENU); }
  th.etapa = 'edicao';
  return bot(th, `Confira a alteração:\nAntes: ${antes.itens.map((s) => s.nome).join(' + ')} (${fmtMoney(antes.total)})\nDepois:\n${linhasValores(depois)}\nVocê vai receber uma mensagem para confirmar o horário com os novos serviços. Posso alterar?`, [B('Sim, alterar', 'ed:sim', ['sim', 'alterar', 'ok']), B('Ajustar serviços', 'ed:ajustar', ['ajustar', 'mudar', 'voltar']), B('Não alterar', 'ed:nao', ['nao', 'n'])]);
}

function etapaEdicao(th, v) {
  if (v === 'ed:ajustar') return promptServicos(th);
  if (v === 'ed:nao') { th.ctx.editarId = null; th.etapa = 'menu'; return bot(th, 'Tudo bem, os serviços continuam como estavam.', MENU); }
  if (v !== 'ed:sim') return repetir(th, 'Responda 1 para alterar, 2 para ajustar ou 3 para não alterar.');
  const r = whatsapp.editarServicos(th.ctx.editarId, th.ctx.servicoIds, th.telefone);
  th.etapa = 'menu';
  th.ctx.editarId = null;
  if (!r.ok) return bot(th, r.erros[0], MENU);
  return bot(th, `Serviços alterados ✅ Enviei uma mensagem para você confirmar o horário de ${fmtDate(r.agendamento.inicio)} às ${fmtHM(r.agendamento.inicio)} com os novos serviços.`, MENU);
}

// ---------- meu crédito ----------
// O crédito só existe depois que a loja revisou e confirmou um valor pago; vale por 2 meses.
function mostrarCredito(th) {
  const c = clienteDe(th);
  if (!c) return bot(th, 'Ainda não tenho seu cadastro, então você não tem crédito. Ele é criado junto com o primeiro agendamento.', MENU);
  const cr = whatsapp.meuCredito(c.id, th.telefone);
  th.etapa = 'menu';
  if (!cr.total) return bot(th, `Você não tem crédito no momento. O crédito aparece aqui quando a ${rot('loja')} confirma um valor que você pagou e não foi usado.`, MENU);
  const linhas = cr.itens.map((i) => `• ${fmtMoney(i.valor)} — vale até ${fmtDate(i.venceEm)}`);
  const usaveis = whatsapp.meusAgendamentos(c.id, th.telefone).filter((a) => whatsapp.creditoUsavel(a.id, th.telefone) > 0).slice(0, 6);
  const base = `Seu crédito: ${fmtMoney(cr.total)}\n${linhas.join('\n')}\nO crédito vale por 2 meses. Se não cobrir todo o valor, a diferença é paga separadamente, direto à ${rot('loja')}.`;
  if (!usaveis.length) return bot(th, `${base}\n\nVocê não tem horário com valor a pagar. Marque um horário e use o crédito nele.`, MENU);
  return bot(th, `${base}\n\nQuer usar em algum horário?`, usaveis.map((a) => B(`Usar em ${fmtDateShort(a.inicio)} ${fmtHM(a.inicio)}`, `cred:${a.id}`, [fmtDate(a.inicio)])));
}

function usarCreditoNoChat(th, id) {
  const r = whatsapp.usarCredito(id, th.telefone);
  th.etapa = 'menu';
  if (!r.ok) return bot(th, r.erros[0], MENU);
  const resta = (r.resta > 0 ? ` Crédito restante: ${fmtMoney(r.resta)}.` : '') + (r.pixCancelado ? ' O Pix que estava pendente foi cancelado: não pague o código antigo.' : '');
  if (r.falta > 0) return bot(th, `Usei ${fmtMoney(r.total)} do seu crédito. Faltam ${fmtMoney(r.falta)}, que devem ser pagos separadamente, direto à ${rot('loja')} (Pix).${resta}`, MENU);
  return bot(th, `Pronto! Esse horário ficou pago com o seu crédito (${fmtMoney(r.total)}) ✅${resta}`, MENU);
}

// ---------- cupom ou vale: o cliente escreve a chave; a API confere (a mesma resposta para chave errada, vencida ou esgotada) ----------
function pedirCupom(th, id) {
  th.etapa = 'cupom_chave'; th.cupomAg = id;
  return bot(th, 'Qual é a chave do seu cupom ou vale? Escreva como recebeu (ex.: XXXX-XXXX-XXXX).', [], { semVoltar: false });
}
function etapaCupom(th, texto) {
  const id = th.cupomAg; th.etapa = 'menu';
  const r = whatsapp.usarCupom(id, th.telefone, texto.trim());
  if (!r.ok) return bot(th, r.erros[0], [B('Tentar outra chave', `cup:${id}`, ['tentar', 'outra'])]);
  const val = whatsapp.valoresDoHorario(id, th.telefone);
  const falta = whatsapp.aPagar(id, th.telefone);
  return bot(th, `Cupom aplicado ✅ ${r.nome}: desconto de ${fmtMoney(r.desconto)}.\n${linhasValores(val)}${falta > 0 ? `\nFalta pagar: ${fmtMoney(falta)}.` : ''}`, MENU);
}

// ---------- cancelar (só com 24 h ou mais de antecedência; a API confere de novo na hora) ----------
const descAg = (a) => `${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}, ${R.servicosPorIds(store.getState(), a.servicoIds).map((s) => s.nome).join(' + ')}`;
function iniciarCancelar(th) {
  const c = clienteDe(th);
  const todos = c ? whatsapp.meusAgendamentos(c.id, th.telefone) : [];
  if (!todos.length) { th.etapa = 'menu'; return bot(th, 'Você não tem horários marcados para cancelar.', MENU); }
  const ok = todos.filter((a) => whatsapp.podeCancelar(a.id, th.telefone)).slice(0, 6);
  if (!ok.length) {
    th.etapa = 'menu';
    return bot(th, 'Faltam menos de 24 horas para o seu horário (ou ele foi remarcado dentro desse prazo), e por aqui só dá para cancelar com 24 horas ou mais de antecedência. Você ainda pode confirmar ou remarcar.', [...(todos[0].status === R.STATUS.A_CONFIRMAR ? [B('Confirmar', `conf:${todos[0].id}`, ['confirmar'])] : []), B('Remarcar', `rem:${todos[0].id}`, ['remarcar'])]);
  }
  if (ok.length === 1) return pedirCancelamento(th, ok[0].id);
  th.etapa = 'menu';
  return bot(th, 'Qual horário você quer cancelar?', ok.map((a) => B(`${fmtDateShort(a.inicio)} ${fmtHM(a.inicio)}`, `canc:${a.id}`, [fmtDate(a.inicio)])));
}

function pedirCancelamento(th, id) {
  const a = whatsapp.meusAgendamentos(th.ctx.clienteId, th.telefone).find((x) => x.id === id);
  if (!a) { th.etapa = 'menu'; return bot(th, 'Esse horário não está mais ativo.', MENU); }
  if (!whatsapp.podeCancelar(id, th.telefone)) {
    th.etapa = 'menu';
    return bot(th, 'Faltam menos de 24 horas para esse horário (ou ele foi remarcado dentro desse prazo), e por aqui só dá para cancelar com 24 horas ou mais de antecedência. Você ainda pode confirmar ou remarcar.', [...(a.status === R.STATUS.A_CONFIRMAR ? [B('Confirmar', `conf:${id}`, ['confirmar'])] : []), B('Remarcar', `rem:${id}`, ['remarcar'])]);
  }
  th.ctx.cancelarId = id;
  th.etapa = 'cancelar_conf';
  return bot(th, `Cancelar o horário de ${descAg(a)}?`, [B('Sim, cancelar', 'cc:sim', ['sim', 'cancelar', 'confirmo']), B('Não, manter', 'cc:nao', ['nao', 'manter', 'voltar'])]);
}

function etapaCancelar(th, valor) {
  if (valor === 'cc:nao') { th.etapa = 'menu'; return bot(th, 'Tudo bem, o horário foi mantido.', MENU); }
  if (valor !== 'cc:sim') return repetir(th, 'Quer mesmo cancelar o horário?');
  const r = whatsapp.cancelar(th.ctx.cancelarId, th.telefone);
  th.etapa = 'menu';
  th.ctx.cancelarId = null;
  if (!r.ok) return bot(th, r.erros[0], MENU);
  return bot(th, `Horário de ${fmtDate(r.agendamento.inicio)} às ${fmtHM(r.agendamento.inicio)} cancelado. Quando quiser, é só marcar outro.`, MENU);
}

function confirmarPorChip(th, id) {
  const r = whatsapp.confirmar(id, th.telefone);
  th.etapa = 'menu';
  if (r.ok) return bot(th, `Horário confirmado ✅ Te esperamos em ${fmtDate(r.agendamento.inicio)} às ${fmtHM(r.agendamento.inicio)}.`, MENU);
  return bot(th, r.erros[0], MENU);
}

// ---------- agendar: veículo ----------
// O porte do veículo define preço e duração. Cliente com veículo cadastrado escolhe um; senão informa placa, modelo e porte.
const rotuloPorte = (p) => { const ex = (EXEMPLO_PORTE[p] || '').replace(/^Ex\.:\s*/, ''); return ex ? `${ROTULO_PORTE[p]} (${ex})` : ROTULO_PORTE[p]; };
function iniciarAgendamento(th) {
  th.ctx.servicoIds = [];
  th.ctx.editarId = null;
  th.ctx.remarcarProfissional = null;
  th.ctx.veiculoId = null; th.ctx.veiculoNovo = null; th.ctx.porte = null;
  if (!capAtiva('usaVeiculo')) return promptServicos(th, ''); // tipo sem veículo (barbearia): vai direto aos serviços
  const vs = clienteDe(th)?.veiculos || [];
  if (!vs.length) return pedirPlaca(th);
  th.etapa = 'veiculo';
  return bot(th, 'Para qual veículo?', [...vs.slice(0, 7).map((v) => B(`${v.modelo} ${v.placa}`, `vei:${v.id}`, [v.placa, v.modelo])), B('Outro veículo', 'vei:novo', ['outro', 'novo', 'outro carro', 'outro veiculo'])]);
}

function etapaVeiculo(th, v) {
  if (v === 'vei:novo') return pedirPlaca(th);
  const ve = v && v.startsWith('vei:') ? (clienteDe(th)?.veiculos || []).find((x) => x.id === v.slice(4)) : null;
  if (!ve) return repetir(th, 'Escolha um dos veículos:');
  th.ctx.veiculoId = ve.id; th.ctx.porte = ve.porte;
  return promptServicos(th, `Veículo: ${resumoVeiculo(ve)}. `);
}

function pedirPlaca(th) {
  th.etapa = 'vei_placa';
  return bot(th, 'Qual é a placa do veículo? (ex.: ABC1D23 ou ABC-1234)', [], { dica: 'Escreva a placa.' });
}

function etapaPlaca(th, texto) {
  if (!placaValida(texto)) return bot(th, 'Placa inválida. Use o formato antigo (ABC-1234) ou Mercosul (ABC1D23).', [], { dica: 'Escreva a placa.' });
  const placa = formatarPlaca(texto);
  const existente = veiculoPorPlaca(clienteDe(th), placa);
  if (existente) { th.ctx.veiculoId = existente.id; th.ctx.porte = existente.porte; return promptServicos(th, `Veículo: ${resumoVeiculo(existente)}. `); }
  th.ctx.veiculoNovo = { placa };
  th.etapa = 'vei_modelo';
  return bot(th, 'Qual é o modelo do veículo? (ex.: Civic)', [], { dica: 'Escreva o modelo.' });
}

function etapaModelo(th, texto) {
  const modelo = texto.trim();
  if (modelo.length < 2 || modelo.length > 40) return bot(th, 'Escreva o modelo do veículo (ex.: Civic).', [], { dica: 'Escreva o modelo.' });
  th.ctx.veiculoNovo = { ...th.ctx.veiculoNovo, modelo };
  th.etapa = 'vei_porte';
  return bot(th, 'Qual é o porte do veículo?', portesAtivos().map(({ id: p }) => B(rotuloPorte(p), `porte:${p}`, [ROTULO_PORTE[p]])));
}

function etapaPorte(th, valor) {
  const p = valor && valor.startsWith('porte:') ? valor.slice(6) : null;
  if (!porteAtivo(p)) return repetir(th, 'Escolha o porte do veículo:');
  th.ctx.veiculoNovo = { ...th.ctx.veiculoNovo, porte: p };
  th.ctx.porte = p;
  return promptServicos(th, `Veículo: ${resumoVeiculo(th.ctx.veiculoNovo)}. `);
}

// ---------- agendar: serviços (com valor de cada um no porte do veículo, e opção de remover) ----------
const ativos = () => store.getState().servicos.filter((s) => s.ativo !== false);
const escolhidos = (th) => R.servicosPorIds(store.getState(), th.ctx.servicoIds, th.ctx.porte);
const comPorte = (lista, th) => lista.map((s) => R.servicoNoPorte(s, th.ctx.porte));
const categorias = () => [...new Set(ativos().map((s) => s.categoria || 'Outros'))];
function detalheServicos(th) {
  const sv = escolhidos(th);
  return `${sv.map((s) => `• ${s.nome} — ${fmtMoney(s.preco)}`).join('\n')}\nTotal: ${fmtMoney(R.totalPreco(sv))}`;
}

// Poucos serviços: lista direta. Muitos: primeiro a categoria (Lavagem, Interior, Pintura…), para caber nas opções do WhatsApp.
function promptCategorias(th, prefixo) {
  th.etapa = 'servicos';
  const resto = ativos().filter((s) => !th.ctx.servicoIds.includes(s.id));
  if (categorias().length <= 1 || resto.length <= 7) return bot(th, `${prefixo || ''}Qual serviço você quer? Pode escolher mais de um (ex.: 1,3).`, opcoesServicos(comPorte(resto, th)), { dica: 'Responda com o número, vários separados por vírgula, ou toque em uma opção.' });
  const cats = categorias().filter((c) => resto.some((s) => (s.categoria || 'Outros') === c));
  return bot(th, `${prefixo || ''}Que tipo de serviço você quer?`, cats.map((c) => B(c, `cat:${c}`, [c])));
}

function promptServicos(th, prefixo) {
  th.etapa = 'servicos';
  if (!th.ctx.servicoIds.length) return promptCategorias(th, prefixo);
  const resto = ativos().filter((s) => !th.ctx.servicoIds.includes(s.id));
  // Poucos serviços (ou uma só categoria): as opções já vêm na lista. Muitos: um botão leva às categorias.
  const lista = categorias().length <= 1 || resto.length <= 7;
  return bot(th, `${prefixo || ''}Seus serviços:\n${detalheServicos(th)}\nQuer adicionar mais algum?`, [...(lista ? opcoesServicos(comPorte(resto, th)) : resto.length ? [B('Adicionar outro serviço', 'cat:voltar', ['adicionar', 'mais', 'outro servico', 'outro'])] : []), B('Continuar', 'srv:ok', ['continuar', 'ok', 'pronto', 'seguir', 'proximo']), B('Remover um serviço', 'srv:rm', ['remover', 'tirar', 'retirar', 'excluir', 'errei', 'engano'])]);
}

function etapaServicos(th, v) {
  if (v === 'srv:ok') {
    if (!th.ctx.servicoIds.length) return promptServicos(th, 'Escolha ao menos um serviço. ');
    if (th.ctx.editarId) return resumoEdicao(th);
    return perguntarDia(th, 'dia');
  }
  if (v === 'srv:rm') return perguntarRemover(th, 'servicos_rm');
  if (v === 'cat:voltar') return promptCategorias(th);
  if (v && v.startsWith('cat:')) {
    const nome = v.slice(4);
    const lista = ativos().filter((s) => (s.categoria || 'Outros') === nome && !th.ctx.servicoIds.includes(s.id)).slice(0, 8);
    if (!lista.length) return promptCategorias(th);
    return bot(th, `${nome}: qual serviço? Pode escolher mais de um (ex.: 1,3).`, [...opcoesServicos(comPorte(lista, th)), B('Outra categoria', 'cat:voltar', ['categorias', 'outra categoria'])], { dica: 'Responda com o número, vários separados por vírgula, ou toque em uma opção.' });
  }
  if (v && v.startsWith('srv:multi:')) {
    const livres = new Set(ativos().map((s) => s.id));
    for (const id of v.slice(10).split(',')) if (livres.has(id) && !th.ctx.servicoIds.includes(id)) th.ctx.servicoIds.push(id);
    return promptServicos(th);
  }
  if (v && v.startsWith('srv:')) {
    const id = v.slice(4);
    if (ativos().some((s) => s.id === id) && !th.ctx.servicoIds.includes(id)) th.ctx.servicoIds.push(id);
    return promptServicos(th);
  }
  th.erros++;
  return repetir(th, 'Não encontrei esse serviço. Escolha uma das opções:');
}

// Remover serviço (engano): mostra o valor de cada um e o total que sobra.
function perguntarRemover(th, etapa) {
  th.etapa = etapa;
  const sv = escolhidos(th);
  return bot(th, `Qual serviço você quer remover?\n${detalheServicos(th)}`, [...sv.map((s) => B(nomeServico(s), `rm:${s.id}`, [s.nome])), B('Manter como está', 'rm:volta', ['manter', 'voltar', 'nenhum', 'cancelar'])]);
}

function etapaRemover(th, v) {
  const resumoRm = th.etapa === 'resumo_rm';
  const volta = (prefixo) => (resumoRm && th.ctx.servicoIds.length ? resumo(th, prefixo || '') : promptServicos(th, prefixo));
  if (v === 'rm:volta') return volta();
  if (!v || !v.startsWith('rm:') || !th.ctx.servicoIds.includes(v.slice(3))) return repetir(th, 'Escolha o serviço que quer remover:');
  const sv = R.servicosPorIds(store.getState(), [v.slice(3)], th.ctx.porte)[0];
  th.ctx.servicoIds = th.ctx.servicoIds.filter((id) => id !== v.slice(3));
  const msg = `Removi ${sv ? `${sv.nome} (${fmtMoney(sv.preco)})` : 'o serviço'}. `;
  if (!th.ctx.servicoIds.length) return promptServicos(th, `${msg}Agora você está sem serviços. `);
  return volta(msg);
}

// ---------- agendar: dia, hora, profissional ----------
function horariosDoDia(dayTs, servicoIds, profissionalId, porte) {
  const st = store.getState();
  const ids = profissionalId ? [profissionalId] : st.usuarios.filter((u) => u.atende).map((u) => u.id);
  const set = new Set();
  for (const id of ids) whatsapp.horariosLivres({ profissionalId: id, dayTs, servicoIds, porte }).forEach((t) => set.add(t));
  return [...set].sort((a, b) => a - b);
}

function perguntarDia(th, etapa) {
  const profissionalId = th.ctx.remarcarProfissional || null;
  const hoje = startOfDay(store.agora());
  const dias = [];
  for (let i = 0; i < 30 && dias.length < 6; i++) {
    const d = addDays(hoje, i);
    if (horariosDoDia(d, th.ctx.servicoIds, profissionalId, th.ctx.porte).length) dias.push(d);
  }
  th.etapa = etapa;
  if (!dias.length) { th.etapa = 'menu'; return bot(th, `Não encontrei horários livres nos próximos dias. Fale com a ${rot('loja')}, por favor.`, MENU); }
  const rotDia = (d) => { const i = Math.round((d - hoje) / 86400000); return `${i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DIAS_CURTOS[new Date(d).getDay()]} ${fmtDateShort(d)}`; };
  return bot(th, 'Para qual dia?', dias.map((d) => B(rotDia(d), `dia:${d}`, [fmtDateShort(d)])), { dica: 'Responda com o número, toque em uma opção ou escreva a data (ex.: amanhã, 15/10).' });
}

function lerDia(n, hoje) {
  if (n === 'hoje') return hoje;
  if (n === 'amanha') return addDays(hoje, 1);
  const m = n.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const ano = m[3] ? Number(m[3]) : new Date(hoje).getFullYear();
    let d = new Date(ano, Number(m[2]) - 1, Number(m[1])).getTime();
    if (!m[3] && d < hoje) d = new Date(ano + 1, Number(m[2]) - 1, Number(m[1])).getTime();
    return d;
  }
  return null;
}

function etapaDia(th, n, valor) {
  const hoje = startOfDay(store.agora());
  const d = valor && valor.startsWith('dia:') ? Number(valor.slice(4)) : lerDia(n, hoje);
  if (!d) return repetir(th, 'Não entendi o dia. Escolha uma opção ou escreva "amanhã" ou "dd/mm".');
  const profissionalId = th.ctx.remarcarProfissional || null;
  const horas = horariosDoDia(d, th.ctx.servicoIds, profissionalId, th.ctx.porte);
  if (!horas.length) return repetir(th, `Não há horários livres em ${fmtDate(d)}. Escolha outro dia.`);
  th.ctx.dia = d;
  th.etapa = th.etapa === 'rem_dia' ? 'rem_hora' : 'hora';
  const pontos = horas.filter((t) => minutesOfDay(t) % 30 === 0);
  const mostrar = (pontos.length >= 3 ? pontos : horas).slice(0, 8);
  return bot(th, `Horários livres em ${fmtDate(d)}:`, [...mostrar.map((t) => B(fmtHM(t), `hora:${t}`)), B('Outro dia', 'hora:outro', ['outro dia', 'outra data', 'trocar dia'])], { dica: 'Responda com o número, toque em uma opção ou escreva a hora (ex.: 14:20).' });
}

function etapaHora(th, texto, valor) {
  if (valor === 'hora:outro') return perguntarDia(th, th.etapa === 'rem_hora' ? 'rem_dia' : 'dia');
  let t = valor && valor.startsWith('hora:') ? Number(valor.slice(5)) : null;
  if (!t) {
    const m = texto.match(/^(\d{1,2})(?::|h)?(\d{2})?$/);
    if (m) t = tsAt(th.ctx.dia, Number(m[1]) * 60 + Number(m[2] || 0));
  }
  if (!t) return repetir(th, 'Não entendi o horário. Escolha uma opção ou escreva no formato 14:20.');
  const livres = horariosDoDia(th.ctx.dia, th.ctx.servicoIds, th.ctx.remarcarProfissional || null, th.ctx.porte);
  if (!livres.includes(t)) return repetir(th, `Esse horário não está livre. Escolha um da lista ou escreva outro.`);
  th.ctx.inicio = t;
  if (th.etapa === 'rem_hora') return concluirRemarcar(th);
  const disp = whatsapp.profissionaisComHorario({ inicio: t, servicoIds: th.ctx.servicoIds, porte: th.ctx.porte });
  if (disp.length === 1) { th.ctx.profissionalId = disp[0].id; return proximoPasso(th, `Só ${disp[0].apelido} está livre nesse horário.`); }
  th.etapa = 'profissional';
  return bot(th, `Com qual ${rot('profissional')} você prefere?`, [...disp.map((u) => B(u.apelido, `barb:${u.id}`, [u.nome])), B('Tanto faz', `barb:${disp[0].id}`, ['tanto faz', 'qualquer', 'qualquer um', 'indiferente'])]);
}

function etapaProfissional(th, valor) {
  const disp = whatsapp.profissionaisComHorario({ inicio: th.ctx.inicio, servicoIds: th.ctx.servicoIds, porte: th.ctx.porte });
  const id = valor && valor.startsWith('barb:') ? valor.slice(5) : null;
  if (!id || !disp.some((u) => u.id === id)) return repetir(th, `Escolha um dos ${rots('profissional')} disponíveis.`);
  th.ctx.profissionalId = id;
  return proximoPasso(th, '');
}

// Cliente sem cadastro informa o nome só agora, na hora de fechar o agendamento.
function proximoPasso(th, prefixo) {
  if (!clienteDe(th) && !th.ctx.novoCliente) {
    th.ctx.prefixo = prefixo; th.etapa = 'cad_nome';
    return bot(th, `${prefixo ? `${prefixo}\n` : ''}Para finalizar, qual é o seu nome ou apelido?`, [], { dica: 'Escreva o seu nome.' });
  }
  return resumo(th, prefixo);
}

function resumo(th, prefixo) {
  const st = store.getState();
  const sv = R.servicosPorIds(st, th.ctx.servicoIds, th.ctx.porte);
  const b = st.usuarios.find((u) => u.id === th.ctx.profissionalId);
  const vei = th.ctx.veiculoNovo || (clienteDe(th)?.veiculos || []).find((x) => x.id === th.ctx.veiculoId);
  th.etapa = 'resumo';
  const opcoes = sv.length > 0 ? SIM_NAO : SIM_NAO.filter((o) => o.valor !== 'res:rm');
  return bot(th, `${prefixo ? `${prefixo}\n` : ''}Confira:\n${sv.map((s) => `• ${s.nome} — ${fmtMoney(s.preco)}`).join('\n')}\nTotal: ${fmtMoney(R.totalPreco(sv))}${capAtiva('usaVeiculo') ? `\n🚗 ${resumoVeiculo(vei)}` : ''}\n📅 ${fmtDate(th.ctx.inicio)} às ${fmtHM(th.ctx.inicio)}, com ${b.apelido}\nPosso agendar?`, opcoes);
}

function etapaResumo(th, v) {
  if (v === 'nao') { th.etapa = 'menu'; return bot(th, 'Tudo bem, não agendei nada. Quer fazer outra coisa?', MENU); }
  if (v === 'res:rm') return perguntarRemover(th, 'resumo_rm');
  if (v !== 'sim') return repetir(th, 'Responda 1 para agendar, 2 para remover um serviço ou 3 para não agendar.');
  const c = clienteDe(th);
  const dados = {
    telefone: th.telefone, profissionalId: th.ctx.profissionalId, servicoIds: th.ctx.servicoIds, inicio: th.ctx.inicio,
    ...(!capAtiva('usaVeiculo') ? {} : th.ctx.veiculoId ? { veiculoId: th.ctx.veiculoId } : { veiculo: th.ctx.veiculoNovo }),
    nome: c ? c.nome : th.ctx.novoCliente?.nome, cpf: c ? c.cpf : th.ctx.novoCliente?.cpf, nascimento: c ? c.nascimento : th.ctx.novoCliente?.nascimento,
  };
  const r = whatsapp.agendar(dados);
  if (!r.ok) {
    if (r.bloqueado) return;
    if (r.pendente) { th.etapa = 'menu'; return bot(th, r.erros[0], MENU); }
    push(th, 'bot', `${r.erros[0]} Vamos escolher outro horário.`, []);
    return perguntarDia(th, 'dia');
  }
  th.ctx.clienteId = r.cliente.id;
  th.ctx.novoCliente = null;
  th.ctx.veiculoId = null; th.ctx.veiculoNovo = null;
  th.etapa = 'menu';
  const a = r.agendamento;
  const msg = a.status === R.STATUS.CONFIRMADO
    ? `Agendado e confirmado ✅ ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}. Te esperamos!`
    : `Agendado! ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}. Você vai receber uma mensagem para confirmar o horário.`;
  const cr = whatsapp.meuCredito(r.cliente.id, th.telefone);
  if (cr.total > 0 && whatsapp.creditoUsavel(a.id, th.telefone) > 0) {
    return bot(th, `${msg}\nVocê tem ${fmtMoney(cr.total)} de crédito (vale até ${fmtDate(cr.venceEm)}). Quer usar neste horário?`, [B('Usar meu crédito', `cred:${a.id}`, ['usar', 'credito', 'sim']), B('Agora não', 'menu', ['nao', 'depois'])]);
  }
  return bot(th, msg, MENU);
}

// ---------- remarcar ----------
function iniciarRemarcar(th, id) {
  const st = store.getState();
  const a = st.agendamentos.find((x) => x.id === id);
  if (!a) { th.etapa = 'menu'; return bot(th, 'Não encontrei esse horário.', MENU); }
  th.ctx.clienteId = a.clienteId;
  th.ctx.remarcarId = id;
  th.ctx.remarcarProfissional = a.profissionalId;
  th.ctx.servicoIds = [...a.servicoIds];
  th.ctx.porte = a.porte;
  return perguntarDia(th, 'rem_dia');
}

function concluirRemarcar(th) {
  const r = whatsapp.remarcar(th.ctx.remarcarId, th.ctx.inicio, th.telefone);
  th.etapa = 'menu';
  th.ctx.remarcarProfissional = null;
  if (!r.ok) return bot(th, r.erros[0], MENU);
  const a = r.agendamento;
  return bot(th, a.status === R.STATUS.CONFIRMADO
    ? `Horário remarcado para ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)} e já está confirmado ✅`
    : `Horário remarcado para ${fmtDate(a.inicio)} às ${fmtHM(a.inicio)}. Você vai receber uma mensagem para confirmar.`, MENU);
}

// ---------- meus dados ----------
const CAMPOS = [B('Nome', 'campo:nome', ['nome', 'apelido']), B('CPF', 'campo:cpf', ['cpf']), B('Nascimento', 'campo:nascimento', ['nascimento', 'data', 'aniversario'])];
function iniciarDados(th) {
  const c = clienteDe(th) || th.ctx.novoCliente;
  if (!c) return bot(th, 'Ainda não tenho seu cadastro. Ele é criado junto com o primeiro agendamento.', MENU);
  th.etapa = 'dados_campo';
  return bot(th, `Seus dados:\n• Nome: ${c.nome}\n• CPF: ${c.cpf || 'não informado'}\n• Nascimento: ${c.nascimento ? fmtDate(new Date(`${c.nascimento}T00:00`).getTime()) : 'não informado'}\nO que você quer alterar?`, CAMPOS);
}

function etapaDadosCampo(th, valor) {
  const campo = valor?.startsWith('campo:') ? valor.slice(6) : null;
  if (!campo) return repetir(th, 'Escolha o que alterar:');
  th.ctx.campo = campo;
  th.etapa = 'dados_valor';
  return bot(th, { nome: 'Qual é o novo nome ou apelido?', cpf: 'Digite o CPF (11 números).', nascimento: 'Digite a data de nascimento (dd/mm/aaaa).' }[campo], [], { dica: 'Escreva o novo valor.' });
}

function etapaDadosValor(th, texto) {
  const campo = th.ctx.campo;
  let v = texto.trim();
  if (campo === 'cpf') { const d = R.somenteDigitos(v); if (d.length !== 11) return bot(th, 'O CPF precisa ter 11 números.'); v = R.formatarCpf(d); }
  if (campo === 'nascimento') { const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return bot(th, 'Use o formato dd/mm/aaaa.'); v = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const c = clienteDe(th);
  if (c) {
    const r = whatsapp.editarMeusDados(c.id, { [campo]: v }, th.telefone);
    if (!r.ok) return bot(th, r.erros[0]);
  } else if (th.ctx.novoCliente) {
    th.ctx.novoCliente[campo] = v;
  }
  th.etapa = 'menu';
  return bot(th, 'Dados atualizados ✅', MENU);
}
