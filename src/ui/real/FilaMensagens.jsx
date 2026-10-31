/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Mensagens em lote por WhatsApp do site real (aba dentro de Avaliações): quem concluiu serviço num período, por profissional e serviço.
// Sem a API da Meta NÃO existe envio automático: a tela é uma fila e cada contato abre o wa.me com a mensagem pronta (um clique por pessoa).
// O telefone inteiro nunca aparece na tela (só mascarado); o número vem do servidor no clique de "Preparar" e só é usado no "Abrir no WhatsApp".
// Como a chamada ao servidor é assíncrona e o navegador só abre a aba nova direto de um clique, são dois toques: Preparar (chama a API) e Abrir no WhatsApp (sem await).
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS próprias terminam em `-real`.
import React, { useEffect, useRef, useState } from 'react';
import { mensagens as api } from '../../services/api-real.js';
import { FILA_MAX, MODELO_AVALIACAO_PADRAO, MODELO_AVISO_PADRAO, MODELO_MAX, aplicarModelo } from '../../domain/avaliacoes.js';
import { montarLinkAvaliar } from '../../domain/link-publico.js';
import { Rot } from '../../domain/tipos.js';
import { fmtDate } from '../../domain/time.js';
import { abrirWhatsapp } from '../whatsapp.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const ROTULO_STATUS = { pendente: 'Falta enviar', aberto: 'Em andamento', enviado: 'Enviado', pulou: 'Pulado' };
const dataDoDia = (d) => (d ? fmtDate(new Date(`${d}T00:00`).getTime()) : '—');
const linkDe = (token) => montarLinkAvaliar({ base: `${globalThis.location.origin}${globalThis.location.pathname}`, token });

function AvisoMeta() {
  return (
    <Aviso><span data-testid="fila-aviso-meta"><b>Como funciona:</b> sem a API oficial do WhatsApp (Meta) não existe envio automático. Cada contato abre uma conversa já escrita e <b>você toca em enviar</b>: um clique por pessoa. Pode pausar quando quiser e continuar depois.</span></Aviso>
  );
}

export default function FilaMensagens({ profissionais, servicos }) {
  const [fila, setFila] = useState(undefined); // undefined = carregando; null = sem fila aberta
  const [falha, setFalha] = useState('');
  const carregar = () => { setFalha(''); setFila(undefined); api.filaAtual().then((r) => { if (r.ok) setFila(r.fila); else setFalha(r.erro); }); };
  useEffect(carregar, []);
  return (
    <div className="fila-real" data-testid="fila-lote">
      <AvisoMeta />
      {falha && <Aviso tipo="erro"><span data-testid="fila-erro">{falha}</span> <Btn tamanho="sm" onClick={carregar} data-testid="fila-tentar-de-novo">Tentar de novo</Btn></Aviso>}
      {fila === undefined && !falha && <p className="muted" role="status" data-testid="fila-carregando">Carregando…</p>}
      {fila === null && <NovaFila profissionais={profissionais} servicos={servicos} aoCriar={setFila} />}
      {fila && <FilaAberta fila={fila} aoMudar={setFila} aoEncerrar={() => setFila(null)} />}
    </div>
  );
}

function NovaFila({ profissionais, servicos, aoCriar }) {
  const [f, setF] = useState({ tipo: 'avaliacao', de: '', ate: '', profissionalId: '', servicoId: '', modelo: MODELO_AVALIACAO_PADRAO });
  const [pre, setPre] = useState(null); // { previa } | { erro } | null
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const trava = useRef(false);
  const seq = useRef(0);
  useEffect(() => {
    setPre(null);
    if (!f.de || !f.ate) return undefined;
    const meu = ++seq.current;
    api.previa(f).then((r) => { if (meu === seq.current) setPre(r.ok ? { previa: r.previa } : { erro: r.erro }); });
    return () => { seq.current += 1; };
  }, [f.tipo, f.de, f.ate, f.profissionalId, f.servicoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudarTipo = (tipo) => setF({ ...f, tipo, modelo: tipo === 'avaliacao' ? MODELO_AVALIACAO_PADRAO : MODELO_AVISO_PADRAO });
  const criar = async () => {
    if (trava.current) return;
    trava.current = true; setCriando(true); setErro('');
    const r = await api.iniciarFila(f);
    trava.current = false; setCriando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoCriar(r.fila);
  };
  const p = pre && pre.previa ? pre.previa : null;
  const c = p ? p.contagem : null;
  return (
    <div className="painel" data-testid="fila-nova">
      <h3>Nova fila</h3>
      <div className="linha-campos">
        <Campo rotulo="Mensagem"><select value={f.tipo} onChange={(e) => mudarTipo(e.target.value)} data-testid="fila-tipo"><option value="avaliacao">Pedido de avaliação</option><option value="aviso">Aviso geral</option></select></Campo>
        <Campo rotulo="Atendimentos de"><input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} data-testid="fila-de" /></Campo>
        <Campo rotulo="até"><input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} data-testid="fila-ate" /></Campo>
        <Campo rotulo={Rot('profissional')}><select value={f.profissionalId} onChange={(e) => setF({ ...f, profissionalId: e.target.value })} data-testid="fila-prof"><option value="">Todos</option>{profissionais.map((u) => <option key={u.id} value={u.id}>{u.apelido || u.nome}</option>)}</select></Campo>
        <Campo rotulo="Serviço"><select value={f.servicoId} onChange={(e) => setF({ ...f, servicoId: e.target.value })} data-testid="fila-servico"><option value="">Todos</option>{servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
      </div>
      <Campo rotulo="Texto da mensagem" dica={f.tipo === 'avaliacao' ? 'Use {nome}, {loja} e {link} (o link é obrigatório e é único de cada pessoa).' : 'Use {nome} e {loja}.'}>
        <textarea rows={3} maxLength={MODELO_MAX} value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} data-testid="fila-modelo" />
      </Campo>
      {!f.de || !f.ate ? <p className="muted" data-testid="fila-sem-periodo">Escolha o período dos atendimentos concluídos (até 366 dias).</p> : null}
      {pre && pre.erro && <Aviso tipo="erro"><span data-testid="fila-previa-erro">{pre.erro}</span></Aviso>}
      {c && (
        <div data-testid="fila-previa">
          <p><b data-testid="fila-total">{p.itens.length}</b> {p.itens.length === 1 ? 'contato na fila' : 'contatos na fila'} · <span className="muted">{c.atendimentos} {c.atendimentos === 1 ? 'atendimento concluído' : 'atendimentos concluídos'} no período</span></p>
          <ul className="fila-fora-real">
            {c.semTelefone > 0 && <li data-testid="fila-sem-telefone">{c.semTelefone} sem telefone válido: ficam de fora.</li>}
            {c.semCadastro > 0 && <li data-testid="fila-sem-cadastro">{c.semCadastro} atendimento{c.semCadastro > 1 ? 's' : ''} sem cadastro de cliente: ficam de fora.</li>}
            {c.semMensagens > 0 && <li data-testid="fila-optout">{c.semMensagens} {c.semMensagens > 1 ? 'pediram para não receber mensagens: ficam' : 'pediu para não receber mensagens: fica'} de fora.</li>}
            {c.duplicados > 0 && <li data-testid="fila-duplicados">{c.duplicados} repetido{c.duplicados > 1 ? 's' : ''} (mesma pessoa): recebe só uma mensagem.</li>}
            {c.jaAvaliou > 0 && <li data-testid="fila-ja-avaliou">{c.jaAvaliou} {c.jaAvaliou > 1 ? 'já avaliaram: ficam' : 'já avaliou: fica'} de fora.</li>}
            {c.excedente > 0 && <li data-testid="fila-excedente">Limite de {FILA_MAX} por fila: {c.excedente} ficam para a próxima fila.</li>}
          </ul>
          {p.itens.length === 0 && <p className="muted" data-testid="fila-ninguem">Ninguém para receber a mensagem com esses filtros.</p>}
          {p.itens.length > 0 && (
            <ul className="fila-lista-real" data-testid="fila-previa-lista">
              {p.itens.slice(0, 8).map((i) => <li key={i.agendamentoId}><b>{i.nome}</b> <span className="muted">{i.telefoneMascarado} · {i.servicos.join(' + ')}{i.inicio ? ` · ${fmtDate(i.inicio)}` : ''}</span></li>)}
              {p.itens.length > 8 && <li className="muted">e mais {p.itens.length - 8}…</li>}
            </ul>
          )}
        </div>
      )}
      {erro && <Aviso tipo="erro"><span data-testid="fila-criar-erro">{erro}</span></Aviso>}
      <div className="acoes"><Btn variante="primario" onClick={criar} disabled={!p || !p.itens.length || criando} data-testid="fila-criar"><Icone n="send" size={15} />{criando ? 'Criando…' : 'Criar fila'}</Btn></div>
    </div>
  );
}

function FilaAberta({ fila, aoMudar, aoEncerrar }) {
  const [pronto, setPronto] = useState(null); // { item, texto, numero, nome }: mensagem preparada neste aparelho (o token aparece uma vez)
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const tratados = fila.itens.filter((i) => i.status === 'enviado' || i.status === 'pulou').length;
  const atual = fila.itens.find((i) => i.status === 'pendente' || i.status === 'aberto') || null;
  const enviados = fila.itens.filter((i) => i.status === 'enviado').length;
  const executar = async (fazer) => {
    if (trava.current) return;
    trava.current = true; setOcupado(true); setErro('');
    const r = await fazer();
    trava.current = false; setOcupado(false);
    if (!r.ok) setErro(r.erro);
    return r;
  };
  // Preparar: pede ao servidor o token pessoal (avaliação) e o número; o item passa a "em andamento".
  const preparar = async (item) => {
    const r = await executar(() => api.abrirItem(fila.id, item.id));
    if (!r || !r.ok) { if (r && r.status === 409) api.filaAtual().then((f) => { if (f.ok) aoMudar(f.fila); }); return; } // item que não dá mais: o servidor já o marcou "pulado"
    const a = r.aberto;
    setPronto({ item: item.id, texto: aplicarModelo(a.modelo, { nome: a.nome, loja: a.loja, link: a.token ? linkDe(a.token) : '' }), numero: a.numero });
    aoMudar({ ...fila, itens: fila.itens.map((i) => (i.id === item.id ? { ...i, status: 'aberto' } : i)) });
  };
  // Chamado direto do clique (sem await antes): o navegador só deixa abrir a aba nova nesse momento.
  const abrir = () => { if (!pronto) return; if (!abrirWhatsapp(pronto.texto, pronto.numero)) setErro('Não consegui abrir o WhatsApp.'); };
  const marcar = async (item, status) => {
    const r = await executar(() => api.marcarItem(fila.id, item.id, status));
    if (r && r.ok) { setPronto(null); aoMudar(r.fila); }
  };
  const encerrar = async () => {
    const r = await executar(() => api.encerrarFila(fila.id));
    if (r && r.ok) aoEncerrar();
  };
  const prontoDoAtual = atual && pronto && pronto.item === atual.id ? pronto : null;
  return (
    <div className="painel" data-testid="fila-atual">
      <div className="tela-topo">
        <h3>{fila.tipo === 'avaliacao' ? 'Fila: pedido de avaliação' : 'Fila: aviso geral'}</h3>
        <span className="chip" data-testid="fila-progresso">{tratados} de {fila.itens.length} tratados</span>
      </div>
      <p className="muted">Atendimentos de {dataDoDia(fila.filtros.de)} a {dataDoDia(fila.filtros.ate)} · {enviados} {enviados === 1 ? 'enviado' : 'enviados'}</p>
      {atual ? (
        <div className="fila-vez-real" data-testid="fila-vez">
          <b data-testid="fila-vez-nome">{atual.nome}</b>
          <span className="muted">{atual.telefoneMascarado} · {atual.servicos.join(' + ')}</span>
          {prontoDoAtual ? (
            <>
              <p className="muted" style={{ whiteSpace: 'pre-line' }} data-testid="fila-texto">{prontoDoAtual.texto}</p>
              <div className="acoes">
                <Btn variante="primario" onClick={abrir} data-testid="fila-abrir"><Icone n="msg" size={15} />Abrir no WhatsApp</Btn>
                <Btn onClick={() => marcar(atual, 'enviado')} disabled={ocupado} data-testid="fila-enviado"><Icone n="check" size={15} />Enviei</Btn>
                <Btn onClick={() => marcar(atual, 'pulou')} disabled={ocupado} data-testid="fila-pular">Pular</Btn>
              </div>
            </>
          ) : (
            <div className="acoes">
              <Btn variante="primario" onClick={() => preparar(atual)} disabled={ocupado} data-testid="fila-preparar">{atual.status === 'aberto' ? 'Preparar de novo' : 'Próximo: preparar mensagem'}</Btn>
              <Btn onClick={() => marcar(atual, 'pulou')} disabled={ocupado} data-testid="fila-pular">Pular</Btn>
            </div>
          )}
        </div>
      ) : <Aviso><span data-testid="fila-fim">Fila concluída: {enviados} {enviados === 1 ? 'mensagem enviada' : 'mensagens enviadas'}. Encerre para criar outra.</span></Aviso>}
      {erro && <Aviso tipo="erro"><span data-testid="fila-erro-acao">{erro}</span></Aviso>}
      <ul className="fila-lista-real" data-testid="fila-itens">
        {fila.itens.map((i) => <li key={i.id} data-testid={`fila-item-${i.id}`} data-status={i.status} className={atual && i.id === atual.id ? 'vez' : ''}><span>{i.nome} <small className="muted">{i.telefoneMascarado}</small></span><span className={`chip chip-p fila-st-real-${i.status}`}>{ROTULO_STATUS[i.status]}</span></li>)}
      </ul>
      <div className="acoes"><Btn variante="perigo" onClick={encerrar} disabled={ocupado} data-testid="fila-encerrar">Encerrar fila</Btn></div>
      <p className="muted"><small>Fechar esta tela não perde nada: a fila continua de onde parou.</small></p>
    </div>
  );
}
