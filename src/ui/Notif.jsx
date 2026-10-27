/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:b0f6eb6119 */
import React from 'react';
import { PIX_CANCELAMENTO_PADRAO } from '../domain/rules.js';
import { Btn, Campo, Icon } from './common.jsx';

// Cancelamento do Pix pendente, configurado junto dos avisos.
export function EditorPixCancelamento({ valor, onChange, temAvisos }) {
  const c = { ...PIX_CANCELAMENTO_PADRAO, ...(valor || {}) };
  const set = (p) => onChange({ ...c, ...p });
  return (
    <fieldset className="conj pix-canc" data-testid="pix-cancelamento">
      <legend>Cancelamento do Pix pendente</legend>
      <p className="muted">Se o cliente ainda não pagou, a cobrança Pix é cancelada neste momento (no banco, quando a API Pix está ativa) e o código deixa de valer. O Pix já pago não é afetado: ele só volta ao cliente se o agendamento for cancelado.</p>
      <div className="notif">
        <select value={c.modo} onChange={(e) => set({ modo: e.target.value })} aria-label="Quando cancelar o Pix pendente" data-testid="pixc-modo">
          <option value="ultimo_aviso">Até o último aviso (padrão)</option>
          <option value="dias">Dias antes, às…</option>
          <option value="horas">Horas antes</option>
          <option value="nunca">Não cancelar (só expira pela validade)</option>
        </select>
        {c.modo === 'dias' && <span className="notif-quando"><input type="number" min="0" max="30" value={c.dias} onChange={(e) => set({ dias: Math.max(0, Number(e.target.value)) })} aria-label="Dias antes" /><span className="muted">{c.dias === 1 ? 'dia antes às' : 'dias antes às'}</span><input type="time" value={c.hora} onChange={(e) => set({ hora: e.target.value })} aria-label="Horário do cancelamento" /></span>}
        {c.modo === 'horas' && <span className="notif-quando"><input type="time" value={c.horas} onChange={(e) => set({ horas: e.target.value })} aria-label="Horas antes do cancelamento (hh:mm)" /><span className="muted">(h:min) antes</span></span>}
      </div>
      {c.modo === 'ultimo_aviso' && <p className="muted">{temAvisos ? 'Cancela no horário do último aviso da lista acima.' : 'Sem avisos na lista, nada é cancelado automaticamente: o Pix só expira pela validade.'}</p>}
    </fieldset>
  );
}

// Editor da lista de notificações (até 10). A primeira é sempre a pergunta de confirmação.
export function EditorNotificacoes({ lista, onChange, max = 10 }) {
  const set = (i, patch) => onChange(lista.map((n, k) => (k === i ? { ...n, ...patch } : n)));
  const add = () => onChange([...lista, { id: `n${Date.now()}${lista.length}`, modo: 'horas', horas: '02:00', tipo: 'aviso' }]);
  return (
    <div className="notifs">
      {lista.length === 0 && <p className="muted">Nenhuma notificação. Sem notificações, o agendamento feito pelo cliente já nasce confirmado.</p>}
      <ol className="notifs-lista">
        {lista.map((n, i) => (
          <li key={n.id || i} className="notif">
            <span className={`notif-tipo ${i === 0 ? 'pergunta' : ''}`}>
              {i === 0 ? 'Pergunta de confirmação' : (
                <select value={n.tipo || 'aviso'} onChange={(e) => set(i, { tipo: e.target.value })} aria-label={`Tipo da notificação ${i + 1}`}>
                  <option value="aviso">Aviso (sem pergunta)</option>
                  <option value="pergunta">Pergunta de confirmação</option>
                </select>
              )}
            </span>
            <select value={n.modo} onChange={(e) => set(i, e.target.value === 'dias' ? { modo: 'dias', dias: 1, hora: '17:00' } : { modo: 'horas', horas: '02:00' })} aria-label={`Quando enviar ${i + 1}`}>
              <option value="dias">Dias antes, às…</option>
              <option value="horas">Horas antes</option>
            </select>
            {n.modo === 'dias' ? (
              <span className="notif-quando">
                <input type="number" min="0" max="30" value={n.dias} onChange={(e) => set(i, { dias: Math.max(0, Number(e.target.value)) })} aria-label="Dias antes" />
                <span className="muted">{n.dias === 1 ? 'dia antes às' : 'dias antes às'}</span>
                <input type="time" value={n.hora} onChange={(e) => set(i, { hora: e.target.value })} aria-label="Horário do envio" />
              </span>
            ) : (
              <span className="notif-quando">
                <input type="time" value={n.horas} onChange={(e) => set(i, { horas: e.target.value })} aria-label="Horas antes (hh:mm)" />
                <span className="muted">(h:min) antes</span>
              </span>
            )}
            <button type="button" className="icone-btn" onClick={() => onChange(lista.filter((_, k) => k !== i))} aria-label={`Remover notificação ${i + 1}`}><Icon n="trash" size={16} /></button>
          </li>
        ))}
      </ol>
      <div className="notifs-rodape">
        <Btn tamanho="sm" icone="plus" onClick={add} disabled={lista.length >= max}>Adicionar notificação</Btn>
        <span className="muted">{lista.length} de {max}</span>
      </div>
      <p className="muted dica">Só agendamentos "a confirmar" recebem notificações, e elas param quando o cliente confirma. A primeira é a pergunta; as demais são avisos. As perguntas só saem em horário comercial.</p>
    </div>
  );
}
