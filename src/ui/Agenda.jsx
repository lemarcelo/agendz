/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:b3ec830fb7 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agendamentosVisiveis, profissionaisVisiveis } from '../services/api.js';
import { ATIVOS, STATUS, boxesAtivos, duracaoMin, intervaloMin, ocupacaoDe, retiradaDe, servicosPorIds } from '../domain/rules.js';
import { faixasDoProfissional, excecaoDoDia, TIPOS_EXCECAO } from '../domain/schedule.js';
import { DIAS_CURTOS, DIAS_SEMANA, MIN, addDays, addMonths, fmtDate, fmtDayLong, fmtHM, fmtMonthYear, minutesOfDay, monthStart, sameDay, startOfDay, tsAt, weekStart, fmtDateShort, fmtMoney, pad } from '../domain/time.js';
import { cobrancasDoAgendamento } from '../domain/financeiro.js';
import { totalAcrescimos } from '../domain/reports.js';
import { Avatar, Btn, Etiquetas, Icon, StatusChip, Vazio } from './common.jsx';
import { nomeProfissional, nomeCliente, nomeServicos, textoBox, textoSemConfirmacao, textoUltimo, textoVeiculo } from './format.js';
import { toast, useLocal, useMedia, useStore } from './hooks.js';
import { MARCADORES, chavesAtivas, casaMarcadores, contarMarcadores, visualDoCartao } from '../domain/marcadores.js';
import { useOrdem } from './ordem.jsx';
import SeletorProfissionais, { LIMITE_CARTOES } from './SeletorProfissionais.jsx';
import { sanearModoExperimento, sanearRolagem } from '../domain/experimento.js';
import { alternarMulti, escolherUnico, removerUm, sanearSelecao } from '../domain/selecao.js';
import { BotaoRemover, useGestosSelecao } from './selecao.jsx';
import { copiarTexto } from './clipboard.js';
import { abrirWhatsapp } from './whatsapp.js';
import { textoConvite } from '../domain/whatsapp.js';
import { rot } from '../domain/tipos.js';

const ordem = (a, b) => a.inicio - b.inicio;

// Miniatura redonda do profissional (foto, ou inicial com cor própria) para os eventos do calendário.
function FotoProfissional({ u }) {
  if (!u) return null;
  return <span className="ev-foto" title={u.apelido || u.nome}><Avatar mini nome={u.apelido || u.nome} foto={u.foto} chave={u.id} /></span>;
}

function CartaoAgendamento({ a, st, agora, onClick, mostraBarb }) {
  const v = visualDoCartao(a, agora);
  return (
    <button type="button" className={`cartao st-${v.chave}`} onClick={onClick} data-testid="cartao">
      <div className="cartao-topo">
        <strong className="cartao-hora">{fmtHM(a.inicio)}</strong>
        <span className="cartao-nome">{nomeCliente(st, a)}</span>
        <StatusChip a={a} agora={agora} pequeno />
      </div>
      <div className="cartao-corpo">
        <span>{nomeServicos(st, a)}</span>
        {a.veiculo && <span className="cartao-veiculo" data-testid="cartao-veiculo"><Icon n="car" size={13} /> {textoVeiculo(a)}{textoBox(st, a) ? ` · ${textoBox(st, a)}` : ''}</span>}
        <span className="muted cartao-com">{mostraBarb && <FotoProfissional u={st.usuarios.find((x) => x.id === a.profissionalId)} />}com {nomeProfissional(st, a)} · {fmtDate(a.inicio)} às {fmtHM(a.inicio)}</span>
      </div>
      <div className="cartao-rodape">
        <Etiquetas a={a} />
        {totalAcrescimos(a) > 0 && <span className="chip chip-acr" title="Valor a mais, separado do serviço">Acréscimo {fmtMoney(totalAcrescimos(a))}</span>}
        {(() => { const l = cobrancasDoAgendamento(st, a).filter((c) => c.status === 'paga' || c.status === 'pendente'); if (!l.length) return null; const pend = l.some((c) => c.status === 'pendente'); const pagas = l.some((c) => c.status === 'paga'); const k = pend ? 'pendente' : 'paga'; return <span className={`chip chip-p chip-cob-${k}`} data-testid="chip-pix">{pend ? (pagas ? 'Pix parcial' : 'Pix aguardando') : 'Pix pago'}</span>; })()}
        {a.faltaConfirmacao && a.status === STATUS.A_CONFIRMAR && <span className="chip chip-alerta"><Icon n="alert" size={12} /> Sem confirmação</span>}
        <span className="muted cartao-ultimo">{textoUltimo(st, a)}</span>
      </div>
    </button>
  );
}

// Venda só de produto não tem duração: ocupa um bloco mínimo na grade para poder ser vista e aberta.
const duracaoVisual = (st, a) => duracaoMin(servicosPorIds(st, a.servicoIds, a.porte)) || 30;

// ---------- posição dos eventos na grade (evita sobreposição visual) ----------
function distribuir(evs, st) {
  const lista = [...evs].sort(ordem).map((a) => ({ a, ini: a.inicio, fim: a.inicio + duracaoVisual(st, a) * MIN }));
  let cluster = [];
  let fimCluster = 0;
  const fechar = () => { const n = Math.max(1, ...cluster.map((e) => e.lane + 1)); cluster.forEach((e) => { e.lanes = n; }); cluster = []; };
  for (const e of lista) {
    if (cluster.length && e.ini >= fimCluster) fechar();
    const usadas = cluster.filter((c) => c.fim > e.ini).map((c) => c.lane);
    let lane = 0;
    while (usadas.includes(lane)) lane++;
    e.lane = lane;
    cluster.push(e);
    fimCluster = Math.max(fimCluster, e.fim);
  }
  fechar();
  return lista;
}

function disponivelEm(st, profissionais, dayTs) {
  // união dos intervalos em que algum dos profissionais atende
  const todos = profissionais.flatMap((b) => faixasDoProfissional(st.estabelecimento, b, dayTs)).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of todos) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

function Grade({ colunas, st, agora, modo, onEvento, onVazio, pm, mostraBarb }) {
  const porId = new Map(st.usuarios.map((u) => [u.id, u]));
  const todosEv = colunas.flatMap((c) => c.eventos);
  const faixasTodas = colunas.flatMap((c) => c.disp);
  let ini = 8 * 60;
  let fim = 19 * 60;
  const minDia = (ts) => minutesOfDay(ts) + (startOfDay(ts) === startOfDay(ts) ? 0 : 0);
  if (faixasTodas.length) { ini = Math.min(...faixasTodas.map(([a]) => minDia(a))); fim = Math.max(...faixasTodas.map(([, b]) => (minutesOfDay(b) === 0 ? 24 * 60 : minDia(b)))); }
  todosEv.forEach((a) => { ini = Math.min(ini, minDia(a.inicio)); fim = Math.max(fim, minDia(a.inicio) + 60); });
  ini = Math.max(0, Math.floor(ini / 60) * 60 - 0);
  fim = Math.min(24 * 60, Math.ceil(fim / 60) * 60);
  const horas = [];
  for (let m = ini; m < fim; m += 60) horas.push(m);
  const alt = (fim - ini) * pm;
  const colsRef = useRef(null);
  const agoraMin = minutesOfDay(agora);

  const clicar = (e, col) => {
    if (e.target.closest('.ev')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const min = Math.round(((e.clientY - r.top) / pm + ini) / 10) * 10;
    onVazio({ dayTs: col.dayTs, profissionalId: col.profissionalId, minutos: min });
  };

  return (
    <div className="grade-rolagem">
      <div className={`grade grade-${modo}${colunas.length > 6 ? ' grade-muitas' : ''}`} style={{ '--ncol': colunas.length, '--pm': pm }}>
        <div className="grade-cab">
          <div className="grade-canto" />
          {colunas.map((c) => (
            <div key={c.key} className={`grade-titulo ${c.hoje ? 'hoje' : ''}`}>
              {c.cabecalho}
            </div>
          ))}
        </div>
        <div className="grade-corpo" style={{ height: alt }}>
          <div className="grade-horas">
            {horas.map((m) => <span key={m} style={{ top: (m - ini) * pm }}>{pad(m / 60)}:00</span>)}
          </div>
          <div className="grade-cols" ref={colsRef}>
            {colunas.map((c) => {
              const evs = distribuir(c.eventos, st);
              const indisp = [];
              let cursor = ini;
              for (const [a, b] of c.disp) {
                const a0 = Math.max(ini, minutesOfDay(a));
                const b0 = Math.min(fim, minutesOfDay(b) === 0 ? 24 * 60 : minutesOfDay(b));
                if (a0 > cursor) indisp.push([cursor, a0]);
                cursor = Math.max(cursor, b0);
              }
              if (cursor < fim) indisp.push([cursor, fim]);
              return (
                <div key={c.key} className={`grade-col ${c.hoje ? 'hoje' : ''}`} onClick={(e) => clicar(e, c)} data-testid={`coluna-${c.key}`}>
                  {horas.map((m) => <i key={m} className="linha-h" style={{ top: (m - ini) * pm }} />)}
                  {indisp.map(([a, b], i) => <div key={i} className="indisp" style={{ top: (a - ini) * pm, height: (b - a) * pm }} />)}
                  {c.hoje && agoraMin >= ini && agoraMin <= fim && <div className="agora" style={{ top: (agoraMin - ini) * pm }} />}
                  {evs.map(({ a, lane, lanes }) => {
                    const sv = servicosPorIds(st, a.servicoIds, a.porte);
                    // Serviço de vários dias: na grade, o primeiro dia só vai até o fim da grade; o resto aparece em "Carros no box".
                    const dur = Math.max(15, Math.min(duracaoVisual(st, a), fim - minutesOfDay(a.inicio)));
                    const itv = sv.some((x) => x.multiDia) ? 0 : intervaloMin(sv);
                    const v = visualDoCartao(a, agora);
                    const alto = dur * pm;
                    return (
                      <div key={a.id} className="ev-wrap" style={{ top: (minutesOfDay(a.inicio) - ini) * pm, height: alto + itv * pm, left: `${(lane / lanes) * 100}%`, width: `${100 / lanes}%` }}>
                        <button type="button" className={`ev st-${v.chave} ${a.status === STATUS.CANCELADO ? 'cancelado' : ''}`} style={{ height: alto }} onClick={() => onEvento(a.id)} data-testid="evento" data-status={v.chave} title={`${fmtHM(a.inicio)} ${nomeCliente(st, a)} · ${nomeServicos(st, a)}${a.veiculo ? ` · ${textoVeiculo(a)}` : ''} · ${v.rotulo}`}>
                          <span className="ev-l1">
                            {v.check ? <Icon n="check" size={12} stroke={3} /> : <i className="ponto" />}
                            <b>{fmtHM(a.inicio)}</b> <span className="ev-nome">{nomeCliente(st, a)}</span>
                            {mostraBarb && <FotoProfissional u={porId.get(a.profissionalId)} />}
                          </span>
                          {alto >= 34 && <span className="ev-l2">{nomeServicos(st, a)}</span>}
                          {alto >= 48 && a.veiculo && <span className="ev-l2 ev-veiculo">{textoVeiculo(a)}</span>}
                          {(modo === 'dia' || colunas.length <= 3) && alto >= 50 && (
                            <span className="ev-l3">
                              {a.reagendado && <em className="mini-reag">Reagendado</em>}
                              {a.encaixe && <em className="mini-enc">Encaixe</em>}
                              {a.boxId && <em className="mini-box">{textoBox(st, a)}</em>}
                              {a.faltaConfirmacao && a.status === STATUS.A_CONFIRMAR && <em className="mini-alerta">Sem confirmação</em>}
                            </span>
                          )}
                          {modo === 'semana' && colunas.length > 3 && (a.reagendado || a.encaixe) && <i className="ev-dot-reag" title={a.reagendado ? 'Reagendado' : 'Encaixe'} />}
                        </button>
                        {itv > 0 && <div className="cauda" style={{ top: alto, height: itv * pm }} />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mes({ cursor, evs, st, agora, onDia, onEvento, mostraBarb }) {
  const porId = new Map(st.usuarios.map((u) => [u.id, u]));
  const ini = weekStart(monthStart(cursor));
  const dias = Array.from({ length: 42 }, (_, i) => addDays(ini, i));
  const fim = dias.slice(35).every((d) => new Date(d).getMonth() !== new Date(cursor).getMonth()) ? 35 : 42;
  return (
    <div className="mes-rolagem">
      <div className="mes">
        {DIAS_CURTOS.map((d) => <div key={d} className="mes-cab">{d}</div>)}
        {dias.slice(0, fim).map((d) => {
          const lista = evs.filter((a) => sameDay(a.inicio, d)).sort(ordem);
          const fora = new Date(d).getMonth() !== new Date(cursor).getMonth();
          const ex = excecaoDoDia(st.estabelecimento.escala, d);
          const aberto = st.usuarios.some((u) => u.atende && faixasDoProfissional(st.estabelecimento, u, d).length);
          return (
            <div key={d} role="button" tabIndex={0} className={`mes-dia ${fora ? 'fora' : ''} ${sameDay(d, agora) ? 'hoje' : ''} ${aberto ? '' : 'fechado'}`} onClick={() => onDia(d)} onKeyDown={(e) => { if (e.key === 'Enter') onDia(d); }} data-testid="dia-mes">
              <div className="mes-num"><span>{new Date(d).getDate()}</span>{ex && ex.tipo !== 'horario' && <small title={ex.rotulo}>{ex.rotulo || TIPOS_EXCECAO[ex.tipo]}</small>}</div>
              <div className="mes-evs">
                {lista.slice(0, 3).map((a) => {
                  const v = visualDoCartao(a, agora);
                  return (
                    <button type="button" key={a.id} className={`pill st-${v.chave} ${a.status === STATUS.CANCELADO ? 'cancelado' : ''}`} onClick={(e) => { e.stopPropagation(); onEvento(a.id); }}>
                      {v.check ? <Icon n="check" size={10} stroke={3} /> : <i className="ponto" />}
                      <b>{fmtHM(a.inicio)}</b> {nomeCliente(st, a)}
                      {mostraBarb && <FotoProfissional u={porId.get(a.profissionalId)} />}
                    </button>
                  );
                })}
                {lista.length > 3 && <span className="mais">+{lista.length - 3} mais</span>}
              </div>
              {lista.length > 0 && (
                <span className="mes-cont" aria-label={`${lista.length} agendamentos`}>
                  {Object.entries(lista.reduce((m, a) => { const c = visualDoCartao(a, agora).chave; m[c] = (m[c] || 0) + 1; return m; }, {})).map(([c, n]) => <span key={c} className={`mes-ponto st-${c}`}>{n}</span>)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// EXPERIMENTO (só no Artifact de avaliação): `__AGENDZ_EXP_CARTOES__` é um booleano fixo do build (build.mjs). Usado DIRETO nas condições (não via variável):
// só assim o esbuild remove o ramo inteiro do experimento do pacote do site (tests/estatico.test.mjs confere).
const ultimaRolagemExp = new Map(); // experimento: rolagem da Agenda por usuário, em memória

export default function Agenda({ user, onAbrir, onNovo }) {
  const { state: st, agora } = useStore();
  const estreito = useMedia('(max-width: 760px)');
  const ehProfissional = user.papel === 'profissional';
  // A visão (dia, semana ou mês) e o filtro de profissionais ficam lembrados por usuário neste navegador; sem escolha, vale a visão padrão do estabelecimento.
  // Clicar num dia da semana ou do mês abre aquele dia só desta vez (visaoTemp) e não troca a visão preferida.
  const [visaoSalva, salvarVisao] = useLocal(`agenda-visao:${user.id}`, null);
  const [visaoTemp, setVisaoTemp] = useState(null);
  // EXPERIMENTO (só no Artifact de avaliação, flag de build): Horários = cartões do dia; Calendário = só o mês. Sem a flag, este código é descartado do build.
  const [modoExpSalvo, salvarModoExp] = useLocal(`agenda-exp-modo:${user.id}`, 'horarios');
  const modoExp = sanearModoExperimento(modoExpSalvo);
  const view = __AGENDZ_EXP_CARTOES__ ? (modoExp === 'calendario' ? 'mes' : 'dia') : visaoTemp || (['dia', 'semana', 'mes'].includes(visaoSalva) ? visaoSalva : st.estabelecimento.visaoPadrao);
  const setView = (v) => { setVisaoTemp(null); salvarVisao(v); };
  const abrirDia = (d) => { setCursor(d); if (__AGENDZ_EXP_CARTOES__) salvarModoExp('horarios'); else setVisaoTemp('dia'); };
  const [cursor, setCursor] = useState(() => startOfDay(agora));
  const [selSalva, salvarSel] = useLocal(`agenda-profissionais:${user.id}`, []);
  const viewEfetiva = view;

  const profissionais = profissionaisVisiveis(st, user);
  // Clicar em outro profissional troca a seleção (não soma). Profissional só vê a própria agenda (a API também filtra).
  // Sem escolha lembrada (ou com um profissional que não existe mais): vem selecionado quem está logado, se atende; senão vem "Todos" (nenhum marcado).
  // "Todos" escolhido de propósito fica guardado como ['*'] (lista vazia = sem escolha lembrada).
  // Escolhas antigas guardadas como lista (filtro múltiplo) valem pelo primeiro nome que ainda existe.
  const padraoSel = profissionais.some((b) => b.id === user.id) ? user.id : '';
  const todosEscolhido = Array.isArray(selSalva) && selSalva[0] === '*';
  // Clique escolhe um só. Segurar, duplo clique (só mouse) ou Ctrl/Shift + clique junta vários; o X do cartão tira só aquele. Sempre fica ao menos um.
  const selecionados = ehProfissional ? [user.id] : todosEscolhido ? [] : sanearSelecao(selSalva, profissionais.map((b) => b.id), padraoSel);
  const setSel = (v) => { if (!ehProfissional) salvarSel(v.length ? v : ['*']); };
  const ativosSel = profissionais.filter((b) => !selecionados.length || selecionados.includes(b.id));
  const todos = agendamentosVisiveis(st, user).filter((a) => !selecionados.length || selecionados.includes(a.profissionalId));
  // Marcadores da legenda: clicar liga/desliga o filtro por caso no calendário (vale só nesta tela, não fica salvo). Os totais continuam os do período inteiro.
  // Segurar um marcador e arrastar muda a ordem dele (salva por usuário).
  const [marcados, setMarcados] = useState([]);
  // Clique = um só (clicar de novo no marcado limpa). Segurar, duplo clique (só mouse) ou Ctrl/Shift + clique = juntar com os outros.
  const ordemLegenda = useOrdem('legenda', chavesAtivas(), { eixo: 'xy', rotulo: (k) => MARCADORES.find((m) => m.k === k)?.rotulo ?? k, aoSegurar: (k) => setMarcados((m) => alternarMulti(m, k)) });
  const gestosStatus = useGestosSelecao({ sel: marcados, aoUnico: (k) => setMarcados(escolherUnico(marcados, k)), aoMulti: (k, base) => setMarcados(alternarMulti(base ?? marcados, k)), segurar: false });
  const exibidos = todos.filter((a) => casaMarcadores(a, marcados, agora));

  const mover = (dir) => {
    if (viewEfetiva === 'dia') setCursor(addDays(cursor, dir));
    else if (viewEfetiva === 'semana') setCursor(addDays(cursor, 7 * dir));
    else setCursor(addMonths(cursor, dir));
  };
  const titulo = viewEfetiva === 'dia' ? fmtDayLong(cursor) : viewEfetiva === 'semana'
    ? `${fmtDateShort(weekStart(cursor))} a ${fmtDateShort(addDays(weekStart(cursor), 6))}` : fmtMonthYear(cursor);

  const contagemHoje = (id) => todos.length >= 0 && agendamentosVisiveis(st, user).filter((a) => a.profissionalId === id && sameDay(a.inicio, agora) && ATIVOS.includes(a.status)).length;
  const proximo = (id) => agendamentosVisiveis(st, user).filter((a) => a.profissionalId === id && ATIVOS.includes(a.status) && a.status !== STATUS.CONCLUIDO && a.inicio >= agora).sort(ordem)[0];

  const [copiado, setCopiado] = useState(false);
  const linkAtivo = st.estabelecimento.linkAgendamento?.ativo !== false;
  // Link da página do cliente: o dono usa o geral; cada profissional, o da própria agenda (#agendar-<id>). Em Artifact só vale âncora simples, por isso #.
  // Um clique abre o WhatsApp (aba nova, com a mensagem pronta) e copia o link como reserva. Os dois começam já no clique.
  const copiarLink = () => {
    const base = `${window.location.origin === 'null' ? '' : window.location.origin}${window.location.pathname}`;
    // Na demonstração a loja vem de ?loja=<slug>: o link leva junto, senão o cliente cairia na loja padrão. No site real a loja vem do endereço (o build com domínio ignora ?loja=).
    const lojaDemo = new URLSearchParams(window.location.search).get('loja');
    const busca = lojaDemo && /^[a-z0-9-]{1,40}$/.test(lojaDemo) && base ? `?loja=${lojaDemo}` : '';
    const link = `${base}${busca}#agendar${ehProfissional ? `-${user.id}` : ''}`;
    const copiou = copiarTexto(link);
    const abriu = abrirWhatsapp(textoConvite(st.estabelecimento.nome, link));
    copiou.then((ok) => {
      setCopiado(ok); if (ok) setTimeout(() => setCopiado(false), 2000);
      if (!abriu) toast(ok ? 'Não consegui abrir o WhatsApp. O link foi copiado: cole na conversa.' : 'Não consegui abrir o WhatsApp nem copiar o link.', 'erro');
    });
  };
  const escolher = (id) => setSel(id ? escolherUnico(selecionados, id, 1) : []);
  const alternarBarb = (id, base) => setSel(alternarMulti(base ?? selecionados, id, 1));
  const gestosBarb = useGestosSelecao({ sel: selecionados, aoUnico: escolher, aoMulti: alternarBarb });

  // colunas
  let colunas = [];
  if (viewEfetiva === 'semana') {
    colunas = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart(cursor), i);
      const ex = excecaoDoDia(st.estabelecimento.escala, d);
      return {
        key: String(d), dayTs: d, profissionalId: selecionados.length === 1 ? selecionados[0] : '', hoje: sameDay(d, agora),
        eventos: exibidos.filter((a) => sameDay(a.inicio, d)), disp: disponivelEm(st, ativosSel, d),
        cabecalho: (
          <button type="button" className="cab-dia" onClick={() => abrirDia(d)}>
            <span>{DIAS_CURTOS[new Date(d).getDay()]}</span><b>{new Date(d).getDate()}</b>
            {ex && ex.tipo !== 'horario' && <small>{ex.rotulo || TIPOS_EXCECAO[ex.tipo]}</small>}
          </button>
        ),
      };
    });
  } else if (viewEfetiva === 'dia') {
    const comHistorico = st.usuarios.filter((u) => !u.atende && (!selecionados.length || selecionados.includes(u.id)) && exibidos.some((a) => a.profissionalId === u.id && sameDay(a.inicio, cursor)));
    colunas = [...ativosSel, ...comHistorico].map((b) => ({
      key: b.id, dayTs: cursor, profissionalId: b.id, hoje: sameDay(cursor, agora),
      eventos: exibidos.filter((a) => sameDay(a.inicio, cursor) && a.profissionalId === b.id), disp: faixasDoProfissional(st.estabelecimento, b, cursor),
      cabecalho: <div className="cab-barb"><Avatar nome={b.apelido || b.nome} foto={b.foto} chave={b.id} /><b>{b.apelido || b.nome}</b>{!b.atende && <small className="muted">desativado</small>}</div>,
    }));
  }
  // Boxes agora (só no dia de hoje) e carros de serviços de vários dias que entraram antes e ainda estão no box neste dia.
  const boxesHoje = viewEfetiva === 'dia' && sameDay(cursor, agora) ? boxesAtivos(st).map((b) => ({ box: b, a: todos.find((a) => a.boxId === b.id && a.status === STATUS.CONFIRMADO && !a.local && (() => { const o = ocupacaoDe(st, a); return o && o.box[0] <= agora && agora < o.box[1]; })()) || null })) : [];
  const noBox = viewEfetiva === 'dia' ? exibidos.filter((a) => a.status === STATUS.CONFIRMADO && !a.local && a.inicio < startOfDay(cursor) && (retiradaDe(st, a) ?? 0) > startOfDay(cursor)).sort(ordem) : [];
  const exDia = viewEfetiva === 'dia' ? excecaoDoDia(st.estabelecimento.escala, cursor) : null;
  const listaDia = exibidos.filter((a) => sameDay(a.inicio, cursor)).sort(ordem);
  // Total de cada marcador da legenda no período que está na tela (dia, semana ou mês), respeitando o filtro de profissionais.
  const [pIni, pFim] = viewEfetiva === 'dia' ? [startOfDay(cursor), addDays(startOfDay(cursor), 1)] : viewEfetiva === 'semana' ? [weekStart(cursor), addDays(weekStart(cursor), 7)] : [monthStart(cursor), addMonths(monthStart(cursor), 1)];
  const contagem = contarMarcadores(todos.filter((x) => x.inicio >= pIni && x.inicio < pFim), agora);

  // EXPERIMENTO: a rolagem da página volta como o usuário deixou (na sessão, em memória; entre sessões, em localStorage quando o navegador permite).
  const chaveRolagem = `agenda-exp-rolagem:${user.id}`;
  useEffect(() => {
    if (!__AGENDZ_EXP_CARTOES__) return undefined;
    let salvo = ultimaRolagemExp.get(chaveRolagem);
    if (salvo === undefined) { try { salvo = sanearRolagem(localStorage.getItem(chaveRolagem)); } catch { salvo = 0; } }
    const alvo = sanearRolagem(salvo);
    const volta = requestAnimationFrame(() => window.scrollTo(0, alvo));
    let t = 0;
    const gravar = () => { const y = sanearRolagem(window.scrollY); ultimaRolagemExp.set(chaveRolagem, y); try { localStorage.setItem(chaveRolagem, String(y)); } catch { /* sem armazenamento: fica só em memória */ } };
    const aoRolar = () => { clearTimeout(t); t = setTimeout(gravar, 150); };
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => { cancelAnimationFrame(volta); clearTimeout(t); window.removeEventListener('scroll', aoRolar); }; // sem gravar aqui: ao sair da tela o navegador já pode ter zerado a rolagem
  }, [__AGENDZ_EXP_CARTOES__, chaveRolagem]);
  const botaoLink = (
  <button type="button" className={`btn btn-link-agendar ${copiado ? 'copiado' : ''}`} onClick={copiarLink} disabled={!linkAtivo} aria-label="Enviar link de agendamento pelo WhatsApp"
    title={linkAtivo ? 'Abrir o WhatsApp com o link da página de agendamento do cliente (o link também é copiado)' : 'Link desligado em Estabelecimento > Regras'} data-testid="copiar-link">
    <Icon n={copiado ? 'check' : 'link'} size={17} /><span className="rotulo-link">{copiado ? 'Link copiado' : 'Link de agendamento'}</span><span className="rotulo-link-curto">{copiado ? 'Copiado' : 'Link Agenda'}</span>
  </button>
  );
  const botaoAtender = (
  <Btn variante="primario" icone="plus" onClick={() => onNovo({ profissionalId: selecionados.length === 1 ? selecionados[0] : ehProfissional ? user.id : '' })} data-testid="atender">Atender</Btn>
  );
  return (
    <section className="tela">
      {!ehProfissional ? (
        <SeletorProfissionais profissionais={profissionais} selecionados={selecionados} onEscolher={escolher} onAlternar={alternarBarb} onRemover={(id) => setSel(removerUm(selecionados, id, 1))} contagemHoje={contagemHoje} proximo={proximo} agora={agora} />
      ) : (
      <div className="filtros" role="group" aria-label={`Escolher a agenda do ${rot('profissional')}`}>
        {profissionais.map((b) => {
          const p = proximo(b.id);
          const on = selecionados.includes(b.id);
          return (
            <span className="marc" key={b.id}>
              <button type="button" className={`filtro ${on ? 'on' : ''}`} {...(ehProfissional ? {} : gestosBarb(b.id))} aria-pressed={on} disabled={ehProfissional} data-testid={`filtro-${b.id}`}
                title={ehProfissional ? undefined : 'Clique para ver só esta agenda · segure ou dê dois cliques para juntar com outras'}>
                <Avatar nome={b.apelido || b.nome} foto={b.foto} chave={b.id} />
                <span className="filtro-txt"><b>{b.apelido || b.nome}</b><small>{contagemHoje(b.id)} hoje{p ? ` · próx. ${sameDay(p.inicio, agora) ? '' : `${fmtDateShort(p.inicio)} `}${fmtHM(p.inicio)}` : ''}</small></span>
              </button>
              {on && selecionados.length > 1 && <BotaoRemover id={b.id} rotulo={b.apelido || b.nome} onClick={() => setSel(removerUm(selecionados, b.id, 1))} />}
            </span>
          );
        })}
      </div>
      )}

      {__AGENDZ_EXP_CARTOES__ ? (
        <div className="exp-topo" data-testid="exp-topo">
          <div className="exp-acoes">{botaoLink}{botaoAtender}</div>
          <div className="segmentado exp-modos" role="group" aria-label="Como ver a agenda">
            {[['horarios', 'Horários'], ['calendario', 'Calendário']].map(([k, r]) => (
              <button key={k} type="button" className={modoExp === k ? 'on' : ''} onClick={() => salvarModoExp(k)} aria-pressed={modoExp === k} data-testid={`exp-modo-${k}`}>{r}</button>
            ))}
          </div>
          <div className="barra-cal-nav">
            <Btn tamanho="sm" onClick={() => setCursor(startOfDay(agora))}>Hoje</Btn>
            <button type="button" className="icone-btn" onClick={() => mover(-1)} aria-label="Anterior"><Icon n="left" /></button>
            <button type="button" className="icone-btn" onClick={() => mover(1)} aria-label="Próximo"><Icon n="right" /></button>
            <h2 className="cal-titulo" data-testid="cal-titulo">{titulo}</h2>
          </div>
        </div>
      ) : (
        <div className="barra-cal">
        <div className="barra-cal-nav">
          <Btn tamanho="sm" onClick={() => setCursor(startOfDay(agora))}>Hoje</Btn>
          <button type="button" className="icone-btn" onClick={() => mover(-1)} aria-label="Anterior"><Icon n="left" /></button>
          <button type="button" className="icone-btn" onClick={() => mover(1)} aria-label="Próximo"><Icon n="right" /></button>
          <h2 className="cal-titulo" data-testid="cal-titulo">{titulo}</h2>
        </div>
        <div className="barra-cal-acoes">
          <div className="segmentado" role="group" aria-label="Visualização">
            {[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, r]) => (
              <button key={k} type="button" className={viewEfetiva === k ? 'on' : ''} onClick={() => setView(k)} aria-pressed={viewEfetiva === k}>{r}</button>
            ))}
          </div>
          {botaoLink}
          {botaoAtender}
        </div>
        </div>
      )}

      <div className="legenda" role="group" aria-label="Legenda de cores e total do período. Clique para filtrar por um status; segure ou dê dois cliques para juntar vários; arraste para mudar a ordem.">
        {ordemLegenda.ids.map((k) => {
          const m = MARCADORES.find((x) => x.k === k);
          const on = marcados.includes(k);
          return (
            <span className="marc" key={k}>
              <button type="button" className={`chip ${m.k === 'reagendado' ? 'chip-reag' : `st-${m.cor}`} ${on ? 'on' : ''} ${ordemLegenda.classe(k)}`.trim()} aria-pressed={on} aria-label={`${m.rotulo}: ${contagem[k]} no período`} data-testid={`legenda-${k}`}
                title={`${on && marcados.length === 1 ? 'Mostrar todos de novo' : `Mostrar só: ${m.rotulo}`} · segure ou dê dois cliques para juntar com outros · arraste para mudar a ordem`} {...gestosStatus(k)} {...ordemLegenda.props(k)}>
                {m.check ? <Icon n="check" size={12} stroke={3} /> : m.k === 'reagendado' ? null : <i className="ponto" />}<span className="chip-rot">{m.rotulo}</span>
                <b className="cont" data-testid={`cont-${k}`} aria-label={`${contagem[k]} no período`}>{contagem[k]}</b>
              </button>
              {on && marcados.length > 1 && <BotaoRemover id={k} rotulo={m.rotulo} onClick={() => setMarcados((x) => removerUm(x, k))} />}
            </span>
          );
        })}
        {marcados.length > 0 && <button type="button" className="chip chip-limpar" onClick={() => setMarcados([])} data-testid="legenda-limpar"><Icon n="x" size={12} stroke={3} /><span className="chip-rot">Limpar filtro</span></button>}
      </div>
      {marcados.length > 0 && <p className="muted filtro-ativo" role="status" data-testid="filtro-ativo">Mostrando só: {marcados.map((k) => MARCADORES.find((m) => m.k === k)?.rotulo).join(' ou ')}.</p>}

      {viewEfetiva === 'mes' && <Mes mostraBarb={ativosSel.length > 1} cursor={cursor} evs={exibidos} st={st} agora={agora} onDia={abrirDia} onEvento={onAbrir} />}

      {viewEfetiva === 'semana' && (
        <Grade mostraBarb={ativosSel.length > 1} colunas={colunas} st={st} agora={agora} modo="semana" pm={1.15} onEvento={onAbrir} onVazio={(p) => onNovo({ ...p })} />
      )}

      {viewEfetiva === 'dia' && __AGENDZ_EXP_CARTOES__ && (
        <div className="exp-horarios" data-testid="exp-horarios">
          {exDia && exDia.tipo !== 'horario' && <div className="faixa-ex"><Icon n="calendar" size={15} /> {exDia.rotulo || TIPOS_EXCECAO[exDia.tipo]} · sem atendimento</div>}
          <h3 className="exp-titulo-dia">Agendamentos do dia <span className="chip chip-p">{listaDia.length}</span></h3>
          {listaDia.length === 0 && <Vazio icone="calendar" titulo="Dia livre" texto={marcados.length ? "Nenhum agendamento com o marcador escolhido nesta data." : "Nenhum agendamento nesta data."} />}
          {noBox.length > 0 && (
            <div className="no-box" data-testid="carros-no-box">
              <h4>Carros no box desde dias anteriores</h4>
              <div className="cartoes exp-cartoes">{noBox.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}</div>
            </div>
          )}
          <div className="cartoes exp-cartoes" data-testid="exp-cartoes">
            {listaDia.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}
          </div>
        </div>
      )}

      {viewEfetiva === 'dia' && !__AGENDZ_EXP_CARTOES__ && (
        <div className="dia-layout">
          <div className="dia-grade">
            {boxesHoje.length > 0 && (
              <div className="boxes-agora" role="list" aria-label="Boxes agora" data-testid="boxes-agora">
                {boxesHoje.map(({ box, a }) => (
                  <button type="button" role="listitem" key={box.id} className={`box-agora ${a ? `ocupado st-${visualDoCartao(a, agora).chave}` : 'livre'}`} disabled={!a} onClick={() => a && onAbrir(a.id)} data-testid={`box-agora-${box.id}`}>
                    <small>{box.nome}</small><b>{a ? textoVeiculo(a) || nomeCliente(st, a) : 'Livre'}</b>
                  </button>
                ))}
              </div>
            )}
            {exDia && exDia.tipo !== 'horario' && <div className="faixa-ex"><Icon n="calendar" size={15} /> {exDia.rotulo || TIPOS_EXCECAO[exDia.tipo]} · sem atendimento</div>}
            {!exDia && colunas.length > 0 && colunas.every((c) => c.disp.length === 0) && <div className="faixa-ex"><Icon n="calendar" size={15} /> Sem atendimento neste dia (fora da escala semanal)</div>}
            {colunas.length ? <Grade mostraBarb={ativosSel.length > 1} colunas={colunas} st={st} agora={agora} modo="dia" pm={1.45} onEvento={onAbrir} onVazio={(p) => onNovo({ ...p })} /> : <Vazio titulo={`Nenhum ${rot('profissional')} selecionado`} />}
            <p className="dica-grade muted"><Icon n="info" size={14} /> Toque num horário livre para agendar. As faixas listradas estão fora do horário de atendimento.</p>
          </div>
          <aside className="dia-lista" aria-label="Agendamentos do dia">
            <h3>Agendamentos do dia <span className="chip chip-p">{listaDia.length}</span></h3>
            {listaDia.length === 0 && <Vazio icone="calendar" titulo="Dia livre" texto={marcados.length ? "Nenhum agendamento com o marcador escolhido nesta data." : "Nenhum agendamento nesta data."} />}
            {noBox.length > 0 && (
              <div className="no-box" data-testid="carros-no-box">
                <h4>Carros no box desde dias anteriores</h4>
                <div className="cartoes">{noBox.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}</div>
              </div>
            )}
            <div className="cartoes">
              {listaDia.map((a) => <CartaoAgendamento key={a.id} a={a} st={st} agora={agora} mostraBarb={ativosSel.length > 1} onClick={() => onAbrir(a.id)} />)}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
