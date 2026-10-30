/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Menu Avaliações: resumo (média, total, distribuição), filtros (período, profissional, serviço) e lista. Dono oculta com motivo (não apaga).
// Profissional sem a seção vê só "Minhas avaliações". Anônimo: o painel só recebe "Anônimo" (ou o nome + "(avaliado como anônimo)" se o Admin liberou).
// Texto do cliente entra só como texto (React escapa).
import React, { useMemo, useState } from 'react';
import { avaliacoes as api } from '../services/api.js';
import { ANONIMO_REVELADO, MOTIVO_MAX, NOTA_MAX } from '../domain/avaliacoes.js';
import { ehDono } from '../domain/rules.js';
import { Rot, rots } from '../domain/tipos.js';
import { fmtDate } from '../domain/time.js';
import { Aviso, Btn, Campo, Icon, Modal, Vazio } from './common.jsx';
import { toast, useStore } from './hooks.js';

export function Estrelas({ nota, tamanho = 16 }) {
  return (
    <span className="estrelas" role="img" aria-label={`${nota} de ${NOTA_MAX} estrelas`} data-testid="estrelas" data-nota={nota}>
      {Array.from({ length: NOTA_MAX }, (_, i) => <span key={i} className={i < nota ? 'cheia' : 'vazia'}><Icon n="star" size={tamanho} /></span>)}
    </span>
  );
}

function Resumo({ r }) {
  const max = Math.max(1, ...Object.values(r.distribuicao));
  return (
    <div className="av-resumo" data-testid="av-resumo">
      <div className="av-media">
        <b data-testid="av-media">{r.media === null ? '—' : String(r.media).replace('.', ',')}</b>
        {r.media !== null && <Estrelas nota={Math.round(r.media)} />}
        <span className="muted" data-testid="av-total">{r.total} {r.total === 1 ? 'avaliação' : 'avaliações'}</span>
      </div>
      <ul className="av-dist" aria-label="Quantidade por nota">
        {[5, 4, 3, 2, 1].map((n) => (
          <li key={n}><span>{n} <Icon n="star" size={12} /></span><i style={{ width: `${(r.distribuicao[n] / max) * 100}%` }} aria-hidden="true" /><b data-testid={`av-dist-${n}`}>{r.distribuicao[n]}</b></li>
        ))}
      </ul>
    </div>
  );
}

function Item({ x, dono, onMudar }) {
  return (
    <li className={`av-item ${x.oculta ? 'oculta' : ''}`} data-testid="av-item">
      <div className="av-item-topo">
        <Estrelas nota={x.nota} />
        <span className="muted" data-testid="av-data">{fmtDate(x.em)}</span>
        {x.oculta && <span className="chip chip-p chip-alerta" data-testid="av-oculta">Oculta</span>}
      </div>
      <div className="av-quem">
        <b data-testid="av-cliente">{x.cliente}</b>
        {x.revelado && <span className="muted" data-testid="av-revelado"> {ANONIMO_REVELADO}</span>}
      </div>
      {x.texto && <p className="av-texto" data-testid="av-texto-item">{x.texto}</p>}
      <small className="muted" data-testid="av-contexto">{x.servicos.join(' + ') || '—'} · com {x.profissional}</small>
      {x.oculta && dono && <small className="muted" data-testid="av-motivo-oculta">Motivo: {x.motivoOculta}</small>}
      {dono && <div className="acoes"><Btn tamanho="sm" onClick={() => onMudar(x)} data-testid={`av-${x.oculta ? 'reexibir' : 'ocultar'}-${x.id}`}>{x.oculta ? 'Reexibir' : 'Ocultar'}</Btn></div>}
    </li>
  );
}

function ModalMotivo({ x, onClose }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const acao = x.oculta ? 'reexibir' : 'ocultar';
  const ok = () => { const r = api[acao](x.id, { motivo }); if (!r.ok) { setErro(r.erros[0]); return; } toast(x.oculta ? 'Avaliação visível de novo.' : 'Avaliação oculta. Ela continua guardada.'); onClose(); };
  return (
    <Modal titulo={x.oculta ? 'Reexibir avaliação' : 'Ocultar avaliação'} onClose={onClose} rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante={x.oculta ? 'primario' : 'perigo'} onClick={ok} data-testid="av-motivo-ok">{x.oculta ? 'Reexibir' : 'Ocultar'}</Btn></>}>
      {!x.oculta && <p>Oculta sai da lista dos outros usuários e da média. Nada é apagado: você pode reexibir depois.</p>}
      <Campo rotulo="Motivo (obrigatório)"><textarea rows={3} maxLength={MOTIVO_MAX} value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="av-motivo" /></Campo>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

// Lista + resumo com os filtros recebidos (o painel e o cadastro do serviço usam o mesmo bloco).
export function ListaAvaliacoes({ user, filtros, vazio }) {
  const { state: st } = useStore();
  const [mudar, setMudar] = useState(null);
  const lista = useMemo(() => api.listar(filtros), [st, JSON.stringify(filtros)]); // eslint-disable-line react-hooks/exhaustive-deps
  const resumo = useMemo(() => api.resumo(filtros), [st, JSON.stringify(filtros)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!lista.ok) return <Aviso tipo="erro">{lista.erros?.[0] || 'Sem acesso.'}</Aviso>;
  const dono = ehDono(user);
  return (
    <>
      {resumo.ok && resumo.total > 0 && <Resumo r={resumo} />}
      {lista.avaliacoes.length === 0
        ? <div data-testid="av-vazio">{vazio}</div>
        : <ul className="av-lista" data-testid="av-lista">{lista.avaliacoes.map((x) => <Item key={x.id} x={x} dono={dono} onMudar={setMudar} />)}</ul>}
      {mudar && <ModalMotivo x={mudar} onClose={() => setMudar(null)} />}
    </>
  );
}

export default function Avaliacoes({ user }) {
  const { state: st } = useStore();
  const [f, setF] = useState({ de: '', ate: '', profissionalId: '', servicoId: '' });
  const probe = useMemo(() => api.listar({}), [st]); // eslint-disable-line react-hooks/exhaustive-deps
  const soMinhas = probe.ok && probe.soMinhas;
  const filtros = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
  const temFiltro = Object.keys(filtros).length > 0;
  const periodoIncompleto = !!f.de !== !!f.ate; // só uma das datas: não filtra por período até preencher as duas
  const filtrosOk = periodoIncompleto ? { ...filtros, de: undefined, ate: undefined } : filtros;
  const profissionais = st.usuarios.filter((u) => u.atende);
  return (
    <section className="tela" data-testid="tela-avaliacoes">
      <header className="tela-topo"><h1>{soMinhas ? 'Minhas avaliações' : 'Avaliações'}</h1></header>
      <p className="muted">{soMinhas ? 'O que os clientes avaliaram nos seus atendimentos.' : 'O que os clientes avaliaram depois do atendimento. Para pedir uma avaliação, toque na estrela do atendimento concluído na Agenda.'}</p>
      <div className="linha-campos av-filtros" data-testid="av-filtros">
        <Campo rotulo="De"><input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} data-testid="av-filtro-de" /></Campo>
        <Campo rotulo="Até"><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} data-testid="av-filtro-ate" /></Campo>
        {!soMinhas && <Campo rotulo={Rot('profissional')}><select value={f.profissionalId} onChange={(e) => setF({ ...f, profissionalId: e.target.value })} data-testid="av-filtro-prof"><option value="">Todos</option>{profissionais.map((u) => <option key={u.id} value={u.id}>{u.apelido || u.nome}</option>)}</select></Campo>}
        <Campo rotulo="Serviço"><select value={f.servicoId} onChange={(e) => setF({ ...f, servicoId: e.target.value })} data-testid="av-filtro-servico"><option value="">Todos</option>{st.servicos.filter((s) => !s.combo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
        {temFiltro && <Btn onClick={() => setF({ de: '', ate: '', profissionalId: '', servicoId: '' })} data-testid="av-limpar">Limpar filtros</Btn>}
      </div>
      {periodoIncompleto && <Aviso>Preencha as duas datas para filtrar por período.</Aviso>}
      <ListaAvaliacoes user={user} filtros={filtrosOk}
        vazio={temFiltro
          ? <Vazio icone="star" titulo="Nenhuma avaliação neste filtro" texto={`Mude o período ou o filtro de ${rots('profissional')} e serviço.`} />
          : <Vazio icone="star" titulo="Nenhuma avaliação ainda" texto={soMinhas ? `Quando um cliente avaliar um atendimento seu, aparece aqui.` : 'Quando um cliente avaliar, aparece aqui. Peça pela estrela nos atendimentos concluídos da Agenda ou use as mensagens em lote.'} />} />
    </section>
  );
}
