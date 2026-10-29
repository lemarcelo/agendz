/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Estoque do site real: produtos à venda (lista com aviso de estoque baixo, novo, editar, remover), entrada, saída e contagem com motivo, e o histórico de
// movimentos (inclui a baixa pelas vendas). Toda a regra (nome e código únicos, saldo nunca negativo, comissão só do proprietário, desativar em vez de
// apagar) está no servidor (ProdutoService); a tela mostra o que ele devolve e as mensagens dele. O estoque só muda por movimento (o cadastro não mexe nele).
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useState } from 'react';
import { estoque as api } from '../../services/api-real.js';
import { fmtDate, fmtHM, fmtMoney } from '../../domain/time.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const num = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const txt = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
const qtdTexto = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const baixo = (p) => p.minimo !== null && p.minimo > 0 && p.estoque <= p.minimo;
const TIPOS = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Contagem' };

function FormProduto({ ficha, ehDono, aoSalvar, aoCancelar }) {
  const novo = !ficha.id;
  const [f, setF] = useState(() => ({
    nome: ficha.nome || '', codigo: ficha.codigo || '', unidade: ficha.unidade || 'un', preco: txt(novo ? null : ficha.preco), custo: txt(ficha.custo),
    minimo: txt(ficha.minimo), comissao: txt(ficha.comissaoPct), estoque: '', ativo: ficha.ativo !== false,
  }));
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mudar = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    const corpo = { nome: f.nome, unidade: f.unidade, ativo: f.ativo };
    if (f.codigo.trim()) corpo.codigo = f.codigo.trim();
    for (const [k, v] of [['preco', num(f.preco)], ['custo', num(f.custo)], ['minimo', num(f.minimo)]]) if (v !== null) corpo[k] = v;
    if (ehDono) corpo.comissaoPct = num(f.comissao) ?? 0;
    if (novo && num(f.estoque) !== null) corpo.estoque = num(f.estoque);
    if (!novo) corpo.id = ficha.id;
    const r = await api.salvar(corpo);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.produto);
  };
  return (
    <section className="tela" data-testid="est-form">
      <header className="tela-topo"><h1>{novo ? 'Novo produto' : 'Editar produto'}</h1></header>
      <form onSubmit={salvar} className="form-grade">
        <fieldset className="conj">
          <Campo rotulo="Nome do produto"><input value={f.nome} maxLength={100} onChange={mudar('nome')} data-testid="est-nome" /></Campo>
          <Campo rotulo="Código (deixe vazio para o próximo número)"><input value={f.codigo} maxLength={20} autoComplete="off" onChange={mudar('codigo')} data-testid="est-codigo" /></Campo>
          <Campo rotulo="Unidade (un, ml, kg…)"><input value={f.unidade} maxLength={20} onChange={mudar('unidade')} data-testid="est-unidade" /></Campo>
          <Campo rotulo="Preço de venda (R$)"><input value={f.preco} inputMode="decimal" onChange={mudar('preco')} data-testid="est-preco" /></Campo>
          <Campo rotulo="Custo (R$, opcional)"><input value={f.custo} inputMode="decimal" onChange={mudar('custo')} data-testid="est-custo" /></Campo>
          <Campo rotulo="Estoque mínimo (avisa quando chegar nele)"><input value={f.minimo} inputMode="decimal" onChange={mudar('minimo')} data-testid="est-minimo" /></Campo>
          {ehDono && <Campo rotulo="Comissão do produto (%, vazio = usa a da pessoa)"><input value={f.comissao} inputMode="decimal" onChange={mudar('comissao')} data-testid="est-comissao" /></Campo>}
          {novo && <Campo rotulo="Estoque inicial"><input value={f.estoque} inputMode="decimal" onChange={mudar('estoque')} data-testid="est-inicial" /></Campo>}
          <label className="pa-check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} data-testid="est-ativo" /> Ativo (aparece para vender)</label>
        </fieldset>
        {!novo && <p className="muted">O estoque muda só por entrada, saída ou contagem (botão “Estoque” na lista).</p>}
        {erro && <Aviso tipo="erro" data-testid="est-erro">{erro}</Aviso>}
        <div className="acoes">
          <Btn onClick={aoCancelar} data-testid="est-cancelar">Cancelar</Btn>
          <Btn variante="primario" type="submit" disabled={enviando} data-testid="salvar-produto">{enviando ? 'Salvando…' : 'Salvar'}</Btn>
        </div>
      </form>
    </section>
  );
}

function Movimentar({ produto, aoMudar, aoVoltar }) {
  const [tipo, setTipo] = useState('entrada');
  const [qtd, setQtd] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [saldo, setSaldo] = useState(produto.estoque);
  const [hist, setHist] = useState(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await api.movimentos(produto.id);
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setHist([]); return; }
      setHist(r.movimentos);
    })();
    return () => { vivo = false; };
  }, [produto.id, versao]);
  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro(''); setAviso('');
    const n = num(qtd);
    const r = await api.movimentar(produto.id, { tipo, qtd: n === null ? NaN : n, obs });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    setSaldo(r.movimento.saldo); setQtd(''); setObs(''); setAviso(`${TIPOS[r.movimento.tipo]} registrada. Estoque agora: ${qtdTexto(r.movimento.saldo)} ${produto.unidade}.`);
    setVersao((v) => v + 1); aoMudar();
  };
  return (
    <section className="tela" data-testid="est-mov">
      <header className="tela-topo"><h1>Estoque: {produto.nome}</h1></header>
      <p data-testid="est-saldo">Em estoque: <b>{qtdTexto(saldo)} {produto.unidade}</b></p>
      <form onSubmit={enviar} className="form-grade">
        <fieldset className="conj">
          <Campo rotulo="Movimento">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} data-testid="mov-tipo">
              <option value="entrada">Entrada (chegou mercadoria)</option>
              <option value="saida">Saída (perda, uso, quebra)</option>
              <option value="ajuste">Contagem (informo quanto tem)</option>
            </select>
          </Campo>
          <Campo rotulo={tipo === 'ajuste' ? 'Quantidade que há de fato' : 'Quantidade'}><input value={qtd} inputMode="decimal" onChange={(e) => setQtd(e.target.value)} data-testid="mov-qtd" /></Campo>
          <Campo rotulo={tipo === 'entrada' ? 'Observação (opcional)' : 'Motivo'}><input value={obs} maxLength={200} onChange={(e) => setObs(e.target.value)} data-testid="mov-obs" /></Campo>
        </fieldset>
        {erro && <Aviso tipo="erro" data-testid="mov-erro">{erro}</Aviso>}
        {aviso && <Aviso data-testid="mov-ok"><span role="status">{aviso}</span></Aviso>}
        <div className="acoes">
          <Btn onClick={aoVoltar} data-testid="mov-voltar">Voltar</Btn>
          <Btn variante="primario" type="submit" disabled={enviando} data-testid="mov-registrar">{enviando ? 'Registrando…' : 'Registrar'}</Btn>
        </div>
      </form>
      <h2 className="est-subtitulo-real">Histórico</h2>
      {hist === null ? <p className="muted" role="status">Carregando…</p> : hist.length === 0 ? <p className="muted" data-testid="mov-vazio">Nenhum movimento ainda.</p> : (
        <ul className="est-hist-real" data-testid="mov-lista">
          {hist.map((m) => (
            <li key={m.id}>
              <span><b>{m.venda ? 'Venda' : TIPOS[m.tipo]}</b> <small className="muted">{m.em ? `${fmtDate(m.em)} ${fmtHM(m.em)}` : ''}{m.autor ? ` · ${m.autor}` : ''}</small>{m.obs && <small className="muted est-obs-real">{m.obs}</small>}</span>
              <strong>{m.delta > 0 ? '+' : ''}{qtdTexto(m.delta)} <small className="muted">→ {qtdTexto(m.saldo)}</small></strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Estoque({ ehDono }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ficha, setFicha] = useState(null); // {} = novo
  const [mover, setMover] = useState(null);
  const [busca, setBusca] = useState('');
  const [removendo, setRemovendo] = useState(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await api.listar();
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setLista([]); return; }
      setErro(''); setLista(r.produtos);
    })();
    return () => { vivo = false; };
  }, [versao]);
  const remover = async (p) => {
    setRemovendo(null); setErro(''); setAviso('');
    const r = await api.remover(p.id);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso(r.desativado ? 'Esse produto tem vendas ou movimentos, então foi desativado em vez de apagado.' : 'Produto removido.');
    setVersao((v) => v + 1);
  };
  if (ficha) return <FormProduto ficha={ficha} ehDono={ehDono} aoCancelar={() => setFicha(null)} aoSalvar={() => { setFicha(null); setAviso('Produto salvo.'); setVersao((v) => v + 1); }} />;
  if (mover) return <Movimentar produto={mover} aoMudar={() => setVersao((v) => v + 1)} aoVoltar={() => setMover(null)} />;
  const q = busca.trim().toLowerCase();
  const visiveis = (lista || []).filter((p) => !q || p.nome.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
  const faltando = (lista || []).filter((p) => p.ativo && baixo(p));
  return (
    <section className="tela" data-testid="tela-estoque">
      <header className="tela-topo">
        <h1>Estoque</h1>
        <Btn variante="primario" onClick={() => { setAviso(''); setFicha({}); }} data-testid="novo-produto"><Icone n="plus" size={16} /> Novo produto</Btn>
      </header>
      <input className="busca" type="search" placeholder="Buscar por nome ou código" value={busca} maxLength={60} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" data-testid="est-busca" />
      {faltando.length > 0 && <Aviso tipo="erro" data-testid="est-baixo">Estoque baixo: {faltando.map((p) => p.nome).join(', ')}.</Aviso>}
      {aviso && <Aviso data-testid="est-salvo"><span role="status">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro" data-testid="est-erro-lista">{erro}</Aviso>}
      {lista === null ? <p className="muted" role="status" data-testid="est-carregando">Carregando…</p>
        : visiveis.length === 0 ? <p className="muted" data-testid="est-vazio">{q ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.'}</p> : (
          <ul className="clientes-lista" data-testid="est-lista">
            {visiveis.map((p) => (
              <li key={p.id} className="cliente-cartao" data-testid={`est-${p.id}`}>
                <div className="cliente-dados">
                  <b data-testid="est-item-nome">{p.nome}</b> <small className="muted">#{p.codigo}</small>
                  <span className="cliente-linha" data-testid="est-item-linha">{fmtMoney(p.preco)} · em estoque {qtdTexto(p.estoque)} {p.unidade}{baixo(p) ? ' · estoque baixo' : ''}{!p.ativo ? ' · desativado' : ''}</span>
                  {removendo === p.id && (
                    <div className="acoes" data-testid={`est-confirmar-${p.id}`}>
                      <span>Remover “{p.nome}”?</span>
                      <Btn tamanho="sm" variante="perigo" onClick={() => remover(p)} data-testid={`est-remover-sim-${p.id}`}>Remover</Btn>
                      <Btn tamanho="sm" onClick={() => setRemovendo(null)} data-testid={`est-remover-nao-${p.id}`}>Manter</Btn>
                    </div>
                  )}
                </div>
                <div className="acoes">
                  <Btn tamanho="sm" onClick={() => { setAviso(''); setMover(p); }} data-testid={`est-mover-${p.id}`}>Estoque</Btn>
                  <Btn tamanho="sm" onClick={() => { setAviso(''); setFicha(p); }} aria-label={`Editar ${p.nome}`} data-testid={`est-editar-${p.id}`}><Icone n="edit" size={15} /></Btn>
                  <Btn tamanho="sm" onClick={() => setRemovendo(p.id)} aria-label={`Remover ${p.nome}`} data-testid={`est-remover-${p.id}`}><Icone n="trash" size={15} /></Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
