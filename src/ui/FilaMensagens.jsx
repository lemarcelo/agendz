/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Mensagens em lote por WhatsApp (tela Mensagens, seção Avaliações): quem concluiu serviço num período, por profissional e serviço.
// Sem a API da Meta NÃO existe envio automático: a tela é uma fila e cada contato abre o wa.me com a mensagem pronta (um clique por pessoa).
// Telefone inteiro nunca aparece na lista (mascarado); o número só sai no clique de "Abrir no WhatsApp".
import React, { useMemo, useState } from 'react';
import { mensagens as api } from '../services/api.js';
import { FILA_MAX, MODELO_AVALIACAO_PADRAO, MODELO_AVISO_PADRAO, MODELO_MAX, aplicarModelo } from '../domain/avaliacoes.js';
import { Rot } from '../domain/tipos.js';
import { fmtDate } from '../domain/time.js';
import { Aviso, Btn, Campo } from './common.jsx';
import { linkDaAvaliacao } from './avaliacao-link.js';
import { toast, useStore } from './hooks.js';
import { abrirWhatsapp } from './whatsapp.js';

const ROTULO_STATUS = { pendente: 'Falta enviar', aberto: 'Aberto no WhatsApp', enviado: 'Enviado', pulou: 'Pulado' };

function Aviso_Meta() {
  return (
    <Aviso icone="info"><span data-testid="fila-aviso-meta"><b>Como funciona:</b> sem a API oficial do WhatsApp (Meta) não existe envio automático. Cada contato abre uma conversa já escrita e <b>você toca em enviar</b>: um clique por pessoa. Pode pausar quando quiser e continuar depois.</span></Aviso>
  );
}

export default function FilaMensagens({ user }) {
  const { state: st, loja: lojaSlug } = useStore();
  const atual = useMemo(() => api.filaAtual(), [st]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!atual.ok) return <Aviso tipo="erro">{atual.erros?.[0] || 'Sem acesso.'}</Aviso>;
  return (
    <div className="fila" data-testid="fila-lote">
      <Aviso_Meta />
      {atual.fila ? <FilaAberta fila={atual.fila} lojaSlug={lojaSlug} /> : <NovaFila st={st} />}
    </div>
  );
}

function NovaFila({ st }) {
  const [f, setF] = useState({ tipo: 'avaliacao', de: '', ate: '', profissionalId: '', servicoId: '', modelo: MODELO_AVALIACAO_PADRAO });
  const [erro, setErro] = useState('');
  const filtros = { tipo: f.tipo, de: f.de, ate: f.ate, profissionalId: f.profissionalId, servicoId: f.servicoId };
  const pre = useMemo(() => (f.de && f.ate ? api.fila(filtros) : null), [st, f.tipo, f.de, f.ate, f.profissionalId, f.servicoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudarTipo = (tipo) => setF({ ...f, tipo, modelo: tipo === 'avaliacao' ? MODELO_AVALIACAO_PADRAO : MODELO_AVISO_PADRAO });
  const criar = () => {
    const r = api.iniciarFila({ ...filtros, modelo: f.modelo });
    if (!r.ok) { setErro(r.erros[0]); return; }
    setErro(''); toast('Fila criada. Toque em "Abrir no WhatsApp" em cada contato.');
  };
  const c = pre && pre.ok ? pre.contagem : null;
  return (
    <div className="painel" data-testid="fila-nova">
      <h3>Nova fila</h3>
      <div className="linha-campos">
        <Campo rotulo="Mensagem"><select value={f.tipo} onChange={(e) => mudarTipo(e.target.value)} data-testid="fila-tipo"><option value="avaliacao">Pedido de avaliação</option><option value="aviso">Aviso geral</option></select></Campo>
        <Campo rotulo="Atendimentos de"><input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} data-testid="fila-de" /></Campo>
        <Campo rotulo="até"><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} data-testid="fila-ate" /></Campo>
        <Campo rotulo={Rot('profissional')}><select value={f.profissionalId} onChange={(e) => setF({ ...f, profissionalId: e.target.value })} data-testid="fila-prof"><option value="">Todos</option>{st.usuarios.filter((u) => u.atende).map((u) => <option key={u.id} value={u.id}>{u.apelido || u.nome}</option>)}</select></Campo>
        <Campo rotulo="Serviço"><select value={f.servicoId} onChange={(e) => setF({ ...f, servicoId: e.target.value })} data-testid="fila-servico"><option value="">Todos</option>{st.servicos.filter((s) => !s.combo).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
      </div>
      <Campo rotulo="Texto da mensagem" dica={f.tipo === 'avaliacao' ? 'Use {nome}, {loja} e {link} (o link é obrigatório e é único de cada pessoa).' : 'Use {nome} e {loja}.'}>
        <textarea rows={3} maxLength={MODELO_MAX} value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} data-testid="fila-modelo" />
      </Campo>
      <p className="muted" data-testid="fila-exemplo">Exemplo: {aplicarModelo(f.modelo, { nome: 'Maria Souza', loja: st.estabelecimento.nome, link: '[link da avaliação]' })}</p>
      {!f.de || !f.ate ? <p className="muted" data-testid="fila-sem-periodo">Escolha o período dos atendimentos concluídos (até 366 dias).</p> : null}
      {pre && !pre.ok && <Aviso tipo="erro">{pre.erros[0]}</Aviso>}
      {c && (
        <div data-testid="fila-previa">
          <p><b data-testid="fila-total">{pre.itens.length}</b> {pre.itens.length === 1 ? 'contato na fila' : 'contatos na fila'} · <span className="muted">{c.atendimentos} {c.atendimentos === 1 ? 'atendimento concluído' : 'atendimentos concluídos'} no período</span></p>
          <ul className="fila-fora">
            {c.semTelefone > 0 && <li data-testid="fila-sem-telefone">{c.semTelefone} sem telefone válido: ficam de fora.</li>}
            {c.semCadastro > 0 && <li data-testid="fila-sem-cadastro">{c.semCadastro} atendimento{c.semCadastro > 1 ? 's' : ''} sem cadastro de cliente: ficam de fora.</li>}
            {c.semMensagens > 0 && <li data-testid="fila-optout">{c.semMensagens} {c.semMensagens > 1 ? 'pediram para não receber mensagens: ficam' : 'pediu para não receber mensagens: fica'} de fora.</li>}
            {c.duplicados > 0 && <li data-testid="fila-duplicados">{c.duplicados} repetido{c.duplicados > 1 ? 's' : ''} (mesma pessoa): recebe só uma mensagem.</li>}
            {c.jaAvaliou > 0 && <li data-testid="fila-ja-avaliou">{c.jaAvaliou} {c.jaAvaliou > 1 ? 'já avaliaram: ficam' : 'já avaliou: fica'} de fora.</li>}
            {c.excedente > 0 && <li data-testid="fila-excedente">Limite de {FILA_MAX} por fila: {c.excedente} ficam para a próxima fila.</li>}
          </ul>
          {pre.itens.length > 0 && (
            <ul className="fila-previa-lista" data-testid="fila-previa-lista">
              {pre.itens.slice(0, 8).map((i) => <li key={i.agendamentoId}><b>{i.nome}</b> <span className="muted">{i.telefoneMascarado} · {i.servicos.join(' + ')} · {fmtDate(i.inicio)}</span></li>)}
              {pre.itens.length > 8 && <li className="muted">e mais {pre.itens.length - 8}…</li>}
            </ul>
          )}
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="acoes"><Btn variante="primario" icone="send" onClick={criar} disabled={!c || !pre.itens.length} data-testid="fila-criar">Criar fila</Btn></div>
    </div>
  );
}

function FilaAberta({ fila, lojaSlug }) {
  const tratados = fila.itens.filter((i) => i.status === 'enviado' || i.status === 'pulou').length;
  const atual = fila.itens.find((i) => i.status === 'pendente' || i.status === 'aberto') || null;
  const enviados = fila.itens.filter((i) => i.status === 'enviado').length;
  // Chamado direto do clique (sem await antes): o navegador só deixa abrir a aba nova nesse momento.
  const abrir = (item) => {
    const r = api.abrirItem(fila.id, item.id);
    if (!r.ok) { toast(r.erros?.[0] || 'Não foi possível abrir.', 'erro'); return; }
    const link = r.token ? linkDaAvaliacao(r.token, lojaSlug) : '';
    const abriu = abrirWhatsapp(aplicarModelo(r.modelo, { nome: r.nome, loja: r.loja, link }), r.telefone);
    if (!abriu) toast('Não consegui abrir o WhatsApp.', 'erro');
  };
  const marcar = (item, status) => { const r = api.marcarItem(fila.id, item.id, status); if (!r.ok) toast(r.erros?.[0] || 'Não foi possível marcar.', 'erro'); };
  const encerrar = () => { api.encerrarFila(fila.id); toast('Fila encerrada.'); };
  return (
    <div className="painel" data-testid="fila-atual">
      <div className="tela-topo">
        <h3>{fila.tipo === 'avaliacao' ? 'Fila: pedido de avaliação' : 'Fila: aviso geral'}</h3>
        <span className="chip" data-testid="fila-progresso">{tratados} de {fila.itens.length} tratados</span>
      </div>
      <p className="muted">Atendimentos de {fila.filtros.de ? fmtDate(new Date(`${fila.filtros.de}T00:00`).getTime()) : '—'} a {fila.filtros.ate ? fmtDate(new Date(`${fila.filtros.ate}T00:00`).getTime()) : '—'} · {enviados} {enviados === 1 ? 'enviado' : 'enviados'}</p>
      {atual ? (
        <div className="fila-vez" data-testid="fila-vez">
          <b data-testid="fila-vez-nome">{atual.nome}</b>
          <span className="muted">{atual.telefoneMascarado} · {atual.servicos.join(' + ')}</span>
          <div className="acoes">
            <Btn variante="primario" icone="msg" onClick={() => abrir(atual)} data-testid="fila-proximo">{atual.status === 'aberto' ? 'Abrir de novo' : 'Próximo: abrir no WhatsApp'}</Btn>
            {atual.status === 'aberto' && <Btn icone="check" onClick={() => marcar(atual, 'enviado')} data-testid="fila-enviado">Enviei</Btn>}
            <Btn onClick={() => marcar(atual, 'pulou')} data-testid="fila-pular">Pular</Btn>
          </div>
        </div>
      ) : <Aviso icone="check"><span data-testid="fila-fim">Fila concluída: {enviados} {enviados === 1 ? 'mensagem enviada' : 'mensagens enviadas'}. Encerre para criar outra.</span></Aviso>}
      <ul className="fila-itens" data-testid="fila-itens">
        {fila.itens.map((i) => <li key={i.id} data-testid={`fila-item-${i.id}`} data-status={i.status} className={i === atual ? 'vez' : ''}><span>{i.nome} <small className="muted">{i.telefoneMascarado}</small></span><span className={`chip chip-p fila-st-${i.status}`}>{ROTULO_STATUS[i.status]}</span></li>)}
      </ul>
      <div className="acoes"><Btn variante="perigo" onClick={encerrar} data-testid="fila-encerrar">Encerrar fila</Btn></div>
      <p className="muted"><small>Fechar esta tela não perde nada: a fila continua de onde parou.</small></p>
    </div>
  );
}
