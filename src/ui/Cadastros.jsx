/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:48b7831473 */
import { proximoCodigo } from '../domain/codigo.js';
import React, { useState } from 'react';
import { clientes as apiCli, servicos as apiSrv, equipe as apiEq, demo, MODO_DEMO, modelos as apiMod, agenda, avisosDoUsuario, pedidosVinculoVisiveis } from '../services/api.js';
import { SECOES, SECOES_LIBERAVEIS, ehGestor, formatarCpf, formatarTelefone, papelRotulo, pode, podeAutorizarVinculo, ultimoAtendimento, ehDono } from '../domain/rules.js';
import { creditoDoCliente } from '../domain/financeiro.js';
import { CATEGORIAS, renderizar, validarModelo, variaveisDoCorpo } from '../domain/templates.js';
import { fmtDate, fmtDateTime, fmtDuration, fmtHM, fmtMoney } from '../domain/time.js';
import { LIMITE_VEICULOS, PORTES, ROTULO_PORTE, placaValida, rotuloVeiculo } from '../domain/veiculos.js';
import { Aviso, Avatar, Btn, Campo, Icon, Interruptor, Modal, Vazio } from './common.jsx';
import { FotoCampo } from './Foto.jsx';
import { fotoDeExemplo } from './imagem.js';
import { EditorNotificacoes, EditorPixCancelamento } from './Notif.jsx';
import { SeletorGrupo, rotuloGrupo } from './Grupo.jsx';
import { PainelEscala } from './Estabelecimento.jsx';
import { textoUltimo } from './format.js';
import { toast, useStore } from './hooks.js';
import Tabela from './Tabela.jsx';
import { capAtiva, rot, Rot, rots, voc, Voc } from '../domain/tipos.js';

const faixa = (obj, fmt) => { const v = PORTES.map((p) => obj?.[p]).filter((x) => Number.isFinite(x)); if (!v.length) return ''; const a = Math.min(...v), b = Math.max(...v); return a === b ? fmt(a) : `${fmt(a)} a ${fmt(b)}`; };
const faixaPreco = (s) => faixa(s.precos, fmtMoney) || fmtMoney(s.preco);
const faixaDuracao = (s) => (s.multiDia ? 'vários dias' : faixa(s.duracoes, fmtDuration) || fmtDuration(s.duracao));
const fmtNasc = (s) => (s ? fmtDate(new Date(`${s}T00:00`).getTime()) : '');

// ---------- Clientes ----------
export function Clientes({ user }) {
  const { state: st, agora } = useStore();
  const [busca, setBusca] = useState('');
  const [edit, setEdit] = useState(null);
  const q = busca.toLowerCase();
  const lista = st.clientes.filter((c) => !q || [c.nome, c.apelido, c.telefone, c.cpf, ...(c.veiculos || []).flatMap((v) => [v.placa, v.modelo])].some((v) => String(v || '').toLowerCase().includes(q) || String(v || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')));
  return (
    <section className="tela">
      <header className="tela-topo">
        <h1>Clientes</h1>
        <Btn variante="primario" icone="plus" onClick={() => setEdit({ nome: '', apelido: '', telefone: '', cpf: '', nascimento: '', ...(capAtiva('usaVeiculo') ? { veiculos: [] } : {}) })} data-testid="novo-cliente">Novo cliente</Btn>
      </header>
      <p className="muted">Os clientes se cadastram pelo WhatsApp. Aqui você consulta e corrige os dados.</p>
      <PedidosVinculo user={user} />
      <input className="busca" type="search" placeholder={capAtiva('usaVeiculo') ? 'Buscar por nome, telefone, CPF ou placa' : 'Buscar por nome, telefone ou CPF'} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
      {lista.length === 0 ? <Vazio icone="users" titulo="Nenhum cliente encontrado" /> : (
        <Tabela id="clientes" chave={(c) => c.id} linhas={lista} colunas={[
          { id: 'cliente', titulo: 'Cliente', cel: (c) => <><b>{c.nome}</b>{c.apelido && c.apelido !== c.nome ? <small className="muted"> “{c.apelido}”</small> : null}{creditoDoCliente(st, c.id, null, agora) > 0 ? <small className="muted" style={{ display: 'block' }} data-testid={`credito-${c.id}`}>Crédito: {fmtMoney(creditoDoCliente(st, c.id, null, agora))}</small> : null}</> },
          { id: 'telefone', titulo: 'Telefone', cel: (c) => <>{c.telefone}{c.telefonesAnteriores?.length ? <small className="muted" style={{ display: 'block' }}>antes: {c.telefonesAnteriores[c.telefonesAnteriores.length - 1].telefone}</small> : null}</> },
          ...(capAtiva('usaVeiculo') ? [{ id: 'veiculos', titulo: 'Veículos', cel: (c) => (c.veiculos || []).length ? <ul className="lista-veiculos" data-testid={`cli-veiculos-${c.id}`}>{c.veiculos.map((v) => <li key={v.id}>{rotuloVeiculo(v)} <small className="muted">{ROTULO_PORTE[v.porte]}</small></li>)}</ul> : <span className="muted">—</span> }] : []),
          { id: 'cpf', titulo: 'CPF', cel: (c) => c.cpf || <span className="muted">—</span> },
          { id: 'nascimento', titulo: 'Nascimento', cel: (c) => fmtNasc(c.nascimento) || <span className="muted">—</span> },
          { id: 'ultimo', titulo: 'Último atendimento', cel: (c) => { const u = ultimoAtendimento(st, c.id); return u.tipo === 'concluido' ? `${fmtDate(u.inicio)} · ${u.servicos}` : u.tipo === 'cancelado' ? `Cancelado: ${fmtDate(u.inicio)} ${fmtHM(u.inicio)}` : 'Primeiro atendimento'; } },
          { id: 'acoes', titulo: '', fixa: true, cel: (c) => <Btn tamanho="sm" icone="edit" onClick={() => setEdit(c)} aria-label={`Editar ${c.nome}`}>Editar</Btn> },
        ]} />
      )}
      {edit && <FormCliente c={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

// Cliente que mudou de número e informou o CPF de um cadastro existente: só o proprietário (ou admin com acesso a Clientes) libera.
function PedidosVinculo({ user }) {
  const { state: st } = useStore();
  const [alvo, setAlvo] = useState(null); // { p, aprovar }
  const [erro, setErro] = useState('');
  if (!podeAutorizarVinculo(user)) return null;
  const todos = pedidosVinculoVisiveis(st, user);
  const pendentes = todos.filter((p) => p.status === 'pendente');
  const decididos = todos.filter((p) => p.status !== 'pendente').slice(0, 5);
  if (!todos.length) return null;
  const confirmar = () => {
    const r = alvo.aprovar ? apiCli.aprovarVinculo(alvo.p.id) : apiCli.recusarVinculo(alvo.p.id);
    if (!r.ok) { setErro(r.erros[0]); return; }
    toast(alvo.aprovar ? 'Número vinculado ao cadastro.' : 'Pedido recusado.');
    setAlvo(null); setErro('');
  };
  return (
    <section className="conj" data-testid="pedidos-vinculo" aria-label="Pedidos de número novo">
      <h2 style={{ fontSize: '1rem', margin: 0 }}>Pedidos de número novo {pendentes.length > 0 && <i className="badge" data-testid="badge-vinculos">{pendentes.length}</i>}</h2>
      {pendentes.length === 0 && <p className="muted">Nenhum pedido pendente.</p>}
      <ul className="avisos-lista">
        {pendentes.map((p) => (
          <li key={p.id} data-testid={`vinculo-${p.id}`}>
            <Icon n="users" size={18} />
            <div>
              <p><b>{p.nome || 'Contato sem nome'}</b>, pelo número <b>{p.telefone}</b>, informou o CPF {p.cpf}, que é do cadastro de <b>{p.clienteNome}</b>, hoje com o número {p.telefoneAtual}.</p>
              <small className="muted">{fmtDateTime(p.em)} · Confirme com o cliente, de preferência pelo número antigo, antes de aprovar.</small>
            </div>
            <div className="acoes">
              <Btn tamanho="sm" variante="primario" onClick={() => { setErro(''); setAlvo({ p, aprovar: true }); }} data-testid={`aprovar-${p.id}`}>Aprovar</Btn>
              <Btn tamanho="sm" onClick={() => { setErro(''); setAlvo({ p, aprovar: false }); }} data-testid={`recusar-${p.id}`}>Recusar</Btn>
            </div>
          </li>
        ))}
      </ul>
      {decididos.length > 0 && (
        <details>
          <summary className="muted">Últimas respostas</summary>
          <ul className="avisos-lista">
            {decididos.map((p) => <li key={p.id} className="lido"><div><p>{p.status === 'aprovado' ? 'Aprovado' : 'Recusado'}: {p.telefone} em {p.clienteNome}</p><small className="muted">{p.decididoPor} · {fmtDateTime(p.decididoEm)}</small></div></li>)}
          </ul>
        </details>
      )}
      {alvo && (
        <Modal titulo={alvo.aprovar ? 'Vincular o número novo?' : 'Recusar o pedido?'} onClose={() => setAlvo(null)}
          rodape={<><Btn onClick={() => setAlvo(null)}>Voltar</Btn><Btn variante="primario" onClick={confirmar} data-testid="confirmar-vinculo">{alvo.aprovar ? 'Aprovar' : 'Recusar'}</Btn></>}>
          {alvo.aprovar
            ? <p>O telefone de <b>{alvo.p.clienteNome}</b> passa de {alvo.p.telefoneAtual} para <b>{alvo.p.telefone}</b>. Quem usa o número novo passa a ter acesso aos agendamentos e dados desse cadastro. O número antigo fica guardado no histórico.</p>
            : <p>O número {alvo.p.telefone} não será vinculado ao cadastro de <b>{alvo.p.clienteNome}</b>.</p>}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
        </Modal>
      )}
    </section>
  );
}

function FormCliente({ c, onClose }) {
  const [f, setF] = useState(c);
  const [erro, setErro] = useState('');
  const salvar = () => { const r = apiCli.salvar(f); if (!r.ok) { setErro(r.erros[0]); return; } toast('Cliente salvo.'); onClose(); };
  return (
    <Modal titulo={c.id ? 'Editar cliente' : 'Novo cliente'} onClose={onClose} rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-cliente">Salvar</Btn></>}>
      <div className="form-grade">
        <Campo rotulo="Nome ou apelido (obrigatório)"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="cli-nome" /></Campo>
        <Campo rotulo="Apelido"><input value={f.apelido || ''} onChange={(e) => setF({ ...f, apelido: e.target.value })} /></Campo>
        <Campo rotulo="Telefone (WhatsApp)"><input value={f.telefone} inputMode="tel" onChange={(e) => setF({ ...f, telefone: formatarTelefone(e.target.value) })} placeholder="(55) 99999-9999" data-testid="cli-tel" /></Campo>
        <Campo rotulo="CPF (opcional)"><input value={f.cpf || ''} inputMode="numeric" onChange={(e) => setF({ ...f, cpf: formatarCpf(e.target.value) })} /></Campo>
        <Campo rotulo="Nascimento (opcional)"><input type="date" value={f.nascimento || ''} onChange={(e) => setF({ ...f, nascimento: e.target.value })} /></Campo>
      </div>
      {capAtiva('usaVeiculo') && <fieldset className="conj" data-testid="cli-veiculos">
        <legend>Veículos</legend>
        <div className="veiculos-editor">
          {(f.veiculos || []).map((v, i) => {
            const mud = (k) => (e) => setF({ ...f, veiculos: f.veiculos.map((x, j) => (j === i ? { ...x, [k]: k === 'placa' ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) : e.target.value } : x)) });
            return (
              <div key={v.id || `novo-${i}`} className="veiculo-linha" data-testid={`cli-veiculo-${i}`}>
                <Campo rotulo="Placa" erro={v.placa && !placaValida(v.placa) ? 'Placa inválida' : undefined}><input value={v.placa || ''} onChange={mud('placa')} maxLength={8} autoComplete="off" placeholder="ABC1D23" data-testid={`cli-v-placa-${i}`} /></Campo>
                <Campo rotulo="Marca"><input value={v.marca || ''} onChange={mud('marca')} maxLength={30} autoComplete="off" data-testid={`cli-v-marca-${i}`} /></Campo>
                <Campo rotulo="Modelo"><input value={v.modelo || ''} onChange={mud('modelo')} maxLength={40} autoComplete="off" data-testid={`cli-v-modelo-${i}`} /></Campo>
                <Campo rotulo="Cor"><input value={v.cor || ''} onChange={mud('cor')} maxLength={20} autoComplete="off" data-testid={`cli-v-cor-${i}`} /></Campo>
                <Campo rotulo="Porte"><select value={v.porte || ''} onChange={mud('porte')} data-testid={`cli-v-porte-${i}`}><option value="">Escolha…</option>{PORTES.map((k) => <option key={k} value={k}>{ROTULO_PORTE[k]}</option>)}</select></Campo>
                <button type="button" className="icone-btn" onClick={() => setF({ ...f, veiculos: f.veiculos.filter((_, j) => j !== i) })} aria-label={`Remover veículo ${i + 1}`} data-testid={`cli-v-remover-${i}`}><Icon n="trash" size={16} /></button>
              </div>
            );
          })}
        </div>
        <Btn tamanho="sm" icone="plus" disabled={(f.veiculos || []).length >= LIMITE_VEICULOS} onClick={() => setF({ ...f, veiculos: [...(f.veiculos || []), { placa: '', marca: '', modelo: '', cor: '', porte: '' }] })} data-testid="cli-veiculo-add">Adicionar veículo</Btn>
        <p className="muted">O porte (pequeno, médio, grande, SUV, pickup) define o preço e o tempo dos serviços. Veículo com agendamento ativo não pode ser removido.</p>
      </fieldset>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

// ---------- Serviços ----------
export function Servicos({ user }) {
  const { state: st } = useStore();
  const [edit, setEdit] = useState(null);
  const podeEditar = pode(user, 'servicos');
  const novo = !capAtiva('precoPorPorte') ? { nome: '', preco: 40, duracao: 40, intervalo: 10, antecedenciaH: 2, notificacoes: null, confirmacaoServico: null, combo: false, componentes: [] } : { nome: '', categoria: '', precos: { pequeno: 60, medio: 70, grande: 80, suv: 90, pickup: 95 }, duracoes: { pequeno: 40, medio: 45, grande: 50, suv: 55, pickup: 60 }, multiDia: false, combo: false, componentes: [], intervalo: 10, antecedenciaH: 2, notificacoes: null, confirmacaoServico: null };
  return (
    <section className="tela">
      <header className="tela-topo">
        <h1>Serviços</h1>
        {podeEditar && <Btn variante="primario" icone="plus" onClick={() => setEdit(novo)} data-testid="novo-servico">Novo serviço</Btn>}
      </header>
      {!podeEditar && <Aviso>Somente o proprietário (ou um admin com permissão de serviços) altera os serviços.</Aviso>}
      <div className="grade-cards">
        {st.servicos.map((s) => (
          <article key={s.id} className={`card-serv ${s.ativo === false ? 'inativo' : ''}`}>
            <div className="card-serv-topo"><h3>{s.nome}</h3><b>{faixaPreco(s)}</b></div>
            <small className="muted cod" data-testid={`srv-cod-${s.id}`}>Código {s.codigo}{s.categoria ? ` · ${s.categoria}` : ''}</small>
            {(s.combo || s.multiDia) && <div className="acoes">{s.combo && <span className="chip chip-p">Combo</span>}{s.multiDia && <span className="chip chip-p st-ciano">Vários dias</span>}</div>}
            <ul className="meta">
              <li><Icon n="clock" size={14} /> {faixaDuracao(s)} + {fmtDuration(s.intervalo || 0)} de intervalo</li>
              {s.combo && <li><Icon n="list" size={14} /> Junta: {(s.componentes || []).map((id) => st.servicos.find((x) => x.id === id)?.nome).filter(Boolean).join(' + ')}</li>}
              <li><Icon n="calendar" size={14} /> {s.antecedenciaH ? `Agenda com ${s.antecedenciaH} h de antecedência` : 'Sem antecedência mínima'}</li>
              <li><Icon n="bell" size={14} /> {Array.isArray(s.notificacoes) ? `${s.notificacoes.length} notificações próprias` : 'Notificações do estabelecimento'}</li>
              {(s.materiais || []).length > 0 && <li><Icon n="list" size={14} /> {s.materiais.map((m) => { const mt = st.materiais.find((x) => x.id === m.materialId); return mt ? `${mt.nome} ${m.qtd} ${mt.unidade}` : ''; }).filter(Boolean).join(', ')}</li>}
              <li data-testid={`srv-grupo-${s.id}`}><Icon n="wallet" size={14} /> {(() => { const g = st.financeiro.grupos.find((x) => x.id === s.grupoMovimentacaoId); return g ? `Grupo: ${rotuloGrupo(st, g)}` : 'Grupo: o do estabelecimento'; })()}</li>
              <li><Icon n="check" size={14} /> {s.confirmacaoServico === null || s.confirmacaoServico === undefined ? `${Voc('confirmacao')}: padrão` : s.confirmacaoServico ? `Exige ${voc('confirmacao')}` : `Sem ${voc('confirmacao')}`}</li>
            </ul>
            {s.ativo === false && <span className="chip chip-p">Desativado</span>}
            {podeEditar && <Btn tamanho="sm" icone="edit" onClick={() => setEdit(s)} aria-label={`Editar ${s.nome}`}>Editar</Btn>}
          </article>
        ))}
      </div>
      {edit && <FormServico s={edit} user={user} onClose={() => setEdit(null)} />}
    </section>
  );
}

function FormServico({ s, user, onClose }) {
  const { state: st } = useStore();
  const [f, setF] = useState(s.id ? s : { ...s, codigo: proximoCodigo(st.servicos) }); // serviço novo já vem com o próximo código (dá para trocar)
  const [erro, setErro] = useState('');
  const proprias = Array.isArray(f.notificacoes);
  const salvar = () => { const r = apiSrv.salvar(f); if (!r.ok) { setErro(r.erros[0]); return; } toast('Serviço salvo.'); onClose(); };
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value === '' ? '' : Number(e.target.value) });
  return (
    <Modal titulo={s.id ? 'Editar serviço' : 'Novo serviço'} onClose={onClose} largura={680}
      rodape={<>{s.id && <Btn variante="perigo" icone="trash" onClick={() => { const r = apiSrv.remover(s.id); if (r.ok) { toast(r.desativado ? 'O serviço tem histórico e foi desativado.' : 'Serviço removido.'); onClose(); } }}>Remover</Btn>}<span className="espaco" /><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-servico">Salvar</Btn></>}>
      <div className="form-grade">
        <Campo rotulo="Nome do serviço" className="campo-largo"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="srv-nome" /></Campo>
        <Campo rotulo="Código" dica="Número automático; pode trocar. Não repete entre serviços."><input value={f.codigo ?? ''} maxLength={20} onChange={(e) => setF({ ...f, codigo: e.target.value })} data-testid="srv-codigo" /></Campo>
        <Campo rotulo="Categoria" dica={`Agrupa os serviços na página do cliente (ex.: ${voc('exemploCategorias')}).`}><input value={f.categoria || ''} maxLength={30} onChange={(e) => setF({ ...f, categoria: e.target.value })} list="srv-categorias" data-testid="srv-categoria" /><datalist id="srv-categorias">{[...new Set(st.servicos.map((x) => x.categoria).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist></Campo>
        {!capAtiva('precoPorPorte') ? <>
          <Campo rotulo="Preço (R$)"><input type="number" min="0" step="0.5" value={f.preco ?? ''} onChange={num('preco')} data-testid="srv-preco" /></Campo>
          <Campo rotulo="Duração (min)"><input type="number" min="5" step="5" value={f.duracao ?? ''} onChange={num('duracao')} data-testid="srv-dur" /></Campo>
        </> : <div className="campo-largo">
          <div className="tabela-portes" role="group" aria-labelledby="srv-portes-r" data-testid="srv-portes">
            <span className="campo-rotulo" id="srv-portes-r">Preço e duração por porte do veículo</span>
            <div className="porte-cab"><span>Porte</span><span>Preço (R$)</span><span>{f.multiDia ? 'Trabalho (min)' : 'Duração (min)'}</span></div>
            {PORTES.map((p) => (
              <div className="porte-linha" key={p}>
                <b>{ROTULO_PORTE[p]}</b>
                <input type="number" min="0" step="0.5" value={f.precos?.[p] ?? ''} onChange={(e) => setF({ ...f, precos: { ...f.precos, [p]: e.target.value === '' ? '' : Number(e.target.value) } })} aria-label={`Preço, porte ${ROTULO_PORTE[p]}`} data-testid={`srv-preco-${p}`} />
                <input type="number" min="5" step="5" value={f.duracoes?.[p] ?? ''} onChange={(e) => setF({ ...f, duracoes: { ...f.duracoes, [p]: e.target.value === '' ? '' : Number(e.target.value) } })} aria-label={`Duração, porte ${ROTULO_PORTE[p]}`} data-testid={`srv-dur-${p}`} />
              </div>
            ))}
          </div>
        </div>}
        {capAtiva('multiDia') && <div className="campo-largo"><Interruptor checked={!!f.multiDia} onChange={(v) => setF({ ...f, multiDia: v })} rotulo="Serviço de vários dias" descricao="O carro entra, fica no box e é retirado depois. A duração conta só o tempo de trabalho (ex.: 480 = um dia de 8 h); a retirada cai no último dia útil necessário." testid="srv-multidia" /></div>}
        <div className="campo-largo"><Interruptor checked={!!f.combo} onChange={(v) => setF({ ...f, combo: v, componentes: v ? f.componentes || [] : [] })} rotulo="Combo" descricao="Junta serviços comuns com preço e tempo próprios. Os materiais saem do estoque pelos serviços que o combo junta." testid="srv-combo" /></div>
        {f.combo && (
          <fieldset className="campo-largo conj" data-testid="srv-componentes">
            <legend>Serviços do combo (escolha de 2 a 10)</legend>
            <div className="servicos-coluna">
              {st.servicos.filter((x) => !x.combo && x.id !== f.id && (x.ativo !== false || (f.componentes || []).includes(x.id))).map((x) => {
                const on = (f.componentes || []).includes(x.id);
                return <label key={x.id} className={`servico-op ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => setF({ ...f, componentes: on ? f.componentes.filter((y) => y !== x.id) : [...(f.componentes || []), x.id] })} data-testid={`srv-comp-${x.id}`} /><span><b>{x.nome}</b></span></label>;
              })}
            </div>
          </fieldset>
        )}
        <Campo rotulo="Intervalo depois (min)" dica="Tempo de preparo antes do próximo cliente."><input type="number" min="0" step="5" value={f.intervalo} onChange={num('intervalo')} /></Campo>
        <Campo rotulo="Antecedência mínima (horas)" dica={`Vale para o cliente pelo WhatsApp, não para o ${rot('profissional')} no painel.`}><input type="number" min="0" value={f.antecedenciaH} onChange={num('antecedenciaH')} /></Campo>
        <div className="campo-largo"><SeletorGrupo st={st} valor={f.grupoMovimentacaoId} onChange={(v) => setF({ ...f, grupoMovimentacaoId: v })} padrao dica="A conta responsável pelo grupo recebe o Pix deste serviço." testid="srv-grupo" /></div>
        {ehDono(user) && <Campo rotulo={`Comissão do ${rot('profissional')} (%)`} dica={`Vazio = usar a geral do estabelecimento (${st.estabelecimento.comissaoPadrao ?? 50}%). Se o serviço tiver comissão própria, a do serviço vale.`}><input type="number" min="0" max="100" step="1" value={f.comissaoPct ?? ''} onChange={(e) => setF({ ...f, comissaoPct: e.target.value === '' ? null : Number(e.target.value) })} data-testid="srv-comissao" /></Campo>}
        <Campo rotulo={Voc('confirmacao')} className="campo-largo" dica="O serviço prevalece sobre a regra geral do estabelecimento.">
          <select value={f.confirmacaoServico === null || f.confirmacaoServico === undefined ? 'padrao' : f.confirmacaoServico ? 'sim' : 'nao'} onChange={(e) => setF({ ...f, confirmacaoServico: e.target.value === 'padrao' ? null : e.target.value === 'sim' })}>
            <option value="padrao">Seguir o estabelecimento ({st.estabelecimento.confirmacaoServico ? 'ativada' : 'desativada'})</option>
            <option value="sim">Exigir</option><option value="nao">Não exigir</option>
          </select>
        </Campo>
      </div>
      <fieldset className="conj">
        <legend>Notificações</legend>
        <div className="radios">
          <label className={`radio-op ${!proprias ? 'on' : ''}`}><input type="radio" name="nt" checked={!proprias} onChange={() => setF({ ...f, notificacoes: null, pixCancelamento: undefined })} />Usar as do estabelecimento</label>
          <label className={`radio-op ${proprias ? 'on' : ''}`}><input type="radio" name="nt" checked={proprias} onChange={() => setF({ ...f, notificacoes: st.estabelecimento.notificacoes.map((n) => ({ ...n })), pixCancelamento: st.estabelecimento.pixCancelamento ? { ...st.estabelecimento.pixCancelamento } : undefined })} data-testid="notif-proprias" />Personalizar para este serviço</label>
        </div>
        {proprias ? <><EditorNotificacoes lista={f.notificacoes} onChange={(l) => setF({ ...f, notificacoes: l })} /><EditorPixCancelamento valor={f.pixCancelamento} temAvisos={f.notificacoes.length > 0} onChange={(v) => setF({ ...f, pixCancelamento: v })} /></> : <p className="muted">{st.estabelecimento.notificacoes.length} notificações do estabelecimento. Ao personalizar, a lista do serviço substitui a do estabelecimento por completo.</p>}
      </fieldset>
      <fieldset className="conj">
        <legend>Materiais usados em cada atendimento</legend>
        <p className="muted">{f.combo ? 'Num combo, o consumo vem dos serviços que ele junta; o que for colocado aqui não é somado.' : voc('estoqueConsumo')}</p>
        <div className="servicos-coluna">
          {(f.materiais || []).map((m, i) => {
            const mat = st.materiais.find((x) => x.id === m.materialId);
            return (
              <div key={i} className="mat-linha">
                <select value={m.materialId} onChange={(e) => setF({ ...f, materiais: f.materiais.map((x, k) => (k === i ? { ...x, materialId: e.target.value } : x)) })} aria-label={`Material ${i + 1}`}>
                  <option value="">Escolha o material…</option>
                  {st.materiais.filter((x) => x.tipo !== 'produto' && (x.ativo !== false || x.id === m.materialId)).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
                <span className="moeda"><input type="number" min="0" step="any" value={m.qtd} onChange={(e) => setF({ ...f, materiais: f.materiais.map((x, k) => (k === i ? { ...x, qtd: e.target.value } : x)) })} aria-label={`Quantidade do material ${i + 1}`} /><i>{mat ? mat.unidade : 'un'}</i></span>
                <button type="button" className="icone-btn" onClick={() => setF({ ...f, materiais: f.materiais.filter((_, k) => k !== i) })} aria-label={`Remover material ${i + 1}`}><Icon n="trash" size={16} /></button>
              </div>
            );
          })}
        </div>
        <Btn tamanho="sm" icone="plus" onClick={() => setF({ ...f, materiais: [...(f.materiais || []), { materialId: '', qtd: 1 }] })} disabled={!st.materiais.some((x) => x.tipo !== 'produto')} data-testid="add-material">Adicionar material</Btn>
        {st.materiais.length === 0 && <p className="muted">Cadastre materiais primeiro, na tela Estoque.</p>}
      </fieldset>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

// ---------- Equipe ----------
export function Equipe({ user }) {
  const { state: st } = useStore();
  const [edit, setEdit] = useState(null);
  const [escala, setEscala] = useState(null);
  const novo = { nome: '', apelido: '', cpf: '', email: '', telefone: '', senha: '', papel: 'profissional', permissoes: {}, atende: true, podeVender: true };
  return (
    <section className="tela">
      <header className="tela-topo">
        <h1>Equipe</h1>
        <div className="acoes">
          {MODO_DEMO && ehDono(user) && <Btn icone="users" onClick={() => { const r = demo.profissionaisExemplo(Array.from({ length: 12 }, (_, i) => (i % 3 === 2 ? null : fotoDeExemplo(i)))); if (r.ok) toast(r.criados ? `${r.criados} ${rots('profissional')} de exemplo adicionados, com horários em ${fmtDate(r.dia)}. Vá para a Agenda.` : `Os ${rots('profissional')} de exemplo já foram adicionados.`); else toast(r.erros[0], 'erro'); }} data-testid="profissionais-exemplo">Adicionar 12 {rots('profissional')} de exemplo</Btn>}
          <Btn variante="primario" icone="plus" onClick={() => setEdit(novo)} data-testid="novo-usuario">Novo usuário</Btn>
        </div>
      </header>
      <p className="muted">Proprietários, admins e {rots('profissional')} usam o mesmo cadastro. O que muda é a permissão.</p>
      <div className="grade-cards">
        {st.usuarios.map((u) => (
          <article key={u.id} className={`card-serv ${u.atende ? "" : "inativo"}`}>
            <div className="card-serv-topo"><div className="pessoa"><Avatar nome={u.apelido || u.nome} foto={u.foto} chave={u.id} /><div><h3>{u.nome}</h3><span className="muted">{u.email}</span></div></div><span className="chip chip-p">{papelRotulo(u)}</span></div>
            <ul className="meta">
              <li><Icon n="phone" size={14} /> {u.telefone}</li>
              <li><Icon n="scissors" size={14} /> {u.atende ? 'Atende clientes' : 'Desativado: não recebe novos agendamentos'}</li>
              {u.papel !== 'dono' && u.papel !== 'master' && <li data-testid={`acessos-${u.id}`}><Icon n="key" size={14} /> {SECOES_LIBERAVEIS.filter((k) => pode(u, k)).map((k) => SECOES[k]).join(', ') || 'Sem acesso a menus'}</li>}
            </ul>
            <div className="acoes">
              <Btn tamanho="sm" icone="edit" onClick={() => setEdit(u)} aria-label={`Editar ${u.nome}`}>Editar</Btn>
              {u.atende && <Btn tamanho="sm" icone="calendar" onClick={() => setEscala(u)}>Escala</Btn>}
              {u.atende
                ? <Btn tamanho="sm" onClick={() => { const r = apiEq.definirAtendimento(u.id, false); if (r.ok) toast(`${u.apelido || u.nome} desativado. O histórico foi mantido.`); else toast(r.erros[0], 'erro'); }} data-testid={`desativar-${u.id}`}>Desativar</Btn>
                : <Btn tamanho="sm" onClick={() => { apiEq.definirAtendimento(u.id, true); toast(`${u.apelido || u.nome} voltou a atender.`); }} data-testid={`reativar-${u.id}`}>Reativar</Btn>}
            </div>
          </article>
        ))}
      </div>
      {edit && <FormUsuario u={edit} user={user} onClose={() => setEdit(null)} />}
      {escala && <Modal titulo={`Escala de ${escala.apelido || escala.nome}`} onClose={() => setEscala(null)} largura={760}><PainelEscala escopo={escala.id} /></Modal>}
    </section>
  );
}

function FormUsuario({ u, user, onClose }) {
  const { sessao } = useStore();
  const [f, setF] = useState({ ...u, senha: '' });
  const [erro, setErro] = useState('');
  const salvar = () => { const r = apiEq.salvar(f); if (!r.ok) { setErro(r.erros[0]); return; } toast('Usuário salvo.'); onClose(); };
  const ehMaster = u.papel === 'master';
  return (
    <Modal titulo={u.id ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} largura={640}
      rodape={<>{u.id && u.id !== sessao && <Btn variante="perigo" icone="trash" onClick={() => { const r = apiEq.remover(u.id); if (r.ok) { toast(r.desativado ? 'Usuário com histórico: foi desativado.' : 'Usuário removido.'); onClose(); } else setErro(r.erros[0]); }}>Remover</Btn>}<span className="espaco" /><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-usuario">Salvar</Btn></>}>
      <div className="form-grade">
        <Campo rotulo="Foto" className="campo-largo"><FotoCampo valor={f.foto} nome={f.apelido || f.nome} chave={f.id} onChange={(foto) => setF({ ...f, foto })} testid="usr-foto" /></Campo>
        <Campo rotulo="Nome completo"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="usr-nome" /></Campo>
        <Campo rotulo="Apelido (usado no login)"><input value={f.apelido} onChange={(e) => setF({ ...f, apelido: e.target.value })} data-testid="usr-apelido" /></Campo>
        <Campo rotulo="CPF"><input value={f.cpf} inputMode="numeric" onChange={(e) => setF({ ...f, cpf: formatarCpf(e.target.value) })} data-testid="usr-cpf" /></Campo>
        <Campo rotulo="Telefone"><input value={f.telefone} inputMode="tel" onChange={(e) => setF({ ...f, telefone: formatarTelefone(e.target.value) })} /></Campo>
        {ehDono(user) && f.papel === 'profissional' && <Campo rotulo="Comissão sobre serviços (%)" dica={`Vazio = usar a geral do estabelecimento. Se o serviço tiver comissão própria, a do serviço vale (ordem: estabelecimento, ${rot('profissional')}, serviço).`}><input type="number" min="0" max="100" step="1" value={f.comissaoPct ?? ''} onChange={(e) => setF({ ...f, comissaoPct: e.target.value === '' ? null : Number(e.target.value) })} data-testid="usr-comissao" /></Campo>}
        {ehDono(user) && f.podeVender !== false && <Campo rotulo="Comissão sobre produtos (%)" dica="Vazio = sem comissão sobre produtos, a menos que o produto tenha a sua (a do produto vale sobre a da pessoa)."><input type="number" min="0" max="100" step="1" value={f.comissaoProdutoPct ?? ''} onChange={(e) => setF({ ...f, comissaoProdutoPct: e.target.value === '' ? null : Number(e.target.value) })} data-testid="usr-comissao-produto" /></Campo>}
        <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="usr-email" /></Campo>
        <Campo rotulo={u.id ? 'Nova senha (deixe vazio para manter)' : 'Senha'}><input type="password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} autoComplete="new-password" data-testid="usr-senha" /></Campo>
        <Campo rotulo="Perfil" className="campo-largo">
          <select value={f.papel} disabled={ehMaster} onChange={(e) => setF({ ...f, papel: e.target.value, atende: ehGestor({ papel: e.target.value }) ? false : f.atende, permissoes: {} })} data-testid="usr-papel">
            <option value="profissional">{Rot('profissional')}: vê só a própria agenda</option>
            <option value="atendente">Atendente: agenda e cadastros, sem relatórios</option>
            <option value="admin">Admin: começa sem acesso, você libera abaixo</option>
            <option value="dono">Proprietário: acesso total</option>
            {ehMaster && <option value="master">Master: acesso total, só de IP reservado</option>}
          </select>
        </Campo>
        {f.papel !== 'dono' && f.papel !== 'master' && (
          <fieldset className="campo-largo conj" data-testid="usr-acessos"><legend>Menus que esta pessoa acessa</legend>
            <div className="servicos-lista">{SECOES_LIBERAVEIS.map((k) => {
              const liberado = pode({ papel: f.papel, permissoes: f.permissoes }, k);
              return (
                <label key={k} className={`servico-op ${liberado ? 'on' : ''}`}><input type="checkbox" checked={liberado} onChange={(e) => setF({ ...f, permissoes: { ...f.permissoes, [k]: e.target.checked } })} data-testid={`acesso-${k}`} /><span><b>{SECOES[k]}</b></span></label>
              );
            })}</div>
            <p className="muted">Relatórios é só do proprietário.{f.papel === 'profissional' ? ` O ${rot('profissional')} vê os próprios números.` : ''}</p>
          </fieldset>
        )}
        <div className="campo-largo"><Interruptor checked={!!f.atende} onChange={(v) => setF({ ...f, atende: v })} rotulo="Atende clientes" descricao={`O proprietário pode atuar como ${rot('profissional')}. Para desativar, não pode haver agendamentos futuros. O histórico é mantido.`} /></div>
        <div className="campo-largo"><Interruptor checked={f.podeVender !== false} onChange={(v) => setF({ ...f, podeVender: v })} rotulo="Pode vender produtos" descricao="Quem pode aparecer como vendedor e ganhar a comissão do produto." id="usr-pode-vender" /></div>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

export function MinhaEscala({ user }) {
  return (
    <section className="tela">
      <header className="tela-topo"><h1>Minha escala</h1></header>
      <div className="painel">
        <h3>Minha foto</h3>
        <FotoCampo valor={user.foto} nome={user.apelido || user.nome} chave={user.id} testid="minha-foto"
          onChange={(foto) => { const r = apiEq.minhaFoto(foto); if (r.ok) toast(foto ? 'Foto salva.' : 'Foto removida.'); else toast(r.erros[0], 'erro'); }} />
      </div>
      <div className="painel"><PainelEscala escopo={user.id} /></div>
    </section>
  );
}

// ---------- Mensagens (modelos no formato Meta) ----------
export function Modelos({ user }) {
  const { state: st } = useStore();
  const [edit, setEdit] = useState(null);
  const podeEditar = pode(user, 'estabelecimento');
  return (
    <section className="tela">
      <header className="tela-topo">
        <h1>Mensagens</h1>
        {podeEditar && <Btn variante="primario" icone="plus" onClick={() => setEdit({ nome: '', corpo: '', botoes: [], categoria: 'Utilidade', variaveis: [] })} data-testid="novo-modelo">Novo modelo</Btn>}
      </header>
      {!podeEditar && <Aviso>Os modelos de mensagem vão para todos os clientes. Somente o proprietário (ou um admin com permissão de estabelecimento) cria ou altera.</Aviso>}
      <p className="muted">Modelos de mensagem no formato do WhatsApp Business (Meta): variáveis numeradas como {'{{1}}'}, categoria e botões. Cada modelo novo precisa de aprovação da Meta antes de ser usado de verdade.</p>
      <div className="grade-cards">
        {st.modelos.map((m) => (
          <article key={m.id} className="card-serv">
            <div className="card-serv-topo"><h3>{m.nome}</h3><span className="chip chip-p">{m.sistema ? 'Automático' : m.aprovacao || 'Aprovado'}</span></div>
            <div className="balao-previa"><p>{m.corpo}</p>{m.botoes.length > 0 && <div className="balao-botoes">{m.botoes.map((b) => <span key={b}>{b}</span>)}</div>}</div>
            <p className="muted"><small>{m.categoria} · {m.idioma} · {variaveisDoCorpo(m.corpo).length ? m.variaveis.map((v, i) => `{{${i + 1}}} ${v}`).join(', ') : 'sem variáveis'}</small></p>
            <Btn tamanho="sm" icone="edit" onClick={() => setEdit(m)} aria-label={`Editar ${m.nome}`}>{m.sistema || !podeEditar ? 'Ver' : 'Editar'}</Btn>
          </article>
        ))}
      </div>
      {edit && <FormModelo m={edit} onClose={() => setEdit(null)} somenteLeitura={!podeEditar} />}
    </section>
  );
}

function FormModelo({ m, onClose, somenteLeitura = false }) {
  const [f, setF] = useState(m);
  const [erro, setErro] = useState('');
  const [botao, setBotao] = useState('');
  const so = !!m.sistema || somenteLeitura;
  const problemas = f.corpo ? validarModelo(f.corpo) : [];
  const n = [...new Set(variaveisDoCorpo(f.corpo))].length;
  const salvar = () => { const r = apiMod.salvar(f); if (!r.ok) { setErro(r.erros.join(' ')); return; } toast('Modelo salvo.'); onClose(); };
  return (
    <Modal titulo={so ? m.nome : m.id ? 'Editar modelo' : 'Novo modelo'} onClose={onClose} largura={640}
      rodape={<>{m.id && !so && <Btn variante="perigo" icone="trash" onClick={() => { apiMod.remover(m.id); onClose(); }}>Remover</Btn>}<span className="espaco" /><Btn onClick={onClose}>{so ? 'Fechar' : 'Cancelar'}</Btn>{!so && <Btn variante="primario" onClick={salvar} data-testid="salvar-modelo">Salvar</Btn>}</>}>
      {so && <Aviso>Este modelo é usado pelo sistema. Você pode ler o texto, mas ele não é editável.</Aviso>}
      <div className="form-grade">
        <Campo rotulo="Nome do modelo" className="campo-largo"><input value={f.nome} disabled={so} onChange={(e) => setF({ ...f, nome: e.target.value })} data-testid="mod-nome" /></Campo>
        <Campo rotulo="Texto da mensagem" className="campo-largo" dica="Use {{1}}, {{2}}… para dados que mudam. O texto não pode começar nem terminar com variável." erro={problemas[0]}>
          <textarea rows={4} value={f.corpo} disabled={so} onChange={(e) => setF({ ...f, corpo: e.target.value })} data-testid="mod-corpo" />
        </Campo>
        {n > 0 && !so && Array.from({ length: n }, (_, i) => (
          <Campo key={i} rotulo={`O que é {{${i + 1}}}?`}><input value={f.variaveis?.[i] || ''} onChange={(e) => { const v = [...(f.variaveis || [])]; v[i] = e.target.value; setF({ ...f, variaveis: v }); }} placeholder="Ex.: Nome do cliente" /></Campo>
        ))}
        <Campo rotulo="Categoria"><select value={f.categoria} disabled={so} onChange={(e) => setF({ ...f, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <div className="campo">
          <span className="campo-rotulo">Botões de resposta rápida</span>
          <div className="ddds">{f.botoes.map((b) => <span key={b} className="chip">{b}{!so && <button type="button" className="icone-btn" onClick={() => setF({ ...f, botoes: f.botoes.filter((x) => x !== b) })} aria-label={`Remover ${b}`}><Icon n="x" size={12} /></button>}</span>)}</div>
          {!so && f.botoes.length < 3 && <div className="linha-campos"><input value={botao} maxLength={25} onChange={(e) => setBotao(e.target.value)} placeholder="Ex.: Remarcar" aria-label="Novo botão" /><Btn tamanho="sm" onClick={() => { if (botao.trim()) { setF({ ...f, botoes: [...f.botoes, botao.trim()] }); setBotao(''); } }}>Adicionar</Btn></div>}
        </div>
      </div>
      {f.corpo && (
        <div className="campo-largo"><span className="campo-rotulo">Prévia</span>
          <div className="balao-previa"><p>{renderizar(f, Array.from({ length: n }, (_, i) => ['Marcelo', 'Lavagem detalhada', 'Pablo', '15/10/2026', '10:00'][i] || `exemplo ${i + 1}`))}</p>{f.botoes.length > 0 && <div className="balao-botoes">{f.botoes.map((b) => <span key={b}>{b}</span>)}</div>}</div>
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

// ---------- Avisos do painel ----------
export function Avisos({ user, onAbrir }) {
  const { state: st } = useStore();
  const lista = avisosDoUsuario(st, user);
  return (
    <section className="tela">
      <header className="tela-topo"><h1>Avisos</h1></header>
      <p className="muted">Mensagens automáticas do sistema, como agendamentos que chegaram ao horário sem confirmação. O histórico fica guardado.</p>
      {lista.length === 0 ? <Vazio icone="bell" titulo="Nenhum aviso" texto="Quando um cliente não confirmar o horário, o aviso aparece aqui." /> : (
        <ul className="avisos-lista">
          {lista.map((a) => (
            <li key={a.id} className={a.lido ? 'lido' : ''}>
              <Icon n="alert" size={18} />
              <div><p>{a.texto}</p><small className="muted">{fmtDateTime(a.em)}</small></div>
              <div className="acoes">
                {a.agendamentoId && <Btn tamanho="sm" onClick={() => onAbrir(a.agendamentoId)}>Abrir agendamento</Btn>}
                {!a.lido && <Btn tamanho="sm" onClick={() => agenda.marcarAvisoLido(a.id)}>Marcar como lido</Btn>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
