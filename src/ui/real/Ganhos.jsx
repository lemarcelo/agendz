/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// "Meus ganhos" no site real (5d-4b): a pessoa vê SÓ o que ela recebe (profissional, atendente e admin). O servidor nunca manda valor cheio, parte do
// estabelecimento nem percentual; esta tela também não os pede. Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useRef, useState } from 'react';
import { comissoes as api } from '../../services/api-real.js';
import { fmtDate, fmtHM, fmtMoney } from '../../domain/time.js';
import { mesDe } from '../../domain/periodo-comissao.js';
import { Aviso } from '../leve/mini.jsx';
import Periodo from './Periodo.jsx';

const completo = (p) => !!(p.mes || (p.de && p.ate));

export default function Ganhos() {
  const [per, setPer] = useState(() => ({ mes: mesDe(Date.now()) }));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const ultima = useRef(0);
  useEffect(() => {
    if (!completo(per)) { setDados(null); return undefined; }
    const n = ++ultima.current;
    (async () => {
      const r = await api.meu(per);
      if (n !== ultima.current) return;
      if (!r.ok) { setErro(r.erro); setDados(null); return; }
      setErro(''); setDados(r);
    })();
    return () => { ultima.current += 1; };
  }, [per]);
  return (
    <section className="tela ganhos-real" data-testid="ganhos">
      <header className="tela-topo"><h1>Meus ganhos</h1></header>
      <Periodo valor={per} aoMudar={setPer} />
      {erro && <Aviso tipo="erro" data-testid="ganhos-erro">{erro}</Aviso>}
      {dados && (
        <>
          <div className="tiles">
            <div className="tile"><small>Atendimentos concluídos</small><b data-testid="meu-qtd">{dados.totais.atendimentos}</b></div>
            <div className="tile destaque"><small>A receber no período</small><b data-testid="meu-receber">{fmtMoney(dados.totais.receber)}</b></div>
            <div className="tile"><small>Já pago</small><b data-testid="meu-pago">{fmtMoney(dados.totais.jaPago)}</b></div>
            <div className="tile"><small>Falta receber</small><b data-testid="meu-falta">{fmtMoney(dados.totais.aReceber)}</b></div>
          </div>
          {dados.previsto.atendimentos > 0 && <Aviso data-testid="meu-previsto">Ainda previsto neste período: {dados.previsto.atendimentos} {dados.previsto.atendimentos === 1 ? 'agendamento' : 'agendamentos'}, somando {fmtMoney(dados.previsto.receber)}.</Aviso>}
          <h3>Atendimentos concluídos</h3>
          {dados.linhas.length === 0 && <p className="muted" data-testid="meu-vazio">Nenhum atendimento concluído neste período. O valor a receber aparece aqui quando o atendimento é concluído.</p>}
          <ul className="lista-itens" data-testid="meu-lista">
            {dados.linhas.map((l) => (
              <li key={l.agendamentoId} className="conj" data-testid={`meu-linha-${l.agendamentoId}`}>
                <div className="lista-itens-cab"><span>{fmtDate(l.inicio)} {fmtHM(l.inicio)}</span><b>{fmtMoney(l.receber)}</b></div>
                <p className="muted">{l.servicos.join(' + ')}{l.nomeAvulso ? ` · ${l.nomeAvulso}` : ''}</p>
                {l.cancelada ? <span className="chip" data-testid="meu-cancelada">Comissão cancelada: {l.motivoCancelada}</span> : l.paga ? <span className="chip" data-testid="meu-paga">Paga{l.pagaEm ? ` em ${fmtDate(l.pagaEm)}` : ''}</span> : <span className="chip" data-testid="meu-aberta">A receber</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {!dados && !erro && completo(per) && <p className="muted" role="status">Carregando…</p>}
    </section>
  );
}
