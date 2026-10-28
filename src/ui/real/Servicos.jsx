/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Serviços do site real (F2 parte 3): lista, novo, editar e remover. Toda a regra (nome, código único, preço e duração por porte, combo, vários dias,
// intervalo, antecedência, comissão, desativar em vez de apagar) está no servidor; esta tela mostra o que ele devolve e as mensagens dele.
// Só o proprietário escreve; o profissional apenas consulta. Notificações próprias, materiais e financeiro do serviço chegam com os módulos deles.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useState } from 'react';
import { servicos as api } from '../../services/api-real.js';
import { capAtiva } from '../../domain/tipos.js';
import { PORTES, ROTULO_PORTE } from '../../domain/veiculos.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';

const dinheiro = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const txt = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
export function duracaoTexto(min) {
  const m = Math.round(Number(min) || 0);
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440} ${m === 1440 ? 'dia' : 'dias'}`;
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

function precoDoCartao(s, porPorte) {
  if (!porPorte || !s.precos) return dinheiro(s.preco);
  const v = PORTES.map((p) => s.precos[p]).filter((x) => typeof x === 'number');
  if (!v.length) return dinheiro(s.preco);
  const a = Math.min(...v), b = Math.max(...v);
  return a === b ? dinheiro(a) : `${dinheiro(a)} a ${dinheiro(b)}`;
}

function FormServico({ ficha, todos, ehDono, aoSalvar, aoCancelar }) {
  const novo = !ficha.id;
  const porPorte = capAtiva('precoPorPorte');
  const variosDias = capAtiva('multiDia');
  const [f, setF] = useState(() => ({
    nome: ficha.nome || '', codigo: ficha.codigo || '', categoria: ficha.categoria || '',
    preco: txt(novo ? null : ficha.preco), duracao: txt(novo ? null : ficha.duracaoMin),
    precos: Object.fromEntries(PORTES.map((p) => [p, txt(ficha.precos ? ficha.precos[p] : null)])),
    duracoes: Object.fromEntries(PORTES.map((p) => [p, txt(ficha.duracoes ? ficha.duracoes[p] : null)])),
    intervalo: txt(ficha.intervaloMin || 0), antecedencia: txt(ficha.antecedenciaH || 0), comissao: txt(ficha.comissaoPct),
    multiDia: !!ficha.multiDia, combo: !!ficha.combo, componentes: ficha.componentes || [], ativo: ficha.ativo !== false,
  }));
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const mudar = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const mudarPorte = (grupo, p) => (e) => setF({ ...f, [grupo]: { ...f[grupo], [p]: e.target.value } });
  const opcoes = todos.filter((s) => !s.combo && s.id !== ficha.id && (s.ativo || f.componentes.includes(s.id)));
  const alternar = (id) => setF({ ...f, componentes: f.componentes.includes(id) ? f.componentes.filter((x) => x !== id) : [...f.componentes, id] });

  const salvar = async (e) => {
    e.preventDefault();
    if (enviando || !ehDono) return;
    setEnviando(true); setErro('');
    const corpo = { nome: f.nome, categoria: f.categoria, ativo: f.ativo, combo: f.combo };
    if (f.codigo.trim()) corpo.codigo = f.codigo.trim();
    if (porPorte) {
      corpo.precos = Object.fromEntries(PORTES.map((p) => [p, num(f.precos[p])]).filter(([, v]) => v !== null));
      corpo.duracoes = Object.fromEntries(PORTES.map((p) => [p, num(f.duracoes[p])]).filter(([, v]) => v !== null));
    } else {
      const p = num(f.preco), d = num(f.duracao);
      if (p !== null) corpo.preco = p;
      if (d !== null) corpo.duracaoMin = d;
    }
    for (const [k, v] of [['intervaloMin', num(f.intervalo)], ['antecedenciaH', num(f.antecedencia)], ['comissaoPct', num(f.comissao)]]) if (v !== null) corpo[k] = v;
    if (variosDias) corpo.multiDia = f.multiDia;
    if (f.combo) corpo.componentes = f.componentes;
    if (!novo) corpo.id = ficha.id;
    const r = await api.salvar(corpo);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.servico);
  };

  return (
    <section className="tela" data-testid="srv-form">
      <header className="tela-topo"><h1>{novo ? 'Novo serviço' : ehDono ? 'Editar serviço' : 'Serviço'}</h1></header>
      <form onSubmit={salvar} className="form-grade">
        <fieldset disabled={!ehDono} className="conj">
          <Campo rotulo="Nome do serviço"><input value={f.nome} maxLength={100} onChange={mudar('nome')} data-testid="srv-nome" /></Campo>
          <Campo rotulo="Código (deixe vazio para o próximo número)"><input value={f.codigo} maxLength={20} autoComplete="off" onChange={mudar('codigo')} data-testid="srv-codigo" /></Campo>
          <Campo rotulo="Categoria (opcional)"><input value={f.categoria} maxLength={30} onChange={mudar('categoria')} data-testid="srv-categoria" /></Campo>
          {porPorte ? (
            <div className="srv-portes" data-testid="srv-portes">
              <p className="muted">Preço e duração (em minutos) para cada porte de veículo.</p>
              {PORTES.map((p) => (
                <div key={p} className="srv-porte-linha">
                  <b>{ROTULO_PORTE[p]}</b>
                  <Campo rotulo="Preço (R$)"><input value={f.precos[p]} inputMode="decimal" onChange={mudarPorte('precos', p)} data-testid={`srv-preco-${p}`} /></Campo>
                  <Campo rotulo="Duração (min)"><input value={f.duracoes[p]} inputMode="numeric" onChange={mudarPorte('duracoes', p)} data-testid={`srv-duracao-${p}`} /></Campo>
                </div>
              ))}
            </div>
          ) : (
            <>
              <Campo rotulo="Preço (R$)"><input value={f.preco} inputMode="decimal" onChange={mudar('preco')} data-testid="srv-preco" /></Campo>
              <Campo rotulo="Duração (minutos)"><input value={f.duracao} inputMode="numeric" onChange={mudar('duracao')} data-testid="srv-duracao" /></Campo>
            </>
          )}
          <Campo rotulo="Intervalo depois do serviço (minutos)"><input value={f.intervalo} inputMode="numeric" onChange={mudar('intervalo')} data-testid="srv-intervalo" /></Campo>
          <Campo rotulo="Antecedência mínima para agendar (horas)"><input value={f.antecedencia} inputMode="numeric" onChange={mudar('antecedencia')} data-testid="srv-antecedencia" /></Campo>
          {ehDono && <Campo rotulo="Comissão do serviço (%, opcional)"><input value={f.comissao} inputMode="decimal" onChange={mudar('comissao')} data-testid="srv-comissao" /></Campo>}
          {variosDias && <label className="pa-check"><input type="checkbox" checked={f.multiDia} onChange={(e) => setF({ ...f, multiDia: e.target.checked })} data-testid="srv-multidia" /> Serviço de vários dias (o veículo fica na loja)</label>}
          <label className="pa-check"><input type="checkbox" checked={f.combo} onChange={(e) => setF({ ...f, combo: e.target.checked })} data-testid="srv-combo" /> Combo (junta de 2 a 10 serviços)</label>
          {f.combo && (
            <div className="srv-componentes" data-testid="srv-componentes">
              {opcoes.length === 0 ? <p className="muted">Cadastre antes os serviços que formam o combo.</p> : opcoes.map((s) => (
                <label key={s.id} className="pa-check"><input type="checkbox" checked={f.componentes.includes(s.id)} onChange={() => alternar(s.id)} data-testid={`srv-comp-${s.id}`} /> {s.nome}</label>
              ))}
            </div>
          )}
          <label className="pa-check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} data-testid="srv-ativo" /> Ativo (aparece para agendar)</label>
        </fieldset>
        {!ehDono && <Aviso data-testid="srv-somente-leitura">Só o proprietário altera os serviços.</Aviso>}
        {erro && <Aviso tipo="erro" data-testid="srv-erro">{erro}</Aviso>}
        <div className="acoes">
          <Btn onClick={aoCancelar} data-testid="srv-cancelar">{ehDono ? 'Cancelar' : 'Voltar'}</Btn>
          {ehDono && <Btn variante="primario" type="submit" disabled={enviando} data-testid="salvar-servico">{enviando ? 'Salvando…' : 'Salvar'}</Btn>}
        </div>
      </form>
    </section>
  );
}

export default function Servicos({ ehDono }) {
  const [lista, setLista] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ficha, setFicha] = useState(null); // {} = novo
  const [busca, setBusca] = useState('');
  const [removendo, setRemovendo] = useState(null);
  const [versao, setVersao] = useState(0);
  const porPorte = capAtiva('precoPorPorte');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await api.listar();
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro); setLista([]); return; }
      setErro(''); setLista(r.servicos);
    })();
    return () => { vivo = false; };
  }, [versao]);

  const remover = async (s) => {
    setRemovendo(null); setErro(''); setAviso('');
    const r = await api.remover(s.id);
    if (!r.ok) { setErro(r.erro); return; }
    setAviso(r.desativado ? 'Esse serviço tem histórico ou está num combo, então foi desativado em vez de apagado.' : 'Serviço removido.');
    setVersao((v) => v + 1);
  };

  if (ficha) {
    return <FormServico ficha={ficha} todos={lista || []} ehDono={ehDono} aoCancelar={() => setFicha(null)} aoSalvar={() => { setFicha(null); setAviso('Serviço salvo.'); setVersao((v) => v + 1); }} />;
  }
  const q = busca.trim().toLowerCase();
  const visiveis = (lista || []).filter((s) => !q || s.nome.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q) || s.categoria.toLowerCase().includes(q));
  return (
    <section className="tela" data-testid="tela-servicos">
      <header className="tela-topo">
        <h1>Serviços</h1>
        {ehDono && <Btn variante="primario" onClick={() => { setAviso(''); setFicha({}); }} data-testid="novo-servico"><Icone n="plus" size={16} /> Novo serviço</Btn>}
      </header>
      <input className="busca" type="search" placeholder="Buscar por nome, código ou categoria" value={busca} maxLength={60} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar serviço" data-testid="srv-busca" />
      {aviso && <Aviso data-testid="srv-salvo"><span role="status">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro" data-testid="srv-erro-lista">{erro}</Aviso>}
      {lista === null ? <p className="muted" role="status" data-testid="srv-carregando">Carregando…</p>
        : visiveis.length === 0 ? <p className="muted" data-testid="srv-vazio">{q ? 'Nenhum serviço encontrado.' : 'Nenhum serviço cadastrado ainda.'}</p> : (
          <ul className="clientes-lista" data-testid="srv-lista">
            {visiveis.map((s) => (
              <li key={s.id} className="cliente-cartao" data-testid={`srv-${s.id}`}>
                <div className="cliente-dados">
                  <b data-testid="srv-item-nome">{s.nome}</b>{' '}
                  <small className="muted">#{s.codigo}{s.categoria ? ` · ${s.categoria}` : ''}</small>
                  <span className="cliente-linha" data-testid="srv-item-preco">{precoDoCartao(s, porPorte)} · {duracaoTexto(s.duracaoMin)}{porPorte ? ' (porte médio)' : ''}</span>
                  {(s.combo || s.multiDia || !s.ativo) && (
                    <span className="cliente-linha muted">{[s.combo ? `Combo de ${s.componentes.length}` : '', s.multiDia ? 'Vários dias' : '', !s.ativo ? 'Desativado' : ''].filter(Boolean).join(' · ')}</span>
                  )}
                  {removendo === s.id && (
                    <div className="acoes" data-testid={`srv-confirmar-${s.id}`}>
                      <span>Remover “{s.nome}”?</span>
                      <Btn tamanho="sm" variante="perigo" onClick={() => remover(s)} data-testid={`srv-remover-sim-${s.id}`}>Remover</Btn>
                      <Btn tamanho="sm" onClick={() => setRemovendo(null)} data-testid={`srv-remover-nao-${s.id}`}>Manter</Btn>
                    </div>
                  )}
                </div>
                <div className="acoes">
                  <Btn tamanho="sm" onClick={() => { setAviso(''); setFicha(s); }} aria-label={`${ehDono ? 'Editar' : 'Ver'} ${s.nome}`} data-testid={`editar-${s.id}`}><Icone n={ehDono ? 'edit' : 'info'} size={15} /> {ehDono ? 'Editar' : 'Ver'}</Btn>
                  {ehDono && <Btn tamanho="sm" onClick={() => setRemovendo(s.id)} aria-label={`Remover ${s.nome}`} data-testid={`remover-${s.id}`}><Icone n="trash" size={15} /></Btn>}
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
