/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Menu Avaliações do site real: resumo (média, total, distribuição), filtros (período, profissional, serviço), lista e, numa segunda aba, as mensagens em lote.
// Quem decide o que cada pessoa vê é o servidor: profissional sem a seção recebe só as próprias (`soMinhas`) e o anônimo chega sem nome nem cadastro enquanto a regra da
// plataforma estiver desligada (aqui nada é inventado). Só o proprietário oculta/reexibe, com motivo; ocultar nunca apaga. Texto do cliente entra só como texto.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes próprias terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { avaliacoes as api, profissionais as apiProfissionais, servicos as apiServicos } from '../../services/api-real.js';
import { ANONIMO_REVELADO, MOTIVO_MAX, NOTA_MAX } from '../../domain/avaliacoes.js';
import { Rot, rots } from '../../domain/tipos.js';
import { fmtDate } from '../../domain/time.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import FilaMensagens from './FilaMensagens.jsx';

export function Estrelas({ nota, tamanho = 16 }) {
  return (
    <span className="estrelas" role="img" aria-label={`${nota} de ${NOTA_MAX} estrelas`} data-testid="estrelas" data-nota={nota}>
      {Array.from({ length: NOTA_MAX }, (_, i) => <span key={i} className={i < nota ? 'cheia' : 'vazia'}><Icone n="star" size={tamanho} /></span>)}
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
          <li key={n}><span>{n} <Icone n="star" size={12} /></span><i style={{ width: `${(r.distribuicao[n] / max) * 100}%` }} aria-hidden="true" /><b data-testid={`av-dist-${n}`}>{r.distribuicao[n]}</b></li>
        ))}
      </ul>
    </div>
  );
}

function Item({ x, dono, aoMudar }) {
  return (
    <li className={`av-item ${x.oculta ? 'oculta' : ''}`} data-testid="av-item">
      <div className="av-item-topo">
        <Estrelas nota={x.nota} />
        <span className="muted" data-testid="av-data">{fmtDate(x.em)}</span>
        {x.oculta && <span className="chip chip-p chip-alerta" data-testid="av-oculta">Oculta</span>}
      </div>
      <div className="av-quem">
        <b data-testid="av-cliente">{x.cliente || (x.anonimo ? 'Anônimo' : '—')}</b>
        {x.revelado && <span className="muted" data-testid="av-revelado"> {ANONIMO_REVELADO}</span>}
      </div>
      {x.texto && <p className="av-texto" data-testid="av-texto-item">{x.texto}</p>}
      <small className="muted" data-testid="av-contexto">{x.servicos.join(' + ') || '—'}{x.profissional ? ` · com ${x.profissional}` : ''}</small>
      {x.oculta && dono && <small className="muted" data-testid="av-motivo-oculta">Motivo: {x.motivoOculta}</small>}
      {dono && <div className="acoes"><Btn tamanho="sm" onClick={() => aoMudar(x)} data-testid={`av-${x.oculta ? 'reexibir' : 'ocultar'}-${x.id}`}>{x.oculta ? 'Reexibir' : 'Ocultar'}</Btn></div>}
    </li>
  );
}

// Motivo obrigatório na própria tela (nada de janela do navegador).
function PainelMotivo({ x, aoFechar, aoFeito }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const acao = x.oculta ? 'reexibir' : 'ocultar';
  const ok = async () => {
    if (ocupado) return;
    setOcupado(true); setErro('');
    const r = await api[acao](x.id, motivo);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoFeito(x.oculta ? 'Avaliação visível de novo.' : 'Avaliação oculta. Ela continua guardada.');
  };
  return (
    <div className="subcartao" data-testid="av-motivo-painel">
      <b>{x.oculta ? 'Reexibir avaliação' : 'Ocultar avaliação'}</b>
      {!x.oculta && <p className="muted">Oculta sai da lista dos outros usuários e da média. Nada é apagado: você pode reexibir depois.</p>}
      <Campo rotulo="Motivo (obrigatório)"><textarea rows={3} maxLength={MOTIVO_MAX} value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(''); }} data-testid="av-motivo" /></Campo>
      {erro && <Aviso tipo="erro"><span data-testid="av-motivo-erro">{erro}</span></Aviso>}
      <div className="acoes">
        <Btn variante={x.oculta ? 'primario' : 'perigo'} onClick={ok} disabled={ocupado} data-testid="av-motivo-ok">{ocupado ? 'Aguarde…' : (x.oculta ? 'Reexibir' : 'Ocultar')}</Btn>
        <Btn onClick={aoFechar}>Cancelar</Btn>
      </div>
    </div>
  );
}

function Lista({ dono, filtros, vazio, aoCarregar }) {
  const [dados, setDados] = useState(undefined); // undefined = carregando
  const [erro, setErro] = useState('');
  const [mudar, setMudar] = useState(null);
  const [aviso, setAviso] = useState('');
  const [versao, setVersao] = useState(0);
  const chave = JSON.stringify(filtros);
  useEffect(() => {
    let vivo = true;
    setDados(undefined); setErro('');
    Promise.all([api.listar(filtros), api.resumo(filtros)]).then(([l, r]) => {
      if (!vivo) return;
      if (!l.ok) { setErro(l.erro); setDados(null); return; }
      setDados({ lista: l, resumo: r.ok ? r.resumo : null });
      if (aoCarregar) aoCarregar(l);
    });
    return () => { vivo = false; };
  }, [chave, versao]); // eslint-disable-line react-hooks/exhaustive-deps
  if (dados === undefined) return <p className="muted" role="status">Carregando…</p>;
  if (erro) return <Aviso tipo="erro"><span data-testid="av-erro">{erro}</span></Aviso>;
  const { lista, resumo } = dados;
  return (
    <>
      {aviso && <Aviso><span data-testid="av-aviso">{aviso}</span></Aviso>}
      {resumo && resumo.total > 0 && <Resumo r={resumo} />}
      {lista.avaliacoes.length === 0
        ? <div data-testid="av-vazio">{vazio}</div>
        : <ul className="av-lista" data-testid="av-lista">{lista.avaliacoes.map((x) => <Item key={x.id} x={x} dono={dono} aoMudar={(y) => { setAviso(''); setMudar(y); }} />)}</ul>}
      {mudar && <PainelMotivo x={mudar} aoFechar={() => setMudar(null)} aoFeito={(m) => { setMudar(null); setAviso(m); setVersao((v) => v + 1); }} />}
    </>
  );
}

const Vazio = ({ titulo, texto }) => <div className="vazio"><Icone n="star" size={28} /><b>{titulo}</b><span>{texto}</span></div>;

export default function Avaliacoes({ dono, podeLote }) {
  const [aba, setAba] = useState('lista');
  const [profissionais, setProfissionais] = useState([]);
  const [servicos, setServicos] = useState([]);
  useEffect(() => { // só para os filtros e a fila em lote; se falhar, os filtros ficam só com "Todos"
    apiProfissionais.listar().then((r) => { if (r.ok) setProfissionais(r.profissionais); });
    apiServicos.listar().then((r) => { if (r.ok) setServicos(r.servicos); });
  }, []);
  const [soMinhas, setSoMinhas] = useState(false);
  const [f, setF] = useState({ de: '', ate: '', profissionalId: '', servicoId: '' });
  const filtros = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
  const temFiltro = Object.keys(filtros).length > 0;
  const periodoIncompleto = !!f.de !== !!f.ate; // só uma das datas: não filtra por período até preencher as duas
  const filtrosOk = periodoIncompleto ? Object.fromEntries(Object.entries(filtros).filter(([k]) => k !== 'de' && k !== 'ate')) : filtros;
  const servicosSimples = servicos.filter((s) => !s.combo);
  return (
    <section className="tela" data-testid="tela-avaliacoes">
      <header className="tela-topo"><h1>{soMinhas ? 'Minhas avaliações' : 'Avaliações'}</h1></header>
      {podeLote && (
        <div className="abas" role="tablist" aria-label="Avaliações">
          <button type="button" role="tab" aria-selected={aba === 'lista'} className={aba === 'lista' ? 'on' : ''} onClick={() => setAba('lista')} data-testid="av-aba-lista">Avaliações</button>
          <button type="button" role="tab" aria-selected={aba === 'lote'} className={aba === 'lote' ? 'on' : ''} onClick={() => setAba('lote')} data-testid="av-aba-lote">Mensagens em lote</button>
        </div>
      )}
      {aba === 'lote' && podeLote ? <FilaMensagens profissionais={profissionais} servicos={servicosSimples} /> : (
        <>
          <p className="muted">{soMinhas ? 'O que os clientes avaliaram nos seus atendimentos.' : 'O que os clientes avaliaram depois do atendimento. Para pedir uma avaliação, toque na estrela do atendimento concluído na Agenda.'}</p>
          <div className="linha-campos av-filtros" data-testid="av-filtros">
            <Campo rotulo="De"><input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} data-testid="av-filtro-de" /></Campo>
            <Campo rotulo="Até"><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} data-testid="av-filtro-ate" /></Campo>
            {!soMinhas && <Campo rotulo={Rot('profissional')}><select value={f.profissionalId} onChange={(e) => setF({ ...f, profissionalId: e.target.value })} data-testid="av-filtro-prof"><option value="">Todos</option>{profissionais.map((u) => <option key={u.id} value={u.id}>{u.apelido || u.nome}</option>)}</select></Campo>}
            <Campo rotulo="Serviço"><select value={f.servicoId} onChange={(e) => setF({ ...f, servicoId: e.target.value })} data-testid="av-filtro-servico"><option value="">Todos</option>{servicosSimples.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
            {temFiltro && <Btn onClick={() => setF({ de: '', ate: '', profissionalId: '', servicoId: '' })} data-testid="av-limpar">Limpar filtros</Btn>}
          </div>
          {periodoIncompleto && <Aviso>Preencha as duas datas para filtrar por período.</Aviso>}
          <Lista dono={dono} filtros={filtrosOk} aoCarregar={(l) => setSoMinhas(l.soMinhas)}
            vazio={temFiltro
              ? <Vazio titulo="Nenhuma avaliação neste filtro" texto={`Mude o período ou o filtro de ${rots('profissional')} e serviço.`} />
              : <Vazio titulo="Nenhuma avaliação ainda" texto={soMinhas ? 'Quando um cliente avaliar um atendimento seu, aparece aqui.' : 'Quando um cliente avaliar, aparece aqui. Peça pela estrela nos atendimentos concluídos da Agenda ou use as mensagens em lote.'} />} />
        </>
      )}
    </section>
  );
}
