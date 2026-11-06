/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Ausência do BOX (bloco G2): período em que o box não recebe veículo (folga, manutenção). A MESMA tela no site real e na demonstração: quem usa passa `listar`, `criar` e
// `remover` (a API de cada lado). Período por dias inteiros (de/até, até 31 dias); o servidor decide e, se já houver carro agendado no período, grava mesmo assim e
// devolve `afetados` para a equipe remarcar. Não importa `api.js`, `api-real.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useCallback, useEffect, useState } from 'react';
import { Aviso, Btn, Icone } from './mini.jsx';

const DIA = 86400000;
const fmtData = (ts) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(ts));
const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const inicioDoDia = (iso) => Date.parse(`${iso}T00:00:00-03:00`);

/** "10/11 a 12/11" (o fim da ausência é a meia-noite seguinte ao último dia). */
export function periodoTexto(ini, fim) {
  const ultimo = fim - DIA;
  return ultimo <= ini ? fmtData(ini) : `${fmtData(ini)} a ${fmtData(ultimo)}`;
}

export default function AusenciaBoxPainel({ boxes, listar, criar, remover }) {
  const ativos = (boxes || []).filter((b) => b.ativo !== false);
  const [lista, setLista] = useState([]);
  const [boxId, setBoxId] = useState('');
  const [de, setDe] = useState(hojeIso());
  const [ate, setAte] = useState(hojeIso());
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  const recarregar = useCallback(async () => {
    const r = await listar();
    if (r.ok) setLista(r.ausencias); else setErro(r.erro || 'Não foi possível carregar as ausências.');
  }, [listar]);
  useEffect(() => { recarregar(); }, [recarregar]);
  useEffect(() => { if (!boxId && ativos.length) setBoxId(ativos[0].id); }, [ativos, boxId]);

  const registrar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setErro(''); setAviso('');
    if (!boxId) { setErro('Escolha o box.'); return; }
    if (!de || !ate || ate < de) { setErro('Informe o primeiro dia antes do último.'); return; }
    const ini = inicioDoDia(de);
    const fim = inicioDoDia(ate) + DIA;
    if (fim - ini > 31 * DIA) { setErro('Máximo de 31 dias por ausência.'); return; }
    setSalvando(true);
    const r = await criar(boxId, ini, fim, motivo.trim());
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setMotivo('');
    setAviso(r.afetados && r.afetados.length ? `Ausência registrada. Já havia agendamento nesse período: ${r.afetados.join(', ')}. Remarque ou cancele.` : 'Ausência registrada.');
    recarregar();
  };
  const tirar = async (id) => {
    setErro(''); setAviso('');
    const r = await remover(id);
    if (!r.ok) { setErro(r.erro); return; }
    recarregar();
  };

  return (
    <section className="ausencia-box" data-testid="ausencia-box">
      <h3>Ausência do box</h3>
      <p className="muted">Folga ou manutenção: no período o box não recebe carro novo. Carro já agendado continua marcado, e a lista aparece aqui para você remarcar.</p>
      <form className="ausencia-box-form" onSubmit={registrar} data-testid="ausencia-box-form">
        <label>Box
          <select value={boxId} onChange={(e) => setBoxId(e.target.value)} data-testid="ausencia-box-box">
            {ativos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
        </label>
        <label>De <input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value); setErro(''); }} data-testid="ausencia-box-de" /></label>
        <label>Até <input type="date" value={ate} min={de} onChange={(e) => { setAte(e.target.value); setErro(''); }} data-testid="ausencia-box-ate" /></label>
        <label>Motivo (opcional) <input value={motivo} maxLength={120} autoComplete="off" onChange={(e) => setMotivo(e.target.value)} data-testid="ausencia-box-motivo" /></label>
        {erro && <Aviso tipo="erro" data-testid="ausencia-box-erro">{erro}</Aviso>}
        {aviso && <Aviso data-testid="ausencia-box-aviso">{aviso}</Aviso>}
        <div className="acoes"><Btn variante="primario" tamanho="sm" type="submit" disabled={salvando || !ativos.length} data-testid="ausencia-box-registrar">{salvando ? 'Registrando…' : 'Registrar ausência'}</Btn></div>
      </form>
      <ul className="ausencia-box-lista" data-testid="ausencia-box-lista">
        {lista.map((a) => (
          <li key={a.id} data-testid={`ausencia-box-${a.id}`}>
            <span><strong>{a.box}</strong> · {periodoTexto(a.ini, a.fim)}{a.motivo ? ` · ${a.motivo}` : ''}</span>
            <button type="button" className="icone-btn" onClick={() => tirar(a.id)} aria-label={`Remover ausência de ${a.box}`} data-testid={`ausencia-box-remover-${a.id}`}><Icone n="trash" size={16} /></button>
          </li>
        ))}
        {!lista.length && <li className="muted" data-testid="ausencia-box-vazia">Nenhuma ausência de box agendada.</li>}
      </ul>
    </section>
  );
}
