/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Atender do site real (F2 parte 5c): um botão só para atendimento já feito (agora ou passado, concluído na hora) e agendamento futuro.
// A regra toda (cliente por telefone, conflito, expediente, dia anterior com motivo, quem pode lançar) está no servidor (POST /api/atendimentos);
// a tela mostra as mensagens dele. Produto, forma de pagamento e comissão chegam na parte 5d. Não importa `api.js`, `hooks.js` nem `common.jsx`.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { agenda as api, clientes as apiClientes, servicos as apiServicos } from '../../services/api-real.js';
import { fmtMoney, startOfDay } from '../../domain/time.js';
import { formatarTelefone, somenteDigitos } from '../../domain/rules.js';
import { Rot } from '../../domain/tipos.js';
import { camposFaltando, ehRetroativo, filtrarServicos, resumoDosServicos, tipoDoAtendimento } from '../../domain/atender-form.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const aoLocal = (ts) => { const d = new Date(ts); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const doLocal = (v) => { const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };
const telNacional = (t) => { const d = somenteDigitos(t); return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d; };

export default function Atender({ profissionais, meuId, ehProprio, aoSalvar, aoFechar }) {
  const agora = Date.now();
  const [personalizar, setPersonalizar] = useState(false);
  const [quando, setQuando] = useState(() => aoLocal(Math.ceil(agora / 3600000) * 3600000));
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [profId, setProfId] = useState(() => (profissionais.some((p) => p.id === meuId) ? meuId : (profissionais[0] || {}).id || ''));
  const [servicos, setServicos] = useState(null);
  const [buscaSrv, setBuscaSrv] = useState('');
  const [ids, setIds] = useState([]);
  const [status, setStatus] = useState('a_confirmar');
  const [encaixe, setEncaixe] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ultima = useRef(0);

  useEffect(() => { let vivo = true; apiServicos.listar().then((r) => { if (vivo) { if (r.ok) setServicos(r.servicos.filter((s) => s.ativo !== false)); else { setServicos([]); setErro(r.erro); } } }); return () => { vivo = false; }; }, []);
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setAchados([]); return undefined; }
    const n = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await apiClientes.listar(q);
      if (n === ultima.current && r.ok) setAchados(r.clientes.slice(0, 5));
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  const inicio = personalizar ? doLocal(quando) : null;
  const instante = personalizar ? inicio : agora;
  const tipo = tipoDoAtendimento(instante, agora);
  const retro = personalizar && ehRetroativo(inicio, agora);
  const bloqueado = retro && ehProprio;
  const lista = useMemo(() => filtrarServicos(servicos || [], buscaSrv), [servicos, buscaSrv]);
  const resumo = resumoDosServicos(servicos || [], ids);
  const faltam = camposFaltando(tipo, { nome, telefone, cliente });

  const escolher = (c) => { setCliente(c); setNome(c.apelido || c.nome); setTelefone(c.telefone ? formatarTelefone(telNacional(c.telefone)) : ''); setBusca(''); setAchados([]); setErro(''); };
  const marcar = (id) => setIds((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    if (personalizar && inicio === null) { setErro('Informe a data e a hora.'); return; }
    setEnviando(true); setErro('');
    const r = await api.atender({
      servicoIds: ids, nome, telefone, ...(cliente ? { clienteId: cliente.id } : {}), profissionalId: profId,
      ...(personalizar ? { inicio } : {}), ...(retro ? { motivoRetroativo: motivo } : {}),
      ...(tipo === 'futuro' ? { status, encaixe } : {}),
    });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(tipo === 'futuro' ? 'Agendamento criado.' : 'Atendimento registrado.', r.agendamento);
  };

  return (
    <form className="atender-real" onSubmit={enviar} data-testid="atender-form" aria-label="Atender">
      <div className="atender-real-topo">
        <h3 className="atender-real-titulo">Atender</h3>
        <Btn tamanho="sm" onClick={aoFechar} data-testid="atender-fechar" aria-label="Fechar"><Icone n="x" size={15} /></Btn>
      </div>

      <fieldset className="atender-real-bloco" data-testid="atender-quando-bloco">
        <legend>Quando</legend>
        <div className="acoes">
          <button type="button" className={`btn btn-sm${!personalizar ? ' btn-on' : ''}`} aria-pressed={!personalizar} onClick={() => { setPersonalizar(false); setErro(''); }} data-testid="atender-agora"><Icone n="clock" size={15} />Agora</button>
          <button type="button" className={`btn btn-sm${personalizar ? ' btn-on' : ''}`} aria-pressed={personalizar} onClick={() => { setPersonalizar(true); setErro(''); }} data-testid="atender-quando"><Icone n="calendar" size={15} />Escolher data e hora</button>
        </div>
        {personalizar && <Campo rotulo="Data e hora"><input type="datetime-local" step={300} value={quando} onChange={(e) => { setQuando(e.target.value); setErro(''); }} data-testid="atender-data" /></Campo>}
        {retro && !bloqueado && (
          <Campo rotulo="Motivo do lançamento de um dia anterior">
            <input type="text" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que não foi registrado na hora? (fica no histórico)" data-testid="atender-motivo-retro" />
          </Campo>
        )}
        {bloqueado && <Aviso tipo="erro" data-testid="atender-retro-bloqueado">Lançar um dia anterior é com o proprietário ou a recepção. Peça a eles para registrar.</Aviso>}
        <p className="muted" data-testid="atender-tipo">{tipo === 'futuro' ? 'Agendamento: o horário fica reservado para o cliente.' : 'Atendimento já feito: entra como concluído.'}</p>
      </fieldset>

      <fieldset className="atender-real-bloco">
        <legend>Cliente</legend>
        {cliente ? (
          <p className="msg-ok" data-testid="atender-vinculo">Cadastro escolhido: {cliente.apelido || cliente.nome}. <button type="button" className="link" onClick={() => { setCliente(null); }} data-testid="atender-trocar-cliente">Trocar</button></p>
        ) : (
          <Campo rotulo="Buscar cliente cadastrado (opcional)"><input value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={60} placeholder="Nome ou telefone" autoComplete="off" data-testid="atender-busca" /></Campo>
        )}
        {achados.length > 0 && (
          <ul className="atender-real-achados" data-testid="atender-achados">
            {achados.map((c) => <li key={c.id}><button type="button" className="atender-real-achado" onClick={() => escolher(c)} data-testid={`atender-cli-${c.id}`}>{c.apelido || c.nome}<span className="muted"> · {c.telefone ? formatarTelefone(telNacional(c.telefone)) : ''}</span></button></li>)}
          </ul>
        )}
        <div className="form-grade">
          <Campo rotulo={`Nome${tipo === 'futuro' ? ' *' : ''}`}><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder="Nome ou apelido" data-testid="atender-nome" /></Campo>
          <Campo rotulo={`Telefone${tipo === 'futuro' ? ' *' : ''}`}><input value={telefone} inputMode="tel" autoComplete="off" onChange={(e) => setTelefone(e.target.value)} placeholder="(55) 99999-9999" data-testid="atender-telefone" /></Campo>
        </div>
        <p className="muted">Com telefone, o cadastro é achado ou criado. Só com o nome, nada é cadastrado.</p>
      </fieldset>

      <fieldset className="atender-real-bloco">
        <legend>Serviços</legend>
        <Campo rotulo="Buscar serviço"><input value={buscaSrv} onChange={(e) => setBuscaSrv(e.target.value)} maxLength={40} placeholder="Nome ou código" data-testid="atender-busca-servico" /></Campo>
        {servicos === null && <p className="muted" role="status">Carregando…</p>}
        {servicos !== null && lista.length === 0 && <p className="muted" data-testid="atender-sem-servicos">{servicos.length ? 'Nenhum serviço com essa busca.' : 'Nenhum serviço cadastrado.'}</p>}
        <ul className="atender-real-servicos" data-testid="atender-lista-servicos">
          {lista.map((s) => (
            <li key={s.id}>
              <label className="check-linha"><input type="checkbox" checked={ids.includes(s.id)} onChange={() => marcar(s.id)} data-testid={`atender-srv-${s.id}`} /><span>{s.nome}</span><span className="muted"> · {s.duracaoMin} min · {fmtMoney(s.preco)}</span></label>
            </li>
          ))}
        </ul>
        <p className="muted" data-testid="atender-total">{resumo.qtd ? `${resumo.qtd} serviço${resumo.qtd === 1 ? '' : 's'} · ${resumo.minutos} min · ${fmtMoney(resumo.total)}` : 'Escolha ao menos um serviço.'}</p>
      </fieldset>

      <div className="form-grade">
        <Campo rotulo={Rot('profissional')}>
          <select value={profId} onChange={(e) => setProfId(e.target.value)} disabled={ehProprio} data-testid="atender-profissional">
            {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        {tipo === 'futuro' && (
          <div className="campo">
            <span className="campo-rotulo">Situação</span>
            <div className="acoes">
              {[['a_confirmar', 'A confirmar'], ['confirmado', 'Confirmado']].map(([k, r]) => (
                <label key={k} className={`radio-op ${status === k ? 'on' : ''}`}><input type="radio" name="atender-status" checked={status === k} onChange={() => setStatus(k)} data-testid={`atender-status-${k}`} />{r}</label>
              ))}
            </div>
          </div>
        )}
      </div>
      {tipo === 'futuro' && <label className="check-linha"><input type="checkbox" checked={encaixe} onChange={(e) => setEncaixe(e.target.checked)} data-testid="atender-encaixe" /><span>Encaixe (pode ficar sobre um horário já confirmado)</span></label>}

      {faltam.length > 0 && <p className="muted" data-testid="atender-faltam">Falta preencher: {faltam.join(', ')}.</p>}
      {erro && <Aviso tipo="erro" data-testid="atender-erro">{erro}</Aviso>}
      <div className="acoes">
        <Btn onClick={aoFechar} data-testid="atender-cancelar">Cancelar</Btn>
        <Btn variante="primario" type="submit" disabled={enviando || bloqueado} data-testid="salvar-atender">{enviando ? 'Salvando…' : tipo === 'futuro' ? 'Agendar' : 'Registrar'}</Btn>
      </div>
    </form>
  );
}
