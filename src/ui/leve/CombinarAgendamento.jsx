/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// F (V60): bloco do link do cliente (#agendar) para o serviço de DURAÇÃO INDEFINIDA, o mesmo no site real e na demonstração. Não há grade de horário: mostra a descrição da
// duração, os valores (um, uma lista com descrição ou um intervalo) e o botão "Combinar agendamento", um link wa.me comum (target _blank) que abre no clique, sem await antes.
// Nunca use whatsapp:// (v63). `combinar.whatsapp` já é o destino final (quem combina, senão o do estabelecimento; vazio abre o WhatsApp sem contato).
// Só apresentação, sem estado. Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React from 'react';
import { mensagemDeCombinar, textoDoPreco } from '../../domain/blocos.js';
import { fmtMoney } from '../../domain/time.js';
import { Icone } from './mini.jsx';

/** Serviço da página pública que se combina (tem `combinar`). */
export const ehParaCombinar = (s) => !!s && !!s.combinar;

export default function CombinarAgendamento({ servicos, nomeCliente = '', aviso = '' }) {
  if (!servicos || !servicos.length) return null;
  return (
    <section className="pub-combinar" data-testid="pub-combinar" aria-label="Combinar agendamento">
      {aviso && <p className="muted" data-testid="pub-combinar-aviso">{aviso}</p>}
      {servicos.map((s) => {
        const c = s.combinar;
        const zap = c.whatsapp || '';
        const msg = encodeURIComponent(mensagemDeCombinar(s.nome, c.mensagem, nomeCliente));
        const preco = textoDoPreco({ preco: s.preco, precoModo: c.precoModo, precoMax: c.precoMax, precoOpcoes: c.opcoes }, fmtMoney);
        return (
          <div className="pub-combinar-item" key={s.id} data-testid={`pub-combinar-${s.id}`}>
            <b>{s.nome}</b>
            <span className="muted" data-testid={`pub-combinar-duracao-${s.id}`}>{c.duracaoTexto || 'Duração a combinar'}</span>
            {c.precoModo === 'lista' && c.opcoes.length > 0
              ? <ul className="pub-combinar-valores" data-testid={`pub-combinar-valores-${s.id}`}>{c.opcoes.map((o, i) => <li key={i}><span>{o.descricao}</span><b>{fmtMoney(o.valor)}</b></li>)}</ul>
              : <span className="pub-combinar-preco" data-testid={`pub-combinar-preco-${s.id}`}>{preco}</span>}
            <a className="btn btn-primario" href={`https://wa.me/${zap}?text=${msg}`} target="_blank" rel="noopener noreferrer" data-testid={`pub-combinar-btn-${s.id}`}><Icone n="phone" size={16} /> Combinar agendamento</a>
          </div>
        );
      })}
    </section>
  );
}
