/* © 2026 Marcelo — Agendz. Todos os direitos reservados. Uso, cópia ou redistribuição só com autorização por escrito. ref:ab02f7af24 */
import { proximoCodigo } from '../domain/codigo.js';
import React, { useState } from 'react';
import { estoque as apiEst } from '../services/api.js';
import { relatorioEstoque, statusEstoque } from '../domain/reports.js';
import { fmtDateTime, fmtMoney, monthStart } from '../domain/time.js';
import { Abas, Aviso, Btn, Campo, Icon, Modal, Vazio } from './common.jsx';
import { NavMes } from './Relatorios.jsx';
import { nomeCliente } from './format.js';
import { toast, useStore } from './hooks.js';
import { ehDono } from '../domain/rules.js';
import { SeletorGrupo } from './Grupo.jsx';
import Tabela from './Tabela.jsx';
import { voc } from '../domain/tipos.js';

export const fmtQtd = (n) => String(Number(Number(n).toFixed(3))).replace('.', ',');
const ROT = { ok: 'Em dia', baixo: 'Abaixo do mínimo', zerado: 'Zerado', negativo: 'Negativo' };
const Selo = ({ m }) => { const k = statusEstoque(m); return <span className={`chip chip-p chip-nivel-${k}`}>{ROT[k]}</span>; };

function FormMaterial({ m, user, onClose }) {
  const { state: st } = useStore();
  const proximo = () => proximoCodigo(st.materiais.filter((x) => x.tipo === 'produto'));
  const [f, setF] = useState(() => { const base = { unidade: 'un', minimo: 0, custo: 0, estoque: 0, tipo: 'material', preco: 0, ...m }; return !m.id && base.tipo === 'produto' && !base.codigo ? { ...base, codigo: proximo() } : base; }); // produto novo já vem com o próximo código
  const [erro, setErro] = useState('');
  const salvar = () => { const r = apiEst.salvarMaterial(f); if (!r.ok) { setErro(r.erros[0]); return; } toast(f.tipo === 'produto' ? 'Produto salvo.' : 'Material salvo.'); onClose(); };
  return (
    <Modal titulo={`${m.id ? 'Editar' : 'Novo'} ${f.tipo === 'produto' ? 'produto' : 'material'}`} onClose={onClose} largura={520}
      rodape={<>{m.id && <Btn variante="perigo" icone="trash" onClick={() => { const r = apiEst.removerMaterial(m.id); if (r.ok) { toast(r.desativado ? 'Material com histórico ou em uso: foi desativado.' : 'Material removido.'); onClose(); } }}>Remover</Btn>}<span className="espaco" /><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-material">Salvar</Btn></>}>
      <div className="form-grade">
        <Campo rotulo="Nome do material" className="campo-largo"><input value={f.nome || ''} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder={`Ex.: ${voc('exemploMaterial')}`} data-testid="mat-nome" /></Campo>
        <Campo rotulo="Tipo" className="campo-largo" dica={voc('materialDica')}>
          <select value={f.tipo || 'material'} onChange={(e) => setF({ ...f, tipo: e.target.value, codigo: e.target.value === 'produto' && !m.id && !f.codigo ? proximo() : f.codigo })} data-testid="mat-tipo"><option value="material">Material (uso nos serviços)</option><option value="produto">Produto (venda)</option></select>
        </Campo>
        {f.tipo === 'produto' && <Campo rotulo="Código" dica="Número automático; pode trocar. Não repete entre produtos."><input value={f.codigo ?? ''} maxLength={20} onChange={(e) => setF({ ...f, codigo: e.target.value })} data-testid="mat-codigo" /></Campo>}
        {f.tipo === 'produto' && <Campo rotulo="Preço de venda (R$)"><input type="number" min="0" step="0.5" value={f.preco ?? 0} onChange={(e) => setF({ ...f, preco: e.target.value })} data-testid="mat-preco" /></Campo>}
        {f.tipo === 'produto' && ehDono(user) && (() => { const pct = Number(f.comissaoPct) || 0; const valido = pct >= 0 && pct <= 100; return (
          <Campo rotulo="Comissão do vendedor (%)" dica={!(pct > 0) ? 'Vazio ou 0: o produto não gera comissão.' : valido ? undefined : 'O percentual vai de 0 a 100.'}>
            <input type="number" min="0" max="100" step="0.5" value={f.comissaoPct ?? ''} onChange={(e) => setF({ ...f, comissaoPct: e.target.value === '' ? null : e.target.value })} data-testid="mat-comissao" />
            {pct > 0 && valido && <span className="msg-ok" data-testid="mat-comissao-reais">= {fmtMoney((Number(f.preco) || 0) * pct / 100)} por unidade vendida</span>}
          </Campo>); })()}
        {f.tipo === 'produto' && <div className="campo-largo"><SeletorGrupo st={st} valor={f.grupoMovimentacaoId} onChange={(v) => setF({ ...f, grupoMovimentacaoId: v })} padrao dica="A conta responsável pelo grupo recebe a venda deste produto. Vazio: o grupo padrão do estabelecimento." testid="mat-grupo" /></div>}
        <Campo rotulo="Unidade"><select value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })}><option value="un">Unidade (un)</option><option value="g">Gramas (g)</option><option value="ml">Mililitros (ml)</option><option value="kg">Quilos (kg)</option><option value="l">Litros (l)</option></select></Campo>
        <Campo rotulo="Estoque mínimo" dica="Abaixo disso o material aparece em alerta."><input type="number" min="0" step="any" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} /></Campo>
        <Campo rotulo="Custo por unidade (R$)" dica="Usado para calcular o custo de materiais."><input type="number" min="0" step="any" value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} /></Campo>
        {!m.id && <Campo rotulo="Estoque inicial"><input type="number" min="0" step="any" value={f.estoque} onChange={(e) => setF({ ...f, estoque: e.target.value })} data-testid="mat-estoque" /></Campo>}
      </div>
      {m.id && <p className="muted">Para mudar o saldo, use Entrada ou Ajustar. Assim o histórico fica registrado.</p>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

function FormMov({ m, tipo, onClose }) {
  const [qtd, setQtd] = useState(tipo === 'ajuste' ? String(m.estoque) : '');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const salvar = () => { const r = apiEst.movimentar({ materialId: m.id, tipo, qtd, obs }); if (!r.ok) { setErro(r.erros[0]); return; } toast(tipo === 'entrada' ? 'Entrada registrada.' : 'Saldo ajustado.'); onClose(); };
  return (
    <Modal titulo={tipo === 'entrada' ? `Entrada de ${m.nome}` : `Ajustar saldo de ${m.nome}`} sub={`Saldo atual: ${fmtQtd(m.estoque)} ${m.unidade}`} onClose={onClose} largura={440}
      rodape={<><Btn onClick={onClose}>Cancelar</Btn><Btn variante="primario" onClick={salvar} data-testid="salvar-mov">Registrar</Btn></>}>
      <div className="form-grade um">
        <Campo rotulo={tipo === 'entrada' ? `Quantidade comprada (${m.unidade})` : `Novo saldo contado (${m.unidade})`}><input type="number" min="0" step="any" value={qtd} onChange={(e) => setQtd(e.target.value)} data-testid="mov-qtd" /></Campo>
        <Campo rotulo="Observação (opcional)"><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder={tipo === 'entrada' ? 'Ex.: compra no fornecedor' : 'Ex.: contagem do mês'} /></Campo>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </Modal>
  );
}

export default function Estoque({ user }) {
  const { state: st, agora } = useStore();
  const [aba, setAba] = useState('materiais');
  const [mes, setMes] = useState(() => monthStart(agora));
  const [edit, setEdit] = useState(null);
  const [mov, setMov] = useState(null);
  const rel = relatorioEstoque(st, { mesTs: mes });
  const alerta = st.materiais.filter((m) => m.ativo !== false && statusEstoque(m) !== 'ok');
  const mat = (id) => st.materiais.find((m) => m.id === id);
  return (
    <section className="tela">
      <header className="tela-topo">
        <h1>Estoque</h1>
        <Btn icone="plus" onClick={() => setEdit({ nome: '', tipo: 'produto' })} data-testid="novo-produto">Novo produto</Btn>
        <Btn variante="primario" icone="plus" onClick={() => setEdit({ nome: '' })} data-testid="novo-material">Novo material</Btn>
      </header>
      <p className="muted">{voc('estoqueCadastre')}</p>
      <Abas valor={aba} onChange={setAba} ordem="estoque" itens={[['materiais', 'Materiais'], ['relatorio', 'Relatório de estoque']]} />

      {aba === 'materiais' && (
        <>
          {alerta.length > 0 && <Aviso tipo="erro" icone="alert"><b>Repor:</b> {alerta.map((m) => `${m.nome} (${fmtQtd(m.estoque)} ${m.unidade})`).join(', ')}.</Aviso>}
          {st.materiais.length === 0 ? <Vazio icone="list" titulo="Nenhum material cadastrado" /> : (
            <Tabela id="materiais" testid="tabela-materiais" chave={(m) => m.id} linhas={st.materiais} linhaProps={(m) => (m.ativo === false ? { style: { opacity: 0.55 } } : {})} colunas={[
              { id: 'material', titulo: 'Material', cel: (m) => <><b>{m.nome}</b>{m.tipo === 'produto' && <small className="muted"> produto · cód. {m.codigo} · {fmtMoney(m.preco)}{m.comissaoPct > 0 ? ` · comissão ${m.comissaoPct}%` : ''}</small>}{m.ativo === false && <small className="muted"> desativado</small>}</> },
              { id: 'saldo', titulo: 'Saldo', cls: 'num', cel: (m) => <><b data-testid={`saldo-${m.id}`}>{fmtQtd(m.estoque)}</b> <small className="muted">{m.unidade}</small></> },
              { id: 'minimo', titulo: 'Mínimo', cls: 'num', cel: (m) => <>{fmtQtd(m.minimo)} <small className="muted">{m.unidade}</small></> },
              { id: 'custo', titulo: 'Custo un.', cls: 'num', cel: (m) => fmtMoney(m.custo) },
              { id: 'situacao', titulo: 'Situação', cel: (m) => <Selo m={m} /> },
              { id: 'acoes', titulo: '', fixa: true, cel: (m) => <div className="acoes"><Btn tamanho="sm" icone="plus" onClick={() => setMov({ m, tipo: 'entrada' })} aria-label={`Entrada de ${m.nome}`} data-testid={`entrada-${m.id}`}>Entrada</Btn><Btn tamanho="sm" onClick={() => setMov({ m, tipo: 'ajuste' })} aria-label={`Ajustar ${m.nome}`}>Ajustar</Btn><Btn tamanho="sm" icone="edit" onClick={() => setEdit(m)} aria-label={`Editar ${m.nome}`}>Editar</Btn></div> },
            ]} />
          )}
        </>
      )}

      {aba === 'relatorio' && (
        <>
          <NavMes mes={mes} setMes={setMes} agora={agora} />
          <div className="tiles">
            <div className="tile"><small>Materiais para repor</small><b>{rel.alertas.length}</b></div>
            <div className="tile"><small>Custo do consumo no mês</small><b>{fmtMoney(rel.custoConsumoTotal)}</b></div>
            <div className="tile"><small>Valor em estoque hoje</small><b>{fmtMoney(rel.valorTotalEstoque)}</b></div>
          </div>
          <h3>Movimento por material</h3>
          <Tabela id="rel-estoque" testid="rel-estoque" chave={(i) => i.m.id} linhas={rel.itens} colunas={[
            { id: 'material', titulo: 'Material', cel: (i) => <b>{i.m.nome}</b> },
            { id: 'entradas', titulo: 'Entradas', cls: 'num', cel: (i) => <>{fmtQtd(i.entradas)} <small className="muted">{i.m.unidade}</small></> },
            { id: 'consumo', titulo: 'Consumo', cls: 'num', cel: (i) => <>{fmtQtd(i.consumo)} <small className="muted">{i.m.unidade}</small></> },
            { id: 'ajustes', titulo: 'Ajustes', cls: 'num', cel: (i) => <>{i.ajustes > 0 ? '+' : ''}{fmtQtd(i.ajustes)}</> },
            { id: 'custo', titulo: 'Custo do consumo', cls: 'num', cel: (i) => fmtMoney(i.custoConsumo) },
            { id: 'saldo', titulo: 'Saldo atual', cls: 'num', cel: (i) => <><b>{fmtQtd(i.m.estoque)}</b> <small className="muted">{i.m.unidade}</small></> },
            { id: 'situacao', titulo: 'Situação', cel: (i) => <Selo m={i.m} /> },
          ]} rodape={{ rotulo: 'Total', celulas: { custo: fmtMoney(rel.custoConsumoTotal) } }} />
          <h3>Movimentações do mês</h3>
          {rel.movimentos.length === 0 ? <p className="muted">Nenhuma movimentação neste mês.</p> : (
            <Tabela id="mov-estoque" chave={(x) => x.id} linhas={rel.movimentos.slice(0, 80)} colunas={[
              { id: 'quando', titulo: 'Quando', cel: (x) => fmtDateTime(x.em) },
              { id: 'material', titulo: 'Material', cel: (x) => mat(x.materialId)?.nome },
              { id: 'quantidade', titulo: 'Quantidade', cls: 'num', clsCel: (x) => (x.delta < 0 ? 'est-zerado' : 'est-ok'), cel: (x) => <>{x.delta > 0 ? '+' : ''}{fmtQtd(x.delta)} <small className="muted">{mat(x.materialId)?.unidade}</small></> },
              { id: 'saldo', titulo: 'Saldo após', cls: 'num', cel: (x) => (x.saldo !== undefined ? fmtQtd(x.saldo) : '—') },
              { id: 'origem', titulo: 'Origem', cel: (x) => { const a = x.agendamentoId ? st.agendamentos.find((y) => y.id === x.agendamentoId) : null; return <>{a ? `Atendimento de ${nomeCliente(st, a)}` : x.obs}{a && x.delta > 0 ? ' (estorno)' : ''}</>; } },
            ]} />
          )}
        </>
      )}
      {edit && <FormMaterial m={edit} user={user} onClose={() => setEdit(null)} />}
      {mov && <FormMov m={mov.m} tipo={mov.tipo} onClose={() => setMov(null)} />}
    </section>
  );
}
