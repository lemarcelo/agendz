/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Agenda do site real (F2 parte 5b): Horários (cartões do dia + próximos agendamentos por dia) e Calendário (mês), troca de profissional, status e remarcar.
// Toda a regra (conflito, expediente, reativar, confirmar cancela "a confirmar" que cobrem, concluído nunca remarca) está no servidor: a tela mostra o que ele
// devolve, com as mensagens dele. O profissional só recebe os próprios agendamentos (o servidor filtra). Atender (atendimento local e novo agendamento) é o `Atender.jsx` (5c);
// nas lojas com veículo/porte (estética) o botão ainda não aparece: veículo e porte no Atender real são da fatia 5a restante.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agenda as api, clientes as apiClientes, profissionais as apiProf } from '../../services/api-real.js';
import { DIAS_CURTOS, addDays, addMonths, fmtDateTime, fmtDayLong, fmtHM, fmtMoney, fmtMonthYear, monthStart, sameDay, startOfDay, weekStart, ymd } from '../../domain/time.js';
import { ATIVOS, ROTULO_STATUS } from '../../domain/rules.js';
import { agruparPorDia } from '../../domain/agenda-grupos.js';
import { Rot, capAtiva } from '../../domain/tipos.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import Atender from './Atender.jsx';

const CHAVE_COR = { a_confirmar: 'amarelo', confirmado: 'azul', concluido: 'verde', cancelado: 'cinza' };
// "Cliente agendou": pediu pelo link e aguarda o estabelecimento confirmar (só visual, sobre "a confirmar").
const visual = (a) => (a.status === 'a_confirmar' && a.origem === 'link' ? { cor: 'roxo', rotulo: 'Cliente agendou' } : { cor: CHAVE_COR[a.status], rotulo: ROTULO_STATUS[a.status] });
const aoLocal = (ts) => { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const doLocal = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };

const rotuloDoGrupo = (dia, agora) => (sameDay(dia, addDays(startOfDay(agora), 1)) ? `Amanhã · ${fmtDayLong(dia)}` : sameDay(dia, agora) ? `Hoje · ${fmtDayLong(dia)}` : fmtDayLong(dia));

function Cartao({ a, nomeCliente, nomeProf, mostraProf, aberto, aoAbrir, testid, children }) {
  const v = visual(a);
  const venda = a.produtos.length ? a.produtos.map((p) => `${p.qtd}× ${p.nome}`).join(', ') : '';
  const servicos = a.servicos.map((s) => s.nome).join(' + ') || (venda ? 'Venda de produtos' : 'Sem serviço');
  return (
    <div className={`cartao-real st-${v.cor}`} data-testid={testid} data-status={a.status} data-id={a.id}>
      <button type="button" className="cartao" onClick={aoAbrir} aria-expanded={aberto} data-testid={`${testid}-abrir`}>
        <div className="cartao-topo">
          <strong className="cartao-hora">{fmtHM(a.inicio)}</strong>
          <span className="cartao-nome">{nomeCliente}</span>
          <span className={`chip chip-p st-${v.cor}`} data-testid={`${testid}-status`}>{v.rotulo}</span>
        </div>
        <div className="cartao-corpo">
          <span>{servicos}</span>
          <span className="muted cartao-com">{mostraProf ? `com ${nomeProf} · ` : ''}{fmtMoney(a.total + a.totalProdutos)}</span>
        </div>
        <div className="cartao-rodape">
          {a.encaixe && <span className="chip chip-p chip-encaixe">Encaixe</span>}
          {a.reagendado && <span className="chip chip-p chip-reag">Reagendado</span>}
          {a.conflitosPendentes.length > 0 && <span className="chip chip-p chip-alerta" data-testid="cartao-conflito">{a.conflitosPendentes.length === 1 ? '1 a confirmar no mesmo horário' : `${a.conflitosPendentes.length} a confirmar no mesmo horário`}</span>}
        </div>
      </button>
      {aberto && children}
    </div>
  );
}

// Detalhes e ações de um agendamento aberto: status, cancelar com confirmação na tela, remarcar e histórico.
function Detalhe({ a, nomeProf, nomeDe, profissionais, ehDono, aoAlterar }) {
  const [hist, setHist] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [remarcando, setRemarcando] = useState(false);
  const [quando, setQuando] = useState(() => aoLocal(a.inicio));
  const [prof, setProf] = useState(a.profissionalId);
  useEffect(() => { let vivo = true; api.obter(a.id).then((r) => { if (vivo && r.ok) setHist(r.agendamento.historico); }); return () => { vivo = false; }; }, [a.id, a.status, a.inicio]);
  const executar = async (fn, aviso) => {
    if (ocupado) return;
    setOcupado(true); setErro('');
    const r = await fn();
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    setCancelando(false); setRemarcando(false);
    aoAlterar(aviso, r.agendamento);
  };
  const mudar = (status, aviso) => () => executar(() => api.mudarStatus(a.id, status), aviso);
  const remarcar = (e) => {
    e.preventDefault();
    const ts = doLocal(quando);
    if (ts === null) { setErro('Informe a nova data e hora.'); return; }
    executar(() => api.remarcar(a.id, { inicio: ts, ...(ehDono && prof !== a.profissionalId ? { profissionalId: prof } : {}) }), 'Agendamento remarcado.');
  };
  const ativoStatus = a.status;
  return (
    <div className="cartao-detalhe" data-testid="agendamento-detalhe">
      <ul className="detalhe-itens">
        {a.servicos.map((s, i) => <li key={`${s.servicoId}-${i}`}>{s.nome} · {s.duracaoMin} min · {fmtMoney(s.preco)}</li>)}
        {a.produtos.map((p) => <li key={p.materialId} data-testid="detalhe-produto">{p.qtd}× {p.nome} · {fmtMoney(p.preco * p.qtd)}{p.vendedorId && p.vendedorId !== a.profissionalId ? ` · vendeu ${nomeDe(p.vendedorId)}` : ''}</li>)}
      </ul>
      <p className="muted">{fmtDateTime(a.inicio)} até {fmtHM(a.fim ?? a.inicio)} · com {nomeProf}{a.motivoCancelamento ? ` · cancelado (${a.motivoCancelamento})` : ''}</p>
      {erro && <Aviso tipo="erro" data-testid="agendamento-erro">{erro}</Aviso>}
      {!cancelando && !remarcando && (
        <div className="acoes">
          {ativoStatus === 'a_confirmar' && <Btn variante="primario" tamanho="sm" disabled={ocupado} onClick={mudar('confirmado', 'Agendamento confirmado.')} data-testid="acao-confirmar">Confirmar</Btn>}
          {(ativoStatus === 'a_confirmar' || ativoStatus === 'confirmado') && <Btn tamanho="sm" disabled={ocupado} onClick={mudar('concluido', 'Agendamento concluído.')} data-testid="acao-concluir">Concluir</Btn>}
          {ativoStatus === 'concluido' && <Btn tamanho="sm" disabled={ocupado} onClick={mudar('confirmado', 'Agendamento reaberto como confirmado.')} data-testid="acao-reabrir">Reabrir</Btn>}
          {ativoStatus === 'cancelado' && <Btn variante="primario" tamanho="sm" disabled={ocupado} onClick={mudar('a_confirmar', 'Agendamento reativado.')} data-testid="acao-reativar">Reativar</Btn>}
          {ativoStatus !== 'cancelado' && ativoStatus !== 'concluido' && <Btn tamanho="sm" disabled={ocupado} onClick={() => setRemarcando(true)} data-testid="acao-remarcar">Remarcar</Btn>}
          {ativoStatus !== 'cancelado' && <Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={() => setCancelando(true)} data-testid="acao-cancelar">Cancelar</Btn>}
        </div>
      )}
      {cancelando && (
        <div className="confirmar-linha" data-testid="cancelar-confirmacao">
          <span>Cancelar este agendamento?</span>
          <Btn tamanho="sm" variante="perigo" disabled={ocupado} onClick={mudar('cancelado', 'Agendamento cancelado.')} data-testid="cancelar-sim">Sim, cancelar</Btn>
          <Btn tamanho="sm" onClick={() => setCancelando(false)} data-testid="cancelar-nao">Voltar</Btn>
        </div>
      )}
      {remarcando && (
        <form className="form-grade" onSubmit={remarcar} data-testid="remarcar-form">
          <Campo rotulo="Nova data e hora"><input type="datetime-local" step={300} value={quando} onChange={(e) => { setQuando(e.target.value); setErro(''); }} data-testid="remarcar-quando" /></Campo>
          {ehDono && profissionais.length > 1 && (
            <Campo rotulo={Rot('profissional')}>
              <select value={prof} onChange={(e) => setProf(e.target.value)} data-testid="remarcar-prof">{profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
            </Campo>
          )}
          <div className="acoes">
            <Btn tamanho="sm" onClick={() => { setRemarcando(false); setErro(''); }} data-testid="remarcar-cancelar">Voltar</Btn>
            <Btn variante="primario" tamanho="sm" type="submit" disabled={ocupado} data-testid="remarcar-salvar">{ocupado ? 'Salvando…' : 'Remarcar'}</Btn>
          </div>
        </form>
      )}
      {hist && hist.length > 0 && (
        <details className="historico">
          <summary data-testid="historico-abrir">Histórico ({hist.length})</summary>
          <ul data-testid="historico-lista">
            {hist.map((e, i) => <li key={i}><span className="muted">{e.em ? fmtDateTime(e.em) : ''}</span> · {e.autor}: {e.campo}{e.de ? ` de ${e.de}` : ''}{e.para ? ` para ${e.para}` : ''}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Calendario({ cursor, lista, aoEscolherDia }) {
  const inicio = weekStart(monthStart(cursor));
  const hoje = startOfDay(Date.now());
  const dias = Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
  const contagem = useMemo(() => {
    const m = new Map();
    for (const a of lista) if (a.status !== 'cancelado') m.set(ymd(a.inicio), (m.get(ymd(a.inicio)) || 0) + 1);
    return m;
  }, [lista]);
  return (
    <div className="cal-real" data-testid="calendario">
      <div className="cal-real-grade" role="grid">
        {DIAS_CURTOS.map((d) => <div key={d} className="cal-real-cab" role="columnheader">{d}</div>)}
        {dias.map((d) => {
          const n = contagem.get(ymd(d)) || 0;
          const fora = new Date(d).getMonth() !== new Date(cursor).getMonth();
          return (
            <button key={d} type="button" className={`cal-real-dia${fora ? ' fora' : ''}${d === hoje ? ' hoje' : ''}${n ? ' com' : ''}`} onClick={() => aoEscolherDia(d)} data-testid={`mes-dia-${ymd(d)}`} aria-label={`${fmtDayLong(d)}${n ? `, ${n} agendamento${n === 1 ? '' : 's'}` : ''}`}>
              <span className="cal-real-num">{new Date(d).getDate()}</span>
              {n > 0 && <span className="cal-real-cont" data-testid={`mes-cont-${ymd(d)}`}>{n}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Agenda({ ehProprio = false, ehDono = false, meuId = '' }) {
  const [modo, setModo] = useState('horarios');
  const [cursor, setCursor] = useState(() => startOfDay(Date.now()));
  const [diasAdiante, setDiasAdiante] = useState(7);
  const [selecionado, setSelecionado] = useState('todos');
  const [lista, setLista] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState(null);
  const [atendendo, setAtendendo] = useState(false);
  const [clientes, setClientes] = useState(new Map());
  const [profs, setProfs] = useState([]);
  const ultima = useRef(0);

  useEffect(() => {
    apiClientes.listar().then((r) => { if (r.ok) setClientes(new Map(r.clientes.map((c) => [c.id, c.apelido || c.nome]))); });
    apiProf.listar().then((r) => { if (r.ok) setProfs(r.profissionais); });
  }, []);

  const de = modo === 'horarios' ? cursor : weekStart(monthStart(cursor));
  const ate = modo === 'horarios' ? addDays(cursor, 1 + diasAdiante) : addDays(de, 42);
  useEffect(() => {
    const n = ++ultima.current;
    (async () => {
      const r = await api.listar({ de, ate });
      if (n !== ultima.current) return; // chegou resposta de uma consulta antiga
      if (!r.ok) { setErro(r.erro); setLista([]); return; }
      setErro(''); setLista(r.agendamentos);
    })();
  }, [de, ate, versao]);

  const atendem = useMemo(() => profs.filter((p) => p.atende), [profs]);
  const nomeProf = (id) => (profs.find((p) => p.id === id) || {}).nome || Rot('profissional');
  const nomeCliente = (a) => (a.clienteId && clientes.get(a.clienteId)) || 'Cliente';
  const visiveis = useMemo(() => (lista || []).filter((a) => selecionado === 'todos' || a.profissionalId === selecionado).sort((x, y) => x.inicio - y.inicio), [lista, selecionado]);
  const doDia = visiveis.filter((a) => a.inicio >= cursor && a.inicio < addDays(cursor, 1));
  const futuros = visiveis.filter((a) => a.inicio >= addDays(cursor, 1) && ATIVOS.includes(a.status));
  const grupos = agruparPorDia(futuros);
  const agora = Date.now();
  const temMais = modo === 'horarios' && diasAdiante < 364;

  const alterou = (texto, novo) => {
    setAviso(novo && novo.conflitosPendentes && novo.conflitosPendentes.length ? `${texto} Há ${novo.conflitosPendentes.length} agendamento(s) a confirmar no mesmo horário.` : texto);
    setVersao((v) => v + 1);
  };
  const atendeu = (texto, ag) => {
    setAtendendo(false);
    apiClientes.listar().then((r) => { if (r.ok) setClientes(new Map(r.clientes.map((c) => [c.id, c.apelido || c.nome]))); });
    setModo('horarios'); setCursor(startOfDay(ag.inicio)); setDiasAdiante(7); setAberto(null);
    alterou(texto, ag);
  };
  const irPara = (ts) => { setCursor(startOfDay(ts)); setAberto(null); setAviso(''); setDiasAdiante(7); };
  const passo = (n) => (modo === 'horarios' ? irPara(addDays(cursor, n)) : irPara(addMonths(cursor, n)));
  const podeAtender = !capAtiva('usaVeiculo');
  const mostrarSeletor = !ehProprio && atendem.length > 1;
  const titulo = modo === 'horarios' ? fmtDayLong(cursor) : fmtMonthYear(cursor);

  const cartao = (a, testid) => (
    <Cartao key={a.id} a={a} testid={testid} nomeCliente={nomeCliente(a)} nomeProf={nomeProf(a.profissionalId)} mostraProf={selecionado === 'todos' && atendem.length > 1}
      aberto={aberto === a.id} aoAbrir={() => setAberto(aberto === a.id ? null : a.id)}>
      <Detalhe a={a} nomeProf={nomeProf(a.profissionalId)} nomeDe={nomeProf} profissionais={atendem} ehDono={ehDono} aoAlterar={alterou} />
    </Cartao>
  );

  return (
    <section className="tela agenda-real" data-testid="agenda-real">
      <div className="abas" role="tablist" aria-label="Visão da agenda">
        <button type="button" role="tab" className={modo === 'horarios' ? 'on' : ''} aria-selected={modo === 'horarios'} onClick={() => { setModo('horarios'); setAberto(null); }} data-testid="aba-horarios">Horários</button>
        <button type="button" role="tab" className={modo === 'calendario' ? 'on' : ''} aria-selected={modo === 'calendario'} onClick={() => { setModo('calendario'); setAberto(null); }} data-testid="aba-calendario">Calendário</button>
      </div>
      <div className="agenda-barra">
        <Btn tamanho="sm" onClick={() => passo(-1)} aria-label={modo === 'horarios' ? 'Dia anterior' : 'Mês anterior'} data-testid="agenda-anterior"><Icone n="left" size={15} /></Btn>
        <Btn tamanho="sm" onClick={() => irPara(Date.now())} data-testid="agenda-hoje">Hoje</Btn>
        <Btn tamanho="sm" onClick={() => passo(1)} aria-label={modo === 'horarios' ? 'Próximo dia' : 'Próximo mês'} data-testid="agenda-proximo"><Icone n="right" size={15} /></Btn>
        <h2 className="agenda-titulo-real" data-testid="agenda-titulo">{titulo}</h2>
        {podeAtender && <Btn variante="primario" tamanho="sm" onClick={() => { setAtendendo(true); setAviso(''); }} disabled={atendendo || atendem.length === 0} data-testid="atender-abrir"><Icone n="plus" size={15} />Atender</Btn>}
      </div>
      {atendendo && <Atender profissionais={atendem} equipe={profs} meuId={meuId} ehProprio={ehProprio} aoSalvar={atendeu} aoFechar={() => setAtendendo(false)} />}
      {mostrarSeletor && (
        <div className="seletor-chips" role="group" aria-label={Rot('profissional')} data-testid="seletor-profissionais">
          <button type="button" className={`chip${selecionado === 'todos' ? ' on' : ''}`} aria-pressed={selecionado === 'todos'} onClick={() => setSelecionado('todos')} data-testid="sel-todos">Todos</button>
          {atendem.map((p) => <button key={p.id} type="button" className={`chip${selecionado === p.id ? ' on' : ''}`} aria-pressed={selecionado === p.id} onClick={() => setSelecionado(p.id)} data-testid={`sel-${p.id}`}>{p.nome}</button>)}
        </div>
      )}
      {erro && <Aviso tipo="erro" data-testid="agenda-erro">{erro}</Aviso>}
      {aviso && <Aviso data-testid="agenda-aviso">{aviso}</Aviso>}
      {lista === null && <p className="muted" role="status" data-testid="agenda-carregando">Carregando…</p>}
      {lista !== null && modo === 'calendario' && <Calendario cursor={cursor} lista={visiveis} aoEscolherDia={(d) => { setModo('horarios'); irPara(d); }} />}
      {lista !== null && modo === 'horarios' && (
        <>
          <div className="agenda-dia-real" data-testid="agenda-dia">
            {doDia.length === 0 ? <p className="muted vazio" data-testid="agenda-vazio">Nenhum agendamento neste dia.</p> : doDia.map((a) => cartao(a, 'cartao'))}
          </div>
          <div className="agenda-proximos-real" data-testid="agenda-proximos">
            <h3 className="agenda-titulo-proximos-real">Próximos agendamentos</h3>
            {grupos.length === 0 ? <p className="muted" data-testid="proximos-vazio">Nenhum agendamento nos próximos {diasAdiante} dias.</p> : grupos.map((g) => (
              <div key={g.dia} className="agenda-grupo-real" data-testid="proximo-dia">
                <button type="button" className="link link-dia" onClick={() => irPara(g.dia)} data-testid="proximo-dia-ir">{rotuloDoGrupo(g.dia, agora)}</button>
                <div className="agenda-lista-real">{g.lista.map((a) => cartao(a, 'cartao-proximo'))}</div>
              </div>
            ))}
            {temMais && <Btn onClick={() => setDiasAdiante(diasAdiante + 7)} data-testid="proximos-mais">Ver mais 7 dias</Btn>}
          </div>
        </>
      )}
    </section>
  );
}
