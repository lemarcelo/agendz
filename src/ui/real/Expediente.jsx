/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Horário de funcionamento da loja no site real (Estabelecimento): por dia da semana, de 1 a 6 horários (ex.: 09:00–12:00 e 14:00–18:00).
// Dia 0 = domingo; fuso America/Sao_Paulo (a conta é do servidor). A agenda só aceita atendimento INTEIRO dentro de uma faixa; loja sem horário cadastrado não restringe.
// A tela confere antes de enviar (domain/expediente.js), mas quem decide é o servidor. Só o proprietário altera.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useState } from 'react';
import { expediente as api } from '../../services/api-real.js';
import { DIAS_SEMANA, MAX_FAIXAS, camposDaSemana, erroDaSemana, resumoDoDia } from '../../domain/expediente.js';
import { Aviso, Btn, Icone } from '../leve/mini.jsx';

const FAIXA_NOVA = ['09:00', '18:00'];

export default function Expediente() {
  const [campos, setCampos] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [vazio, setVazio] = useState(false); // a loja ainda não tem horário cadastrado
  useEffect(() => {
    let vivo = true;
    api.obter().then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setCampos({ dias: {} }); return; }
      const c = camposDaSemana(r.escala);
      setVazio(!Object.values(c.dias).some((d) => d.aberto));
      setCampos(c);
    });
    return () => { vivo = false; };
  }, []);
  if (campos === null) return <p className="muted" role="status" data-testid="exp-carregando">Carregando…</p>;
  if (!campos.dias[0]) return <Aviso tipo="erro" data-testid="exp-erro">{erro || 'Não foi possível abrir o horário de funcionamento.'}</Aviso>;

  const mexer = (f) => { setOk(''); setErro(''); setCampos((c) => { const n = { dias: { ...c.dias } }; f(n.dias); return n; }); };
  const abrirFechar = (d, aberto) => mexer((dias) => { dias[d] = { aberto, faixas: aberto ? (dias[d].faixas.length ? dias[d].faixas : [[...FAIXA_NOVA]]) : dias[d].faixas }; });
  const trocar = (d, i, k, v) => mexer((dias) => { dias[d] = { ...dias[d], faixas: dias[d].faixas.map((f, j) => (j === i ? (k === 0 ? [v, f[1]] : [f[0], v]) : f)) }; });
  const tirar = (d, i) => mexer((dias) => { const faixas = dias[d].faixas.filter((_, j) => j !== i); dias[d] = { aberto: faixas.length > 0, faixas }; });
  const mais = (d) => mexer((dias) => { if (dias[d].faixas.length < MAX_FAIXAS) dias[d] = { ...dias[d], faixas: [...dias[d].faixas, [...FAIXA_NOVA]] }; });
  const copiar = (d) => mexer((dias) => { for (const [x] of DIAS_SEMANA) if (x !== d && dias[x].aberto) dias[x] = { aberto: true, faixas: dias[d].faixas.map((f) => [...f]) }; });

  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setErro(''); setOk('');
    const problema = erroDaSemana(campos);
    if (problema) { setErro(problema); return; }
    setEnviando(true);
    const r = await api.gravar(campos);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setCampos(camposDaSemana(r.escala)); setVazio(false);
    setOk('Horário de funcionamento salvo.');
  };

  return (
    <form onSubmit={salvar} className="exp-form-real" data-testid="exp-form">
      {vazio && <Aviso data-testid="exp-sem">A loja ainda não tem horário de funcionamento: a agenda aceita qualquer horário. Cadastre para a agenda e o link do cliente respeitarem o expediente.</Aviso>}
      <ul className="exp-lista-real">
        {DIAS_SEMANA.map(([d, nome]) => {
          const dia = campos.dias[d];
          return (
            <li key={d} className={`exp-dia-real${dia.aberto ? ' on' : ''}`} data-testid={`exp-linha-${d}`}>
              <label className="pa-check exp-nome-real"><input type="checkbox" checked={dia.aberto} onChange={(e) => abrirFechar(d, e.target.checked)} data-testid={`exp-dia-${d}`} /> <b>{nome}</b></label>
              {!dia.aberto && <span className="muted" data-testid={`exp-fechado-${d}`}>{resumoDoDia(dia)}</span>}
              {dia.aberto && (
                <div className="exp-faixas-real">
                  {dia.faixas.map((f, i) => (
                    <div key={i} className="exp-faixa-real">
                      <input type="time" value={f[0]} onChange={(e) => trocar(d, i, 0, e.target.value)} aria-label={`${nome}: abre às`} data-testid={`exp-faixa-${d}-${i}-ini`} />
                      <span aria-hidden="true">–</span>
                      <input type="time" value={f[1]} onChange={(e) => trocar(d, i, 1, e.target.value)} aria-label={`${nome}: fecha às`} data-testid={`exp-faixa-${d}-${i}-fim`} />
                      <button type="button" className="icone-btn" onClick={() => tirar(d, i)} aria-label={`Tirar este horário de ${nome}`} title="Tirar este horário" data-testid={`exp-faixa-${d}-${i}-tirar`}><Icone n="x" size={16} /></button>
                    </div>
                  ))}
                  <div className="acoes">
                    {dia.faixas.length < MAX_FAIXAS && <Btn tamanho="sm" onClick={() => mais(d)} data-testid={`exp-mais-${d}`}><Icone n="plus" size={15} /> Outro horário</Btn>}
                    <Btn tamanho="sm" onClick={() => copiar(d)} data-testid={`exp-copiar-${d}`}>Copiar para os outros dias abertos</Btn>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted">Um atendimento só cabe se terminar dentro de um destes horários. Cada profissional pode ter uma escala própria, dentro da loja.</p>
      {erro && <Aviso tipo="erro" data-testid="exp-erro">{erro}</Aviso>}
      {ok && <Aviso data-testid="exp-ok"><span role="status">{ok}</span></Aviso>}
      <div className="acoes"><Btn variante="primario" type="submit" disabled={enviando} data-testid="exp-salvar">{enviando ? 'Salvando…' : 'Salvar horário de funcionamento'}</Btn></div>
    </form>
  );
}
