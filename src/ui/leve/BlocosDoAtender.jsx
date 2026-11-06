/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F (V60): tela "Dia e horário" do Atender para serviço de DURAÇÃO INDEFINIDA, a mesma no site real e na demonstração. Em vez de um horário só, a pessoa marca quantos
// horários de 30 min quiser (em um ou mais dias); os vizinhos viram um bloco só (`blocosDeHorarios`). Um X no horário marcado desmarca. Mostra a soma em minutos, avisa se
// ela não atende o mínimo dos serviços de duração fixa (mistura) e pede o valor final de cada serviço indefinido (atalhos da lista de valores ou da faixa).
// Só apresentação: quem usa guarda `dia`, `horarios` (início de cada horário marcado, em ms) e `valores` e faz o envio. Não importa `api.js`, `hooks.js` nem `common.jsx`.
import React from 'react';
import { PASSO_BLOCO_MIN, blocosDeHorarios, horarioDoDia, minutosDosBlocos } from '../../domain/blocos.js';
import { fmtMoney } from '../../domain/time.js';
import { Btn, Campo, Icone } from './mini.jsx';

const p2 = (n) => String(n).padStart(2, '0');
const hm = (ts) => { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const diaCurto = (ts) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(ts)).replace('.', '').replace(',', '');
const somaDia = (iso, n) => { const [a, m, d] = iso.split('-').map(Number); const t = new Date(a, m - 1, d + n); return `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}`; };
const fmtMin = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`);

export default function BlocosDoAtender({ dia, aoMudarDia, horarios, aoMudar, fixosMin = 0, indefinidos, valores, aoMudarValores, inicioHora = 6, fimHora = 22 }) {
  const marcados = new Set(horarios);
  const slots = [];
  for (let m = inicioHora * 60; m < fimHora * 60; m += PASSO_BLOCO_MIN) slots.push(horarioDoDia(dia, m));
  const alternar = (ts) => aoMudar(marcados.has(ts) ? horarios.filter((x) => x !== ts) : [...horarios, ts].sort((a, b) => a - b));
  const blocos = blocosDeHorarios(horarios);
  const total = minutosDosBlocos(blocos);
  const curto = fixosMin > 0 && total > 0 && total < fixosMin;
  const valor = (id) => (valores && valores[id]) || '';
  const mudarValor = (id, v) => aoMudarValores({ ...(valores || {}), [id]: v });
  return (
    <div className="blocos-atender" data-testid="atender-blocos">
      <p className="muted">{indefinidos.map((s) => s.nome).join(', ')}: {indefinidos.length === 1 ? 'não tem' : 'não têm'} duração fixa. Toque nos horários que serão trabalhados (de 30 em 30 min); toque de novo no X para desmarcar.</p>
      <div className="blocos-dia">
        <Btn tamanho="sm" onClick={() => aoMudarDia(somaDia(dia, -1))} aria-label="Dia anterior" data-testid="atender-bloco-dia-ant"><Icone n="left" size={15} /></Btn>
        <Campo rotulo="Dia"><input type="date" value={dia} onChange={(e) => { if (e.target.value) aoMudarDia(e.target.value); }} data-testid="atender-bloco-dia" /></Campo>
        <Btn tamanho="sm" onClick={() => aoMudarDia(somaDia(dia, 1))} aria-label="Próximo dia" data-testid="atender-bloco-dia-prox"><Icone n="right" size={15} /></Btn>
      </div>
      <ul className="blocos-grade" data-testid="atender-bloco-grade" aria-label="Horários do dia">
        {slots.map((ts) => {
          const on = marcados.has(ts);
          return (
            <li key={ts}>
              <button type="button" className={`bloco-h${on ? ' on' : ''}`} aria-pressed={on} aria-label={on ? `Desmarcar ${hm(ts)}` : `Marcar ${hm(ts)}`} onClick={() => alternar(ts)} data-testid={`atender-bloco-h-${hm(ts).replace(':', '')}`}>
                <span>{hm(ts)}</span>{on && <span className="bloco-x" aria-hidden="true"><Icone n="x" size={13} /></span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="blocos-resumo" data-testid="atender-blocos-resumo" aria-live="polite">
        {blocos.length === 0
          ? <p className="muted" data-testid="atender-blocos-vazio">Nenhum horário marcado.</p>
          : (
            <>
              <ul className="blocos-lista">{blocos.map(([i, f]) => <li key={i} data-testid="atender-bloco-item">{diaCurto(i)} · {hm(i)}–{hm(f)} <span className="muted">({fmtMin((f - i) / 60000)})</span></li>)}</ul>
              <p data-testid="atender-blocos-total"><b>Total: {fmtMin(total)}</b>{fixosMin > 0 ? <span className="muted"> · os serviços de duração fixa precisam de ao menos {fmtMin(fixosMin)}</span> : null}</p>
            </>
          )}
        {curto && <p className="erro-txt" role="alert" data-testid="atender-blocos-curto">A soma dos horários ({fmtMin(total)}) não atende o mínimo dos serviços de duração fixa ({fmtMin(fixosMin)}).</p>}
      </div>
      <div className="blocos-valores" data-testid="atender-valores">
        {indefinidos.map((s) => (
          <div key={s.id} className="blocos-valor" data-testid={`atender-valor-bloco-${s.id}`}>
            <Campo rotulo={`Valor final de ${s.nome} (R$)`} dica={s.precoModo === 'faixa' && s.precoMax != null ? `Entre ${fmtMoney(s.preco)} e ${fmtMoney(s.precoMax)}. Em branco vale ${fmtMoney(s.preco)}.` : `Em branco vale ${fmtMoney(s.preco)}.`}>
              <input value={valor(s.id)} inputMode="decimal" onChange={(e) => mudarValor(s.id, e.target.value)} data-testid={`atender-valor-${s.id}`} />
            </Campo>
            {s.precoModo === 'lista' && (s.precoOpcoes || []).length > 0 && (
              <div className="blocos-atalhos" role="group" aria-label={`Valores de ${s.nome}`}>
                {s.precoOpcoes.map((o, i) => <Btn key={i} tamanho="sm" onClick={() => mudarValor(s.id, String(o.valor).replace('.', ','))} data-testid={`atender-valor-op-${s.id}-${i}`}>{o.descricao} · {fmtMoney(o.valor)}</Btn>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
