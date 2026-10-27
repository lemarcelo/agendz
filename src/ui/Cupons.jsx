/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:265fc10799 */
import React, { useState } from 'react';
import { cupons as apiCup } from '../services/api.js';
import { ROTULO_SITUACAO, TIPOS_CUPOM, ehHistorico, situacaoDoCupom, usosDoCupom } from '../domain/cupons.js';
import { fmtDate, fmtMoney, ymd } from '../domain/time.js';
import { Aviso, Btn, Campo, Icon, Modal, Vazio } from './common.jsx';
import { toast, useStore } from './hooks.js';
import { rot, voc } from '../domain/tipos.js';

const descricao = (c, st) => {
  const nomes = (c.servicoIds || []).map((id) => st.servicos.find((s) => s.id === id)?.nome).filter(Boolean).join(', ');
  if (c.tipo === 'servico') return `Vale: ${nomes} de graça`;
  const quanto = c.tipo === 'percentual' ? `${c.percentual}% de desconto` : `${fmtMoney(c.valor)} de desconto`;
  return nomes ? `${quanto} em ${nomes}` : `${quanto} nos serviços`;
};
export const mensagemDoCupom = (c) => `🎟️ ${c.nome}\nSua chave: ${c.chave}\nPara usar: no WhatsApp da ${rot('loja')}, abra seu horário e toque em "Tenho um cupom" (ou fale a chave na hora de agendar). Vale de ${fmtDate(c.inicio)} até ${fmtDate(c.fim)}.`;

async function copiar(texto, aviso) {
  try { await navigator.clipboard.writeText(texto); toast(aviso); } catch { toast('Não consegui copiar sozinho: selecione o texto e copie.', 'erro'); }
}

// Estabelecimento > Cupons: vales (lavagem, polimento, qualquer serviço) e descontos, com chave secreta, vigência e limite de uso.
export function Cupons() {
  const { state: st, agora } = useStore();
  const [edit, setEdit] = useState(null);
  const [vistas, setVistas] = useState({});
  const todos = [...(st.cupons || [])].sort((a, b) => b.criadoEm - a.criadoEm).map((c) => ({ c, sit: situacaoDoCupom(st, c, agora) }));
  const valendo = todos.filter((x) => !ehHistorico(x.sit));
  const historico = todos.filter((x) => ehHistorico(x.sit));
  const novo = (modelo) => setEdit({ nome: '', tipo: 'servico', servicoIds: [], percentual: 10, valor: 10, inicio: ymd(agora), fim: ymd(agora + 30 * 86400000), usosMax: 50, usosPorCliente: 1, ...(modelo || {}) });
  const cartao = ({ c, sit }) => {
    const usos = usosDoCupom(st, c).length;
    const ver = !!vistas[c.id];
    const hist = ehHistorico(sit);
    return (
      <article key={c.id} className={`card-serv ${hist ? 'inativo' : ''}`} data-testid={`cupom-${c.id}`}>
        <div className="card-serv-topo"><div><h3>{c.nome}</h3><span className="muted">{descricao(c, st)}</span></div><span className={`chip ${sit === 'vigente' ? 'chip-ok' : 'chip-p'}`} data-testid={`cupom-situacao-${c.id}`}>{sit === 'futuro' ? `Começa em ${fmtDate(c.inicio)}` : ROTULO_SITUACAO[sit]}</span></div>
        <ul className="meta">
          <li><Icon n="calendar" size={14} /> Vigência: {fmtDate(c.inicio)} a {fmtDate(c.fim)}</li>
          <li><Icon n="users" size={14} /> {usos} de {c.usosMax} usos · {c.usosPorCliente} por cliente</li>
          {!hist && <li><Icon n="key" size={14} /> <code className="chave" data-testid={`cupom-chave-${c.id}`}>{ver ? c.chave : `${c.chave.slice(0, 4)}-••••-••••`}</code></li>}
        </ul>
        <div className="acoes">
          {!hist && <Btn tamanho="sm" onClick={() => setVistas({ ...vistas, [c.id]: !ver })} data-testid={`cupom-ver-${c.id}`}>{ver ? 'Ocultar chave' : 'Ver chave'}</Btn>}
          {!hist && <Btn tamanho="sm" icone="copy" onClick={() => copiar(mensagemDoCupom(c), 'Mensagem com a chave copiada.')} data-testid={`cupom-copiar-${c.id}`}>Copiar mensagem</Btn>}
          {!hist && <Btn tamanho="sm" icone="edit" onClick={() => setEdit({ ...c, inicio: ymd(c.inicio), fim: ymd(c.fim) })} data-testid={`cupom-editar-${c.id}`}>Editar</Btn>}
          {!hist && <Btn tamanho="sm" onClick={() => { const r = apiCup.novaChave(c.id); if (r.ok) toast('Nova chave gerada. A antiga não vale mais.'); else toast(r.erros[0], 'erro'); }} data-testid={`cupom-nova-chave-${c.id}`}>Gerar nova chave</Btn>}
          {hist && <Btn tamanho="sm" icone="copy" onClick={() => novo({ nome: c.nome, tipo: c.tipo, servicoIds: c.servicoIds, percentual: c.percentual ?? 10, valor: c.valor ?? 10, usosMax: c.usosMax, usosPorCliente: c.usosPorCliente })} data-testid={`cupom-modelo-${c.id}`}>Usar como modelo</Btn>}
          {!hist && <Btn tamanho="sm" variante="perigo" icone="trash" onClick={() => { const r = apiCup.remover(c.id); if (r.ok) toast(r.desativado ? 'Cupom já usado: foi encerrado e foi para o histórico.' : 'Cupom removido.'); else toast(r.erros[0], 'erro'); }} data-testid={`cupom-remover-${c.id}`}>Encerrar</Btn>}
        </div>
      </article>
    );
  };
  return (
    <div className="painel" data-testid="aba-cupons">
      <div className="tela-topo">
        <h3>Cupons e vales</h3>
        <Btn variante="primario" icone="plus" onClick={() => novo()} data-testid="novo-cupom">Novo cupom</Btn>
      </div>
      <p className="muted">Cada cupom tem uma <b>chave secreta</b> que você compartilha com quem quiser (a pessoa informa a chave no WhatsApp ou na hora do atendimento). Vale serviço sai de graça; desconto abate dos serviços. O cupom só vale <b>dentro das datas</b> e até o limite de usos; ao fim da vigência ele <b>fica inativo sozinho</b> e vai para o histórico. Chave errada várias vezes bloqueia o número por 15 minutos.</p>
      {!valendo.length && <Vazio titulo="Nenhum cupom valendo" texto={`Crie ${voc('exemploVales')} ou um desconto para um evento.`} />}
      <div className="grade-cards" data-testid="cupons-valendo">{valendo.map(cartao)}</div>
      <details className="historico-cupons" data-testid="cupons-historico">
        <summary><b>Histórico de cupons criados</b> <span className="chip chip-p">{historico.length}</span></summary>
        {!historico.length ? <p className="muted">Os cupons vencidos ou encerrados aparecem aqui.</p> : <div className="grade-cards">{historico.map(cartao)}</div>}
      </details>
      {edit && <FormCupom c={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function FormCupom({ c, onClose }) {
  const { state: st } = useStore();
  const [f, setF] = useState(c);
  const [erro, setErro] = useState('');
  const salvar = () => {
    const r = apiCup.salvar({ ...f, servicoIds: f.servicoIds || [] });
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast(f.id ? 'Cupom salvo.' : 'Cupom criado. A chave está no cartão.');
    onClose();
  };
  const alterna = (id, on) => setF({ ...f, servicoIds: on ? [...(f.servicoIds || []), id] : (f.servicoIds || []).filter((x) => x !== id) });
  const ativos = st.servicos.filter((s) => s.ativo !== false);
  return (
    <Modal titulo={f.id ? 'Editar cupom' : 'Novo cupom'} onClose={onClose} largura={640}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-cupom">Salvar</Btn></>}>
      <div className="form-grade">
        <Campo rotulo="Nome do cupom" className="campo-largo"><input value={f.nome} maxLength={60} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder={`Ex.: ${voc('exemploValeNome')}`} data-testid="cupom-nome" /></Campo>
        <Campo rotulo="Tipo" className="campo-largo">
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} data-testid="cupom-tipo">
            {Object.entries(TIPOS_CUPOM).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </Campo>
        {f.tipo === 'percentual' && <Campo rotulo="Desconto (%)"><input type="number" min="1" max="100" value={f.percentual ?? ''} onChange={(e) => setF({ ...f, percentual: e.target.value })} data-testid="cupom-percentual" /></Campo>}
        {f.tipo === 'valor' && <Campo rotulo="Desconto (R$)"><input type="number" min="0.01" step="0.5" value={f.valor ?? ''} onChange={(e) => setF({ ...f, valor: e.target.value })} data-testid="cupom-valor" /></Campo>}
        <fieldset className="campo-largo conj"><legend>{f.tipo === 'servico' ? 'Serviços que o vale cobre (de graça: um por vez)' : 'Vale só para estes serviços (vazio = todos)'}</legend>
          <div className="servicos-lista">{ativos.map((s) => (
            <label key={s.id} className={`servico-op ${(f.servicoIds || []).includes(s.id) ? 'on' : ''}`}><input type="checkbox" checked={(f.servicoIds || []).includes(s.id)} onChange={(e) => alterna(s.id, e.target.checked)} data-testid={`cupom-srv-${s.id}`} /><span><b>{s.nome}</b></span></label>
          ))}</div>
        </fieldset>
        <Campo rotulo="Vale a partir de"><input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} data-testid="cupom-inicio" /></Campo>
        <Campo rotulo="Vale até (inclusive)"><input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} data-testid="cupom-fim" /></Campo>
        <Campo rotulo="Usos no total"><input type="number" min="1" max="10000" value={f.usosMax} onChange={(e) => setF({ ...f, usosMax: e.target.value })} data-testid="cupom-usos" /></Campo>
        <Campo rotulo="Usos por cliente"><input type="number" min="1" max="100" value={f.usosPorCliente} onChange={(e) => setF({ ...f, usosPorCliente: e.target.value })} data-testid="cupom-por-cliente" /></Campo>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}
