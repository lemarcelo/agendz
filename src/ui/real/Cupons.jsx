/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Cupons e vales do site real (5d-4c-2), de quem tem a seção Estabelecimento: lista (valendo e histórico), novo, editar, nova chave e remover.
// A chave nasce no servidor e só aparece aqui; a regra toda (vigência, limites, histórico imutável, só uso em agendamento futuro) é do servidor e a tela mostra a mensagem dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs). Classes de CSS próprias terminam em `-real`.
import React, { useEffect, useState } from 'react';
import { cupons as api, servicos as apiServicos } from '../../services/api-real.js';
import { ROTULO_SITUACAO, TIPOS_CUPOM, ehHistorico } from '../../domain/cupons.js';
import { fmtMoney, ymd } from '../../domain/time.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const dia = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const UM_DIA = 86400000;

function descricao(c, servicos) {
  const nomes = c.servicoIds.map((id) => (servicos.find((s) => s.id === id) || {}).nome).filter(Boolean).join(', ');
  if (c.tipo === 'servico') return `Vale: ${nomes || 'serviço'} de graça`;
  const quanto = c.tipo === 'percentual' ? `${c.percentual}% de desconto` : `${fmtMoney(c.valor || 0)} de desconto`;
  return nomes ? `${quanto} em ${nomes}` : `${quanto} nos serviços`;
}

function FormCupom({ ficha, servicos, aoSalvar, aoCancelar }) {
  const hoje = Date.now();
  const [f, setF] = useState(() => ({
    id: ficha.id || '', nome: ficha.nome || '', tipo: ficha.tipo || 'servico', servicoIds: ficha.servicoIds || [],
    percentual: String(ficha.percentual ?? 10), valor: String(ficha.valor ?? 10), inicio: ficha.inicio || ymd(hoje), fim: ficha.fim || ymd(hoje + 30 * UM_DIA),
    usosMax: String(ficha.usosMax ?? 50), usosPorCliente: String(ficha.usosPorCliente ?? 1),
  }));
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mudar = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const alternar = (id) => setF({ ...f, servicoIds: f.servicoIds.includes(id) ? f.servicoIds.filter((x) => x !== id) : [...f.servicoIds, id] });
  const ativos = servicos.filter((s) => s.ativo !== false || f.servicoIds.includes(s.id));
  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    const r = await api.salvar(f);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.cupom, !f.id);
  };
  return (
    <section className="tela" data-testid="cupom-form">
      <header className="tela-topo"><h1>{f.id ? 'Editar cupom' : 'Novo cupom'}</h1></header>
      <form onSubmit={salvar} className="form-grade">
        <fieldset className="conj">
          <Campo rotulo="Nome do cupom"><input value={f.nome} maxLength={60} onChange={mudar('nome')} placeholder="Ex.: Vale lavagem" data-testid="cupom-nome" /></Campo>
          <Campo rotulo="Tipo">
            <select value={f.tipo} onChange={mudar('tipo')} data-testid="cupom-tipo">
              {Object.entries(TIPOS_CUPOM).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </Campo>
          {f.tipo === 'percentual' && <Campo rotulo="Desconto (%)"><input value={f.percentual} inputMode="decimal" onChange={mudar('percentual')} data-testid="cupom-percentual" /></Campo>}
          {f.tipo === 'valor' && <Campo rotulo="Desconto (R$)"><input value={f.valor} inputMode="decimal" onChange={mudar('valor')} data-testid="cupom-valor" /></Campo>}
          <fieldset className="atender-real-bloco">
            <legend>{f.tipo === 'servico' ? 'Serviços que o vale cobre (de graça: um por vez)' : 'Vale só para estes serviços (vazio = todos)'}</legend>
            {ativos.length === 0 && <p className="muted">Cadastre serviços antes.</p>}
            {ativos.map((s) => <label key={s.id} className="check-linha"><input type="checkbox" checked={f.servicoIds.includes(s.id)} onChange={() => alternar(s.id)} data-testid={`cupom-srv-${s.id}`} /><span>{s.nome}</span></label>)}
          </fieldset>
          <Campo rotulo="Vale a partir de"><input type="date" value={f.inicio} onChange={mudar('inicio')} data-testid="cupom-inicio" /></Campo>
          <Campo rotulo="Vale até (inclusive)"><input type="date" value={f.fim} onChange={mudar('fim')} data-testid="cupom-fim" /></Campo>
          <Campo rotulo="Usos no total"><input value={f.usosMax} inputMode="numeric" onChange={mudar('usosMax')} data-testid="cupom-usos" /></Campo>
          <Campo rotulo="Usos por cliente"><input value={f.usosPorCliente} inputMode="numeric" onChange={mudar('usosPorCliente')} data-testid="cupom-por-cliente" /></Campo>
        </fieldset>
        {erro && <Aviso tipo="erro" data-testid="cupom-erro">{erro}</Aviso>}
        <div className="acoes">
          <Btn onClick={aoCancelar} data-testid="cupom-cancelar">Cancelar</Btn>
          <Btn variante="primario" type="submit" disabled={enviando} data-testid="salvar-cupom">{enviando ? 'Salvando…' : 'Salvar'}</Btn>
        </div>
      </form>
    </section>
  );
}

export default function Cupons() {
  const [lista, setLista] = useState(null); // null = carregando
  const [servicos, setServicos] = useState([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ficha, setFicha] = useState(null); // {} = novo
  const [vistas, setVistas] = useState({});
  const [confirmar, setConfirmar] = useState(null); // { tipo: 'chave' | 'remover', id }
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [a, b] = await Promise.all([api.listar(), apiServicos.listar()]);
      if (!vivo) return;
      if (!a.ok) { setErro(a.erro); setLista([]); return; }
      setErro(''); setLista(a.cupons); setServicos(b.ok ? b.servicos : []);
    })();
    return () => { vivo = false; };
  }, [versao]);

  const recarregar = () => setVersao((v) => v + 1);
  const novaChave = async (c) => {
    setConfirmar(null); setErro(''); setAviso('');
    const r = await api.novaChave(c.id);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso('Nova chave gerada. A antiga não vale mais.'); setVistas((v) => ({ ...v, [c.id]: true })); recarregar();
  };
  const remover = async (c) => {
    setConfirmar(null); setErro(''); setAviso('');
    const r = await api.remover(c.id);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso(r.desativado ? 'Cupom já usado: foi encerrado e foi para o histórico.' : 'Cupom removido.'); recarregar();
  };
  const copiar = async (c) => {
    try { await navigator.clipboard.writeText(c.chave); setAviso('Chave copiada.'); } catch { setErro('Não consegui copiar sozinho: mostre a chave e copie o texto.'); }
  };

  if (ficha) {
    return <FormCupom ficha={ficha} servicos={servicos} aoCancelar={() => setFicha(null)} aoSalvar={(c, criado) => { setFicha(null); setAviso(criado ? 'Cupom criado. A chave está no cartão.' : 'Cupom salvo.'); if (criado) setVistas((v) => ({ ...v, [c.id]: true })); recarregar(); }} />;
  }
  const todos = lista || [];
  const valendo = todos.filter((c) => !ehHistorico(c.situacao));
  const historico = todos.filter((c) => ehHistorico(c.situacao));
  const cartao = (c) => {
    const hist = ehHistorico(c.situacao);
    const ver = !!vistas[c.id];
    return (
      <li key={c.id} className="cliente-cartao" data-testid={`cupom-${c.id}`}>
        <div className="cliente-dados">
          <b data-testid="cupom-item-nome">{c.nome}</b>{' '}
          <span className={`chip ${c.situacao === 'vigente' ? 'chip-ok' : 'chip-p'}`} data-testid={`cupom-situacao-${c.id}`}>{ROTULO_SITUACAO[c.situacao]}</span>
          <span className="cliente-linha">{descricao(c, servicos)}</span>
          <span className="cliente-linha muted">Vigência: {dia(c.inicio)} a {dia(c.fim)} · {c.usos} de {c.usosMax} usos · {c.usosPorCliente} por cliente</span>
          {!hist && <span className="cliente-linha"><Icone n="key" size={14} /> <code data-testid={`cupom-chave-${c.id}`}>{ver ? c.chave : `${c.chave.slice(0, 4)}-••••-••••`}</code></span>}
          {confirmar && confirmar.id === c.id && (
            <div className="acoes" data-testid={`cupom-confirmar-${c.id}`}>
              <span>{confirmar.tipo === 'chave' ? 'Gerar nova chave? A antiga deixa de valer na hora.' : `Remover “${c.nome}”?`}</span>
              <Btn tamanho="sm" variante="perigo" onClick={() => (confirmar.tipo === 'chave' ? novaChave(c) : remover(c))} data-testid={`cupom-confirmar-sim-${c.id}`}>{confirmar.tipo === 'chave' ? 'Gerar' : 'Remover'}</Btn>
              <Btn tamanho="sm" onClick={() => setConfirmar(null)} data-testid={`cupom-confirmar-nao-${c.id}`}>Voltar</Btn>
            </div>
          )}
        </div>
        <div className="acoes">
          {!hist && <Btn tamanho="sm" onClick={() => setVistas({ ...vistas, [c.id]: !ver })} data-testid={`cupom-ver-${c.id}`}>{ver ? 'Ocultar chave' : 'Ver chave'}</Btn>}
          {!hist && <Btn tamanho="sm" onClick={() => copiar(c)} data-testid={`cupom-copiar-${c.id}`}><Icone n="copy" size={15} /> Copiar chave</Btn>}
          {!hist && <Btn tamanho="sm" onClick={() => { setAviso(''); setFicha(c); }} data-testid={`cupom-editar-${c.id}`}><Icone n="edit" size={15} /> Editar</Btn>}
          {!hist && <Btn tamanho="sm" onClick={() => setConfirmar({ tipo: 'chave', id: c.id })} data-testid={`cupom-nova-chave-${c.id}`}>Gerar nova chave</Btn>}
          {hist && <Btn tamanho="sm" onClick={() => { setAviso(''); setFicha({ nome: c.nome, tipo: c.tipo, servicoIds: c.servicoIds, percentual: c.percentual, valor: c.valor, usosMax: c.usosMax, usosPorCliente: c.usosPorCliente }); }} data-testid={`cupom-modelo-${c.id}`}>Usar como modelo</Btn>}
          {!hist && <Btn tamanho="sm" onClick={() => setConfirmar({ tipo: 'remover', id: c.id })} aria-label={`Remover ${c.nome}`} data-testid={`cupom-remover-${c.id}`}><Icone n="trash" size={15} /></Btn>}
        </div>
      </li>
    );
  };
  return (
    <section className="tela" data-testid="tela-cupons">
      <header className="tela-topo">
        <h1>Cupons e vales</h1>
        <Btn variante="primario" onClick={() => { setAviso(''); setFicha({}); }} data-testid="novo-cupom"><Icone n="plus" size={16} /> Novo cupom</Btn>
      </header>
      <p className="muted">Cada cupom tem uma chave secreta que você passa a quem quiser. Na hora de agendar (ou depois, na ficha do horário) você informa a chave. Só vale em agendamento futuro; vale serviço sai de graça e o desconto abate dos serviços.</p>
      {aviso && <Aviso data-testid="cupom-aviso"><span role="status">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro" data-testid="cupom-erro-lista">{erro}</Aviso>}
      {lista === null ? <p className="muted" role="status" data-testid="cupom-carregando">Carregando…</p> : valendo.length === 0 ? <p className="muted" data-testid="cupom-vazio">Nenhum cupom valendo. Crie um vale ou um desconto para um evento.</p> : (
        <ul className="clientes-lista" data-testid="cupons-valendo">{valendo.map(cartao)}</ul>
      )}
      <details className="historico" data-testid="cupons-historico">
        <summary><b>Histórico de cupons</b> ({historico.length})</summary>
        {historico.length === 0 ? <p className="muted">Os cupons vencidos ou encerrados aparecem aqui.</p> : <ul className="clientes-lista">{historico.map(cartao)}</ul>}
      </details>
    </section>
  );
}
