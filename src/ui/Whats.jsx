/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:858cffc13f */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marcar } from '../domain/autoria.js';
import { store, bancoSimulado } from '../services/api.js';
import { cpfFormatado } from '../domain/pix.js';
import { fmtMoney } from '../domain/time.js';
import { chat } from '../services/chat.js';
import { duracaoMin, servicosPorIds, somenteDigitos, telefoneNacional, ATIVOS } from '../domain/rules.js';
import { MIN, fmtDateTime, fmtHM } from '../domain/time.js';
import { Btn, Icon } from './common.jsx';
import { useChat, useStore } from './hooks.js';
import { Rot, rot } from '../domain/tipos.js';

const PRESETS = [
  ['novo', 'Cliente novo (RS)', '(51) 98000-0001'],
  ['fora', 'Fora do RS (DDD 11)', '(11) 98888-7777'],
];

function Conversa() {
  const { state: st } = useStore();
  const { threads, atual } = useChat();
  const th = threads[somenteDigitos(atual)] || { mensagens: [], cliques: [] };
  const [txt, setTxt] = useState('');
  const fim = useRef(null);
  const tel = somenteDigitos(atual);

  const todas = useMemo(() => {
    const locais = th.mensagens.map((m) => ({ ...m, tipo: 'local' }));
    const modelos = st.mensagensCliente.filter((m) => somenteDigitos(m.telefone) === tel).map((m) => ({ id: m.id, de: 'bot', tipo: 'modelo', texto: m.texto, em: m.em, botoes: m.botoes, modeloNome: m.modeloNome, origem: m.origem }));
    return [...locais, ...modelos].sort((a, b) => a.em - b.em);
  }, [th.mensagens, st.mensagensCliente, tel]);

  useEffect(() => { fim.current?.scrollTo({ top: fim.current.scrollHeight }); }, [todas.length, atual]);
  const ultima = todas[todas.length - 1];
  const chips = ultima && ultima.tipo === 'local' && ultima.de === 'bot' ? ultima.botoes : [];

  const enviar = (e) => { e.preventDefault(); if (!txt.trim()) return; chat.enviar(txt.trim()); setTxt(''); };

  return (
    <>
      <div className="wa-msgs" ref={fim} data-testid="wa-msgs">
        {todas.length === 0 && <p className="wa-vazio">Diga <b>oi</b> para começar a conversa como se fosse o cliente.{marcar('')}</p>}
        {todas.map((m) => (
          <div key={m.id} className={`wa-linha ${m.de === 'cliente' ? 'eu' : 'bot'}`}>
            <div className={`wa-balao ${m.tipo === 'modelo' ? 'modelo' : ''}`}>
              {m.tipo === 'modelo' && <span className="wa-tag">Modelo Meta · {m.modeloNome}</span>}
              <p>{m.texto}</p>
              <time>{fmtHM(m.em)}</time>
            </div>
            {m.tipo === 'modelo' && m.botoes.length > 0 && (
              <div className="wa-botoes-modelo">
                {m.botoes.map((b) => <button key={b} type="button" disabled={th.cliques.includes(m.id)} onClick={() => chat.clicarModelo(m.id, b)} data-testid={`wa-btn-${b}`}>{b}</button>)}
              </div>
            )}
          </div>
        ))}
        {chips.length > 0 && (chips.length <= 3
          ? (
            <div className="wa-chips" data-testid="wa-chips">
              {chips.map((c) => <button key={c.valor + c.rotulo} type="button" onClick={() => chat.enviar(c.rotulo, c.valor)}>{c.rotulo}</button>)}
            </div>
          )
          : (
            <div className="wa-lista" data-testid="wa-chips" role="group" aria-label="Escolha uma opção">
              <b>Escolha uma opção</b>
              {chips.map((c) => <button key={c.valor + c.rotulo} type="button" onClick={() => chat.enviar(c.rotulo, c.valor)}><i>{c.n}</i><span>{c.rotulo}</span></button>)}
            </div>
          ))}
      </div>
      <form className="wa-entrada" onSubmit={enviar}>
        <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Digite uma mensagem" aria-label="Mensagem do cliente" data-testid="wa-input" />
        <button type="submit" aria-label="Enviar" className="wa-enviar"><Icon n="send" size={18} /></button>
      </form>
    </>
  );
}

function Chamadas() {
  const { apiLog } = useStore();
  return (
    <div className="wa-api">
      <p className="muted">Cada ação gera uma chamada, no mesmo formato que o Spring Boot vai receber.</p>
      {apiLog.length === 0 && <p className="muted">Nada ainda. Faça algo no painel ou na conversa.</p>}
      <ul>
        {apiLog.map((l) => (
          <li key={l.id} className={l.ok ? '' : 'falhou'}>
            <b className={`met met-${l.metodo}`}>{l.metodo}</b>
            <code>{l.rota}</code>
            <span className={`origem origem-${l.origem}`}>{l.origem === 'whatsapp' ? 'WhatsApp' : l.origem === 'sistema' ? 'Sistema' : l.origem === 'banco' ? 'Banco' : 'Painel'}</span>
            <small className="muted">{fmtHM(l.em)} · {l.ok ? 'ok' : `recusada: ${l.detalhe}`}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function proximoEvento(st, agora) {
  const c = [];
  for (const a of st.agendamentos) {
    if (a.status === 'a_confirmar') {
      a.plano.forEach((p) => { if (p.estado === 'pendente') c.push(p.enviarEm); });
      c.push(a.inicio);
      c.push(a.inicio + duracaoMin(servicosPorIds(st, a.servicoIds)) * MIN);
    } else if (a.status === 'confirmado') c.push(a.inicio + duracaoMin(servicosPorIds(st, a.servicoIds)) * MIN);
  }
  const f = c.filter((t) => t > agora).sort((x, y) => x - y)[0];
  return f || null;
}

function Tempo() {
  const { state: st, agora, offset } = useStore();
  const prox = proximoEvento(st, agora);
  return (
    <div className="wa-api">
      <p>As automações dependem do relógio (notificações, falta de confirmação, conclusão). Avance o tempo para ver tudo acontecer.</p>
      <div className="relogio"><Icon n="clock" size={20} /><b data-testid="relogio">{fmtDateTime(agora)}</b>{offset !== 0 && <span className="chip chip-reag">simulado</span>}</div>
      <div className="acoes">
        <Btn tamanho="sm" onClick={() => store.avancar(30 * MIN)}>+30 min</Btn>
        <Btn tamanho="sm" onClick={() => store.avancar(60 * MIN)} data-testid="avancar-1h">+1 hora</Btn>
        <Btn tamanho="sm" onClick={() => store.avancar(24 * 60 * MIN)} data-testid="avancar-1d">+1 dia</Btn>
      </div>
      <Btn variante="primario" icone="zap" disabled={!prox} onClick={() => store.avancar(prox - agora + 1000)} data-testid="proximo-evento">{prox ? `Ir até o próximo envio automático (${fmtDateTime(prox)})` : 'Nada agendado para o futuro'}</Btn>
      <div className="acoes">
        <Btn tamanho="sm" onClick={() => store.voltarAoRelogioReal()} disabled={offset === 0}>Voltar ao horário real</Btn>
        <Btn tamanho="sm" variante="perigo" onClick={() => { store.reiniciar(); chat.reiniciar(); }}>Restaurar dados de exemplo</Btn>
      </div>
    </div>
  );
}

function Banco() {
  const { state: st } = useStore();
  const contas = st.financeiro.contas;
  const nomeConta = (id) => (contas.find((c) => c.id === id) || {}).apelido || '';
  const pend = st.financeiro.cobrancas.filter((c) => c.status === 'pendente');
  const [f, setF] = useState({ codigo: '', nome: '', cpf: '', valor: '' });
  const [res, setRes] = useState(null);
  const [av, setAv] = useState({ contaId: contas[0].id, tipo: 'debito', valor: '', descricao: '' });
  const escolher = (id) => {
    const c = pend.find((x) => x.id === id);
    if (!c) { setF({ codigo: '', nome: '', cpf: '', valor: '' }); return; }
    const cli = st.clientes.find((x) => x.id === c.clienteId);
    setF({ codigo: c.copiaECola, nome: cli ? cli.nome : '', cpf: cpfFormatado(c.cpf), valor: String(c.valor) });
  };
  const pagar = () => {
    const r = bancoSimulado.pagarPix(f);
    if (!r.ok) { setRes({ ok: false, texto: r.erros[0] }); return; }
    const e = r.extrato;
    setRes({ ok: true, texto: !r.canal ? `Pix pago na conta ${r.conta.apelido}. A ${rot('loja')} não conectou a API Pix nem o Open Finance desta conta, então só vai saber quando confirmar à mão.` : e && e.status === 'conciliado' ? (r.canal === 'webhook' ? `Pix pago. O banco avisou pelo webhook e a ${rot('loja')} confirmou a cobrança sozinha.` : `Pix pago. O banco avisou e a ${rot('loja')} confirmou a cobrança sozinha.`) : 'Pix pago, mas diverge da cobrança. Ficou aguardando autorização em Financeiro > Conciliação.' });
    setF({ codigo: '', nome: '', cpf: '', valor: '' });
  };
  return (
    <div className="wa-api wa-banco">
      <p className="muted">Simula o app do banco do cliente e o extrato da {rot('loja')}. Tudo aqui acontece fora do sistema; o sistema só fica sabendo pelo Open Finance.</p>
      <div className="banco-contas">{contas.map((c) => <div className="banco-conta" key={c.id} data-testid={`banco-conta-${c.id}`}><b>{c.apelido}</b><small className="muted">{c.banco}</small><span className="banco-chips"><span className={`chip chip-p ${c.apiPix.ativa ? 'chip-nivel-ok' : ''}`}>{c.apiPix.ativa ? `API Pix: ${c.apiPix.banco}` : 'API Pix inativa'}</span><span className={`chip chip-p ${c.openFinance.conectado ? 'chip-nivel-ok' : ''}`}>{c.openFinance.conectado ? 'Open Finance conectado' : 'Open Finance desconectado'}</span></span></div>)}</div>
      <h4>Pagar um Pix (como cliente)</h4>
      <label className="campo"><span className="campo-rotulo">Cobranças aguardando</span>
        <select onChange={(e) => escolher(e.target.value)} value="" data-testid="banco-escolher"><option value="">{pend.length ? 'Escolha para preencher o código…' : 'Nenhuma cobrança pendente'}</option>{pend.map((c) => { const a = st.agendamentos.find((x) => x.id === c.agendamentoId); const cli = st.clientes.find((x) => x.id === c.clienteId); return <option key={c.id} value={c.id}>{cli ? (cli.apelido || cli.nome) : ''} · {fmtMoney(c.valor)}{contas.length > 1 ? ` · ${nomeConta(c.contaId)}` : ''}</option>; })}</select>
      </label>
      <label className="campo"><span className="campo-rotulo">Código copia e cola</span><textarea rows={3} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Cole aqui o código recebido no WhatsApp" data-testid="banco-codigo" /></label>
      <div className="linha-campos">
        <label className="campo"><span className="campo-rotulo">Nome de quem paga</span><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="banco-nome" /></label>
        <label className="campo"><span className="campo-rotulo">CPF de quem paga</span><input value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} data-testid="banco-cpf" /></label>
        <label className="campo"><span className="campo-rotulo">Valor (R$)</span><input type="number" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="do código" data-testid="banco-valor" /></label>
      </div>
      <Btn variante="primario" onClick={pagar} disabled={!f.codigo.trim()} data-testid="banco-pagar">Pagar Pix</Btn>
      {res && <p className={res.ok ? 'banco-ok' : 'msg-conflito'} role="status" data-testid="banco-resultado">{res.texto}</p>}
      <h4>Movimento avulso na conta</h4>
      <div className="linha-campos">
        {contas.length > 1 && <select value={av.contaId} onChange={(e) => setAv({ ...av, contaId: e.target.value })} aria-label="Conta do movimento" data-testid="banco-av-conta">{contas.map((c) => <option key={c.id} value={c.id}>{c.apelido}</option>)}</select>}
        <select value={av.tipo} onChange={(e) => setAv({ ...av, tipo: e.target.value })} aria-label="Tipo"><option value="debito">Saída</option><option value="credito">Entrada</option></select>
        <input type="number" step="0.01" placeholder="Valor" value={av.valor} onChange={(e) => setAv({ ...av, valor: e.target.value })} aria-label="Valor do movimento" data-testid="banco-av-valor" />
        <input placeholder="Descrição" value={av.descricao} onChange={(e) => setAv({ ...av, descricao: e.target.value })} aria-label="Descrição do movimento" />
        <Btn tamanho="sm" onClick={() => { const r = bancoSimulado.lancar({ ...av, nome: av.descricao }); setRes({ ok: r.ok, texto: r.ok ? 'Movimento criado no banco.' : r.erros[0] }); if (r.ok) setAv({ ...av, valor: '', descricao: '' }); }} data-testid="banco-av-ok">Criar</Btn>
      </div>
      <h4>Extrato do banco</h4>
      <ul className="banco-ext">
        {st.banco.movimentos.slice().sort((a, b) => b.em - a.em).slice(0, 10).map((m) => (
          <li key={m.id}><b className={m.tipo === 'debito' ? 'est-zerado' : 'est-ok'}>{m.tipo === 'debito' ? '−' : '+'} {fmtMoney(m.valor)}</b><span>{m.descricao}{contas.length > 1 ? <small className="muted"> · {nomeConta(m.contaId)}</small> : null}</span><small className="muted">{fmtDateTime(m.em)} · {m.importado ? `visto pela ${rot('loja')}` : 'ainda não importado'}</small></li>
        ))}
      </ul>
    </div>
  );
}

export function PainelWhats({ onFechar }) {
  const { state: st } = useStore();
  const nomeDaLoja = st.estabelecimento?.nome || Rot('loja');
  const { atual } = useChat();
  const [aba, setAba] = useState('conversa');
  const [livre, setLivre] = useState('');
  const sel = useMemo(() => {
    const t = somenteDigitos(atual);
    const c = st.clientes.find((x) => telefoneNacional(x.telefone) === telefoneNacional(atual));
    if (c) return `c:${c.id}`;
    const p = PRESETS.find((x) => somenteDigitos(x[2]) === t);
    return p ? `p:${p[0]}` : 'outro';
  }, [atual, st.clientes]);
  const troca = (v) => {
    if (v.startsWith('c:')) chat.trocarNumero(st.clientes.find((c) => c.id === v.slice(2)).telefone);
    else if (v.startsWith('p:')) chat.trocarNumero(PRESETS.find((p) => p[0] === v.slice(2))[2]);
    else chat.trocarNumero('(51) 98000-0002');
  };
  const contato = st.clientes.find((c) => telefoneNacional(c.telefone) === telefoneNacional(atual));

  return (
    <aside className="wa" aria-label="Simulador de WhatsApp" data-testid="wa-painel">
      <header className="wa-topo">
        <span className="wa-logo"><Icon n="msg" size={18} /></span>
        <div><b>{nomeDaLoja}</b><small>{marcar('conversa com o cliente (simulado)')}</small></div>
        <button type="button" className="icone-btn" onClick={onFechar} aria-label="Fechar o WhatsApp"><Icon n="x" /></button>
      </header>
      <div className="wa-quem">
        <label>
          <span>Você é</span>
          <select value={sel} onChange={(e) => troca(e.target.value)} data-testid="wa-quem" aria-label="Quem está falando">
            {st.clientes.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.nome} · {c.telefone}</option>)}
            {PRESETS.map(([k, r, t]) => <option key={k} value={`p:${k}`}>{r} · {t}</option>)}
            {sel === 'outro' && <option value="outro">Outro número · {atual}</option>}
          </select>
        </label>
        <details className="wa-outro">
          <summary>Usar outro número</summary>
          <form onSubmit={(e) => { e.preventDefault(); const d = somenteDigitos(livre); if (d.length >= 10) { chat.trocarNumero(d.length <= 11 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : livre); setLivre(''); } }}>
            <input value={livre} inputMode="tel" placeholder="(DDD) 9XXXX-XXXX" onChange={(e) => setLivre(e.target.value)} aria-label="Outro número" />
            <Btn tamanho="sm" type="submit">Usar</Btn>
          </form>
        </details>
      </div>
      <div className="wa-abas" role="tablist">
        {[['conversa', 'Conversa'], ['api', 'Chamadas à API'], ['banco', 'Banco'], ['tempo', 'Relógio']].map(([k, r]) => <button key={k} type="button" role="tab" aria-selected={aba === k} className={aba === k ? 'on' : ''} onClick={() => setAba(k)}>{r}</button>)}
      </div>
      {aba === 'conversa' && <Conversa />}
      {aba === 'api' && <Chamadas />}
      {aba === 'banco' && <Banco />}
      {aba === 'tempo' && <Tempo />}
    </aside>
  );
}
