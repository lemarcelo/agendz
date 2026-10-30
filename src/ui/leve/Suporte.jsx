/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Suporte dentro do sistema da loja (A4): chamados com a equipe da plataforma. Uma tela só, usada no Artifact (adaptador simulado) e no site real
// (adaptador de api-real.js). Fala com um `adaptador` async { listar, abrir, obter, responder, imagem? } (as imagens vão em `anexos`: base64 de até 3 JPEG; `imagem(chamadoId, anexoId)` devolve { ok, url }), sempre { ok, erro, ... }. O dono vê todos os chamados da
// loja; os demais, só os que abriram (quem filtra é o servidor). Texto de pessoa entra só como texto. Atualiza sozinho a cada 15 s enquanto está aberto.
// Não importa a API simulada nem hooks.js (usada também pelo site real).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Aviso, Btn, Campo, Icone } from './mini.jsx';
import { EscolherImagens, ImagensDaMensagem } from './ImagensChamado.jsx';

const CATEGORIAS = [['duvida', 'Dúvida'], ['problema', 'Problema'], ['sugestao', 'Sugestão'], ['cobranca', 'Cobrança'], ['outro', 'Outro']];
const ROT_CATEGORIA = Object.fromEntries(CATEGORIAS);
const ROT_STATUS = { aberto: 'Aberto', em_atendimento: 'Em atendimento', aguardando_cliente: 'Aguardando sua resposta', resolvido: 'Resolvido', fechado: 'Fechado' };
const TOM_STATUS = { aberto: 'sup-st-info', em_atendimento: 'sup-st-info', aguardando_cliente: 'sup-st-alerta', resolvido: 'sup-st-ok', fechado: 'sup-st-neutro' };
const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const quando = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? '' : fmt.format(d); };
const INTERVALO_MS = 15000;

function Conversa({ id, adaptador, aoVoltar, aoMudou }) {
  const [c, setC] = useState(null);
  const [erro, setErro] = useState('');
  const [texto, setTexto] = useState('');
  const [imagens, setImagens] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const fim = useRef(null);
  const carregar = useCallback(async (fundo) => {
    const r = await adaptador.obter(id);
    if (r.ok) { setErro(''); setC((antes) => (antes && JSON.stringify(antes) === JSON.stringify(r.chamado) ? antes : r.chamado)); aoMudou && aoMudou(); }
    else if (!fundo) setErro(r.erro);
  }, [adaptador, id, aoMudou]);
  useEffect(() => { carregar(false); const t = setInterval(() => carregar(true), INTERVALO_MS); return () => clearInterval(t); }, [carregar]);
  useEffect(() => { if (fim.current && fim.current.scrollIntoView) fim.current.scrollIntoView({ block: 'nearest' }); }, [c && c.msgs && c.msgs.length]);
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando || !texto.trim()) return;
    setEnviando(true); setErro('');
    const r = await adaptador.responder(id, texto, imagens.map((x) => x.dados));
    setEnviando(false);
    if (r.ok) { setTexto(''); setImagens([]); setC(r.chamado); aoMudou && aoMudou(); } else setErro(r.erro);
  };
  if (!c) return <div className="sup-conversa">{erro ? <Aviso tipo="erro" data-testid="sup-erro">{erro}</Aviso> : <p className="muted" role="status">Carregando…</p>}<Btn onClick={aoVoltar} data-testid="sup-voltar">Voltar</Btn></div>;
  const fechado = c.status === 'fechado';
  return (
    <div className="sup-conversa" data-testid="sup-conversa">
      <div className="sup-cabeca">
        <div><h3>{c.assunto}</h3><p className="muted sup-sub">{ROT_CATEGORIA[c.categoria] || c.categoria} · aberto por {c.usuarioNome} em {quando(c.criadoEm)}</p></div>
        <span className={`sup-status ${TOM_STATUS[c.status] || ''}`} data-testid="sup-status">{ROT_STATUS[c.status] || c.status}</span>
      </div>
      <div className="sup-msgs" tabIndex={0} aria-label="Mensagens do chamado" data-testid="sup-msgs">
        {(c.msgs || []).map((m) => (
          <div key={m.id} className={`sup-balao sup-${m.autorTipo}`} data-testid="sup-msg">
            {m.autorTipo !== 'sistema' && <span className="sup-quem"><b>{m.autorNome}</b><span>{quando(m.criadoEm)}</span></span>}
            <span className="sup-texto">{m.texto}</span>
            <ImagensDaMensagem chamadoId={c.id} anexos={m.anexos} adaptador={adaptador} />
          </div>
        ))}
        <span ref={fim} />
      </div>
      {fechado ? <Aviso>Este chamado foi fechado. Abra um novo chamado se precisar.</Aviso> : (
        <form onSubmit={enviar} className="sup-form">
          <Campo rotulo="Sua mensagem"><textarea value={texto} onChange={(e) => { setTexto(e.target.value); setErro(''); }} maxLength={4000} rows={3} data-testid="sup-resposta" /></Campo>
          <EscolherImagens valor={imagens} aoMudar={setImagens} desabilitado={enviando} />
          {erro && <Aviso tipo="erro" data-testid="sup-erro">{erro}</Aviso>}
          <div className="sup-acoes"><Btn variante="primario" type="submit" disabled={enviando || !texto.trim()} data-testid="sup-enviar">{enviando ? 'Enviando…' : 'Enviar'}</Btn><Btn onClick={aoVoltar} data-testid="sup-voltar">Voltar</Btn></div>
        </form>
      )}
      {fechado && erro && <Aviso tipo="erro">{erro}</Aviso>}
      {fechado && <div className="sup-acoes"><Btn onClick={aoVoltar} data-testid="sup-voltar">Voltar</Btn></div>}
    </div>
  );
}

function NovoChamado({ adaptador, aoCriado, aoCancelar }) {
  const [f, setF] = useState({ assunto: '', categoria: 'duvida', texto: '' });
  const [imagens, setImagens] = useState([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await adaptador.abrir({ ...f, anexos: imagens.map((x) => x.dados) });
    setEnviando(false);
    if (r.ok) aoCriado(r.chamado); else setErro(r.erro);
  };
  return (
    <form className="sup-novo" onSubmit={enviar} data-testid="sup-form">
      <h3>Novo chamado</h3>
      <Campo rotulo="Assunto"><input value={f.assunto} onChange={(e) => { setF({ ...f, assunto: e.target.value }); setErro(''); }} maxLength={120} data-testid="sup-assunto" /></Campo>
      <Campo rotulo="Tipo"><select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} data-testid="sup-categoria">{CATEGORIAS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
      <Campo rotulo="O que está acontecendo?"><textarea value={f.texto} onChange={(e) => { setF({ ...f, texto: e.target.value }); setErro(''); }} maxLength={4000} rows={5} data-testid="sup-texto" /></Campo>
      <EscolherImagens valor={imagens} aoMudar={setImagens} desabilitado={enviando} />
      {erro && <Aviso tipo="erro" data-testid="sup-erro">{erro}</Aviso>}
      <div className="sup-acoes"><Btn variante="primario" type="submit" disabled={enviando || !f.assunto.trim() || !f.texto.trim()} data-testid="sup-abrir">{enviando ? 'Enviando…' : 'Abrir chamado'}</Btn><Btn onClick={aoCancelar} data-testid="sup-cancelar">Cancelar</Btn></div>
    </form>
  );
}

export default function Suporte({ adaptador, ehDono, aoMudar }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [tela, setTela] = useState('lista'); // lista | novo | id do chamado aberto
  const [aberto, setAberto] = useState('');
  const carregar = useCallback(async (fundo) => {
    const r = await adaptador.listar();
    if (r.ok) { setErro(''); setLista((antes) => (antes && JSON.stringify(antes) === JSON.stringify(r.chamados) ? antes : r.chamados)); }
    else if (!fundo) { setErro(r.erro); setLista((antes) => antes || []); }
  }, [adaptador]);
  useEffect(() => { carregar(false); const t = setInterval(() => carregar(true), INTERVALO_MS); return () => clearInterval(t); }, [carregar]);
  const mudarRef = useRef(aoMudar); mudarRef.current = aoMudar; // estável: se mudasse a cada tela, a conversa recarregaria em laço
  const mudou = useCallback(() => { carregar(true); if (mudarRef.current) mudarRef.current(); }, [carregar]);
  const naoLidas = (lista || []).reduce((n, c) => n + (c.naoLidas || 0), 0);
  return (
    <section className="tela sup" data-testid="suporte">
      <div className="tela-topo">
        <div><h2>Suporte {naoLidas > 0 && <span className="sup-selo" data-testid="sup-selo" aria-label={`${naoLidas} não lidas`}>{naoLidas}</span>}</h2>
          <p className="muted sup-sub">{ehDono ? 'Como proprietário, você vê os chamados de toda a loja.' : 'Você vê os chamados que abriu.'}</p></div>
        {tela === 'lista' && <Btn variante="primario" onClick={() => setTela('novo')} data-testid="sup-novo"><Icone n="plus" size={16} /> Novo chamado</Btn>}
      </div>
      {tela === 'novo' && <NovoChamado adaptador={adaptador} aoCancelar={() => setTela('lista')} aoCriado={(c) => { setAberto(c.id); setTela('conversa'); mudou(); }} />}
      {tela === 'conversa' && <Conversa key={aberto} id={aberto} adaptador={adaptador} aoVoltar={() => { setTela('lista'); mudou(); }} aoMudou={mudou} />}
      {tela === 'lista' && (
        <>
          {erro && <Aviso tipo="erro" data-testid="sup-erro">{erro}</Aviso>}
          {lista === null && <p className="muted" role="status">Carregando…</p>}
          {lista && !lista.length && !erro && <p className="muted sup-vazio" data-testid="sup-vazio">Nenhum chamado ainda. Use “Novo chamado” para falar com o suporte.</p>}
          {lista && lista.length > 0 && (
            <ul className="sup-lista" data-testid="sup-lista">
              {lista.map((c) => (
                <li key={c.id}>
                  <button type="button" className="sup-item" onClick={() => { setAberto(c.id); setTela('conversa'); }} data-testid="sup-item">
                    <span className="sup-item-topo"><b>{c.assunto}</b>{c.naoLidas > 0 && <span className="sup-selo" aria-label={`${c.naoLidas} não lidas`}>{c.naoLidas}</span>}</span>
                    <span className="sup-item-base"><span className={`sup-status ${TOM_STATUS[c.status] || ''}`}>{ROT_STATUS[c.status] || c.status}</span><span className="muted sup-sub">{ehDono ? `${c.usuarioNome} · ` : ''}{ROT_CATEGORIA[c.categoria] || ''} · {quando(c.atualizadoEm)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
