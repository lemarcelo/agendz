/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:0000000000 */
// Clientes do site real (F2 parte 2): lista com busca, ficha, novo e editar. Todas as regras (validação, CPF/telefone cifrados, duplicidade,
// quem vê o CPF completo e quem troca o telefone) estão no servidor; esta tela só mostra o que ele devolve e as mensagens dele.
// Não importa `api.js`, `hooks.js` nem `common.jsx` (tests/estatico.test.mjs).
import React, { useEffect, useRef, useState } from 'react';
import { clientes as api } from '../../services/api-real.js';
import { capAtiva, rot } from '../../domain/tipos.js';
import { formatarCpf, formatarTelefone, somenteDigitos } from '../../domain/rules.js';
import { LIMITE_VEICULOS, PORTES, ROTULO_PORTE, placaValida, rotuloVeiculo } from '../../domain/veiculos.js';
import { Aviso, Btn, Campo, Icone } from '../leve/mini.jsx';
import { BlocoPlanoReal, FormEscolherPlanoReal } from './PlanoDoCliente.jsx';
import { FormEncerrar, FormMensalidade } from './Planos.jsx';

// 5553999000001 → (53) 99900-0001
const telNacional = (t) => { const d = somenteDigitos(t); return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d; };
const fmtTel = (t) => formatarTelefone(telNacional(t));

function FormCliente({ ficha, aoSalvar, aoCancelar, plano }) {
  const novo = !ficha.id;
  const [f, setF] = useState({
    nome: ficha.nome || '', apelido: ficha.apelido || '', telefone: ficha.telefone ? fmtTel(ficha.telefone) : '',
    cpf: ficha.cpf ? formatarCpf(ficha.cpf) : '', nascimento: ficha.nascimento || '', veiculos: ficha.veiculos || [],
  });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const veiculos = capAtiva('usaVeiculo');
  const completo = novo || ficha.dadosCompletos;
  const salvar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setErro('');
    const corpo = { nome: f.nome, apelido: f.apelido, telefone: f.telefone };
    if (completo) { corpo.cpf = f.cpf; corpo.nascimento = f.nascimento; }
    if (veiculos) corpo.veiculos = f.veiculos;
    if (!novo) corpo.id = ficha.id;
    const r = await api.salvar(corpo);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoSalvar(r.cliente);
  };
  const veic = (i, k) => (e) => setF({ ...f, veiculos: f.veiculos.map((x, j) => (j === i ? { ...x, [k]: k === 'placa' ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) : e.target.value } : x)) });
  return (
    <section className="tela" data-testid="cli-form">
      <header className="tela-topo"><h1>{novo ? 'Novo cliente' : 'Editar cliente'}</h1></header>
      <form onSubmit={salvar} className="form-grade">
        <Campo rotulo="Nome ou apelido (obrigatório)"><input value={f.nome} maxLength={100} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="cli-nome" /></Campo>
        <Campo rotulo="Apelido"><input value={f.apelido} maxLength={100} onChange={(e) => setF({ ...f, apelido: e.target.value })} data-testid="cli-apelido" /></Campo>
        <Campo rotulo="Telefone (WhatsApp)"><input value={f.telefone} inputMode="tel" maxLength={20} onChange={(e) => setF({ ...f, telefone: formatarTelefone(e.target.value) })} placeholder="(55) 99999-9999" data-testid="cli-tel" /></Campo>
        {completo ? (
          <>
            <Campo rotulo="CPF (opcional)"><input value={f.cpf} inputMode="numeric" maxLength={14} onChange={(e) => setF({ ...f, cpf: formatarCpf(e.target.value) })} data-testid="cli-cpf" /></Campo>
            <Campo rotulo="Nascimento (opcional)"><input type="date" value={f.nascimento} onChange={(e) => setF({ ...f, nascimento: e.target.value })} data-testid="cli-nasc" /></Campo>
          </>
        ) : (
          <Aviso data-testid="cli-dados-restritos">CPF {ficha.cpfMascarado ? <b>{ficha.cpfMascarado}</b> : 'não informado'}. O CPF completo, o nascimento e a troca do telefone são do proprietário e do {rot('profissional')} que atende este cliente.</Aviso>
        )}
        {veiculos && (
          <fieldset className="conj" data-testid="cli-veiculos">
            <legend>Veículos</legend>
            <div className="veiculos-editor">
              {f.veiculos.map((v, i) => (
                <div key={v.id || `novo-${i}`} className="veiculo-linha" data-testid={`cli-veiculo-${i}`}>
                  <Campo rotulo="Placa"><input value={v.placa || ''} onChange={veic(i, 'placa')} maxLength={8} autoComplete="off" placeholder="ABC1D23" aria-invalid={v.placa && !placaValida(v.placa) ? 'true' : undefined} data-testid={`cli-v-placa-${i}`} /></Campo>
                  <Campo rotulo="Marca"><input value={v.marca || ''} onChange={veic(i, 'marca')} maxLength={30} autoComplete="off" data-testid={`cli-v-marca-${i}`} /></Campo>
                  <Campo rotulo="Modelo"><input value={v.modelo || ''} onChange={veic(i, 'modelo')} maxLength={40} autoComplete="off" data-testid={`cli-v-modelo-${i}`} /></Campo>
                  <Campo rotulo="Cor"><input value={v.cor || ''} onChange={veic(i, 'cor')} maxLength={20} autoComplete="off" data-testid={`cli-v-cor-${i}`} /></Campo>
                  <Campo rotulo="Porte"><select value={v.porte || ''} onChange={veic(i, 'porte')} data-testid={`cli-v-porte-${i}`}><option value="">Escolha…</option>{PORTES.map((k) => <option key={k} value={k}>{ROTULO_PORTE[k]}</option>)}</select></Campo>
                  <button type="button" className="icone-btn" onClick={() => setF({ ...f, veiculos: f.veiculos.filter((_, j) => j !== i) })} aria-label={`Remover veículo ${i + 1}`} data-testid={`cli-v-remover-${i}`}><Icone n="trash" size={16} /></button>
                </div>
              ))}
            </div>
            <Btn tamanho="sm" disabled={f.veiculos.length >= LIMITE_VEICULOS} onClick={() => setF({ ...f, veiculos: [...f.veiculos, { placa: '', marca: '', modelo: '', cor: '', porte: '' }] })} data-testid="cli-veiculo-add"><Icone n="plus" size={15} /> Adicionar veículo</Btn>
            <p className="muted">O porte (pequeno, médio, grande, SUV, pickup) define o preço e o tempo dos serviços.</p>
          </fieldset>
        )}
        {plano && <BlocoPlanoReal cliente={ficha} {...plano} />}
        {erro && <Aviso tipo="erro" data-testid="cli-erro">{erro}</Aviso>}
        <div className="acoes">
          <Btn onClick={aoCancelar} data-testid="cli-cancelar">Cancelar</Btn>
          <Btn variante="primario" type="submit" disabled={enviando} data-testid="salvar-cliente">{enviando ? 'Salvando…' : 'Salvar'}</Btn>
        </div>
      </form>
    </section>
  );
}

export default function Clientes({ podePlanos = false, aoIr = null }) {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null); // null = carregando
  const [erro, setErro] = useState('');
  const [ficha, setFicha] = useState(null); // cliente aberto no formulário ({} = novo)
  const [aviso, setAviso] = useState('');
  const [versao, setVersao] = useState(0);
  // Plano na ficha: o formulário aberto, o aviso e a recarga moram AQUI (o bloco recarrega e a ficha fica montada, escondida), não no bloco.
  const [planoModo, setPlanoModo] = useState(null);
  const [planoAviso, setPlanoAviso] = useState('');
  const [planoVersao, setPlanoVersao] = useState(0);
  const ultima = useRef(0);
  const veiculos = capAtiva('usaVeiculo');

  useEffect(() => {
    const n = ++ultima.current;
    const t = setTimeout(async () => {
      const r = await api.listar(busca);
      if (n !== ultima.current) return; // chegou resposta de uma busca antiga
      if (!r.ok) { setErro(r.erro); setLista([]); return; }
      setErro(''); setLista(r.clientes);
    }, busca ? 250 : 0);
    return () => clearTimeout(t);
  }, [busca, versao]);

  const abrir = async (c) => {
    setErro('');
    const r = await api.obter(c.id);
    if (!r.ok) { setErro(r.erro); return; }
    setFicha(r.cliente);
  };

  if (ficha) {
    const fecharPlano = () => { setPlanoModo(null); };
    const feito = (msg) => { setPlanoModo(null); setPlanoAviso(msg); setPlanoVersao((v) => v + 1); };
    const plano = podePlanos && ficha.id ? { aviso: planoAviso, versao: planoVersao, aoAbrir: (m) => { setPlanoAviso(''); setPlanoModo(m); }, aoFeito: feito, aoIr: aoIr ? (a) => { setFicha(null); setPlanoAviso(''); aoIr(a); } : null } : null;
    return (
      <>
        <div hidden={!!planoModo}>
          <FormCliente ficha={ficha} plano={plano} aoCancelar={() => { setFicha(null); setPlanoAviso(''); }} aoSalvar={() => { setFicha(null); setPlanoAviso(''); setAviso('Cliente salvo.'); setVersao((v) => v + 1); }} />
        </div>
        {planoModo && (planoModo.tipo === 'pagar' ? <FormMensalidade a={planoModo.a} mesInicial={planoModo.mes} aoCancelar={fecharPlano} aoFeito={feito} />
          : planoModo.tipo === 'encerrar' ? <FormEncerrar a={planoModo.a} aoCancelar={fecharPlano} aoFeito={feito} />
            : <FormEscolherPlanoReal modo={planoModo} cliente={ficha} aoCancelar={fecharPlano} aoFeito={feito} />)}
      </>
    );
  }
  return (
    <section className="tela" data-testid="tela-clientes">
      <header className="tela-topo">
        <h1>Clientes</h1>
        <Btn variante="primario" onClick={() => { setAviso(''); setFicha({}); }} data-testid="novo-cliente"><Icone n="plus" size={16} /> Novo cliente</Btn>
      </header>
      <input className="busca" type="search" placeholder={veiculos ? 'Buscar por nome, telefone, CPF ou placa' : 'Buscar por nome, telefone ou CPF'} value={busca} maxLength={60} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" data-testid="cli-busca" />
      {aviso && <Aviso data-testid="cli-salvo"><span role="status">{aviso}</span></Aviso>}
      {erro && <Aviso tipo="erro" data-testid="cli-erro-lista">{erro}</Aviso>}
      {lista === null ? <p className="muted" role="status" data-testid="cli-carregando">Carregando…</p>
        : lista.length === 0 ? <p className="muted" data-testid="cli-vazio">{busca ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p> : (
          <ul className="clientes-lista" data-testid="cli-lista">
            {lista.map((c) => (
              <li key={c.id} className="cliente-cartao" data-testid={`cli-${c.id}`}>
                <div className="cliente-dados">
                  <b data-testid="cli-item-nome">{c.nome}</b>{c.apelido && c.apelido !== c.nome ? <small className="muted"> “{c.apelido}”</small> : null}
                  <span className="cliente-linha"><Icone n="phone" size={14} /> {fmtTel(c.telefone)}</span>
                  {c.cpfMascarado ? <span className="cliente-linha muted">CPF {c.cpfMascarado}</span> : null}
                  {veiculos && c.veiculos.length > 0 && <ul className="lista-veiculos" data-testid={`cli-veiculos-${c.id}`}>{c.veiculos.map((v) => <li key={v.id}>{rotuloVeiculo(v)} <small className="muted">{ROTULO_PORTE[v.porte]}</small></li>)}</ul>}
                </div>
                <Btn tamanho="sm" onClick={() => abrir(c)} aria-label={`Editar ${c.nome}`} data-testid={`editar-${c.id}`}><Icone n="edit" size={15} /> Editar</Btn>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
